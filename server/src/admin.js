import { randomUUID } from 'node:crypto'
import { withTransaction } from './db.js'

function httpError(message, status = 400) {
  const error = new Error(message)
  error.status = status
  return error
}

export function requireAdmin(request) {
  const expected = process.env.ADMIN_API_KEY
  if (!expected) throw httpError('ADMIN_API_KEY is not configured on the server.', 503)
  if (request.headers['x-admin-key'] !== expected) throw httpError('Organizer access denied.', 401)
}

export async function adminOverview(pool) {
  const [occurrences, forms, registrations] = await Promise.all([
    pool.query(`
      SELECT o.id, s.slug AS "eventId", s.title, s.category, o.starts_at AS "startsAt", o.status,
             o.capacity, o.location, COUNT(r.id)::int AS "registrationCount",
             COUNT(r.id) FILTER (WHERE r.status = 'confirmed')::int AS "confirmedCount",
             COALESCE(SUM(r.total_amount_minor) FILTER (WHERE r.status = 'confirmed'), 0)::bigint AS "confirmedRevenueMinor"
      FROM event_occurrences o
      JOIN event_series s ON s.id = o.event_series_id
      LEFT JOIN registrations r ON r.occurrence_id = o.id AND r.status NOT IN ('cancelled', 'expired')
      GROUP BY o.id, s.slug, s.title, s.category
      ORDER BY o.starts_at DESC
    `),
    pool.query(`
      SELECT t.id, t.name, t.description, t.status, t.updated_at AS "updatedAt",
             COUNT(v.id)::int AS "versionCount",
             COALESCE(json_agg(json_build_object('id', v.id, 'versionNumber', v.version_number, 'status', v.status, 'publishedAt', v.published_at) ORDER BY v.version_number DESC) FILTER (WHERE v.id IS NOT NULL), '[]'::json) AS versions
      FROM form_templates t LEFT JOIN form_versions v ON v.form_template_id = t.id
      GROUP BY t.id ORDER BY t.updated_at DESC
    `),
    pool.query(`
      SELECT r.registration_code AS "registrationCode", r.status, r.total_amount_minor AS "amountMinor",
             r.currency, r.submitted_at AS "submittedAt", s.title, p.full_name AS "fullName", p.email
      FROM registrations r JOIN event_occurrences o ON o.id = r.occurrence_id
      JOIN event_series s ON s.id = o.event_series_id JOIN participants p ON p.id = r.participant_id
      ORDER BY r.created_at DESC LIMIT 100
    `),
  ])
  return { occurrences: occurrences.rows, forms: forms.rows, registrations: registrations.rows }
}

export async function createOccurrence(pool, body) {
  const seriesSlug = String(body.seriesSlug || '').trim()
  const startsAt = String(body.startsAt || '').trim()
  if (!seriesSlug || !startsAt) throw httpError('seriesSlug and startsAt are required.')
  return withTransaction(async (client) => {
    const series = await client.query(`SELECT id, organization_id FROM event_series WHERE slug = $1`, [seriesSlug])
    if (!series.rowCount) throw httpError('Event series not found.', 404)
    const form = body.formVersionId
      ? await client.query(`SELECT id FROM form_versions WHERE id = $1 AND status = 'published'`, [body.formVersionId])
      : await client.query(`SELECT id FROM form_versions WHERE status = 'published' ORDER BY published_at DESC LIMIT 1`)
    if (!form.rowCount) throw httpError('Publish a form before creating an occurrence.')
    const inserted = await client.query(`
      INSERT INTO event_occurrences (event_series_id, form_version_id, starts_at, ends_at, registration_opens_at, registration_closes_at, capacity, status, location)
      VALUES ($1, $2, $3, $4, now(), $5, $6, $7, $8::jsonb)
      RETURNING id, starts_at AS "startsAt", status, capacity, location
    `, [series.rows[0].id, form.rows[0].id, startsAt, body.endsAt || null, body.registrationClosesAt || null, body.capacity ? Number(body.capacity) : null, body.status || 'open', JSON.stringify(body.location || {})])
    const occurrence = inserted.rows[0]
    if (body.ticket) {
      const ticket = body.ticket
      await client.query(`INSERT INTO event_tickets (occurrence_id, code, name, amount_minor, currency, capacity) VALUES ($1, $2, $3, $4, $5, $6)`, [occurrence.id, ticket.code || 'standard', ticket.name || 'Standard entry', Number(ticket.amountMinor || 0), ticket.currency || 'INR', ticket.capacity ? Number(ticket.capacity) : null])
    }
    return occurrence
  })
}

export async function publishForm(pool, templateId, body) {
  const fields = Array.isArray(body.fields) ? body.fields : []
  if (!fields.length) throw httpError('Add at least one form field before publishing.')
  return withTransaction(async (client) => {
    const template = await client.query(`SELECT id FROM form_templates WHERE id = $1 FOR UPDATE`, [templateId])
    if (!template.rowCount) throw httpError('Form template not found.', 404)
    const current = await client.query(`SELECT COALESCE(MAX(version_number), 0)::int AS version FROM form_versions WHERE form_template_id = $1`, [templateId])
    await client.query(`UPDATE form_versions SET status = 'retired' WHERE form_template_id = $1 AND status = 'published'`, [templateId])
    const version = await client.query(`INSERT INTO form_versions (form_template_id, version_number, status, published_at) VALUES ($1, $2, 'published', now()) RETURNING id, version_number AS "versionNumber"`, [templateId, current.rows[0].version + 1])
    for (const [position, field] of fields.entries()) {
      if (!field.key || !field.label || !field.type) throw httpError('Each form field needs key, label, and type.')
      await client.query(`
        INSERT INTO form_fields (form_version_id, field_key, field_type, label, help_text, is_required, position, config_json)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      `, [version.rows[0].id, String(field.key).trim(), field.type, String(field.label).trim(), field.helpText || null, Boolean(field.required), position, JSON.stringify(field.config || {})])
    }
    return version.rows[0]
  })
}

export async function createFormTemplate(pool, body) {
  const name = String(body.name || '').trim()
  if (!name) throw httpError('Form name is required.')
  const result = await pool.query(`INSERT INTO form_templates (organization_id, name, description) SELECT id, $1, $2 FROM organizations WHERE slug = 'marga-run-club' RETURNING id, name, description`, [name, body.description || null])
  if (!result.rowCount) throw httpError('Organization has not been seeded.', 503)
  return result.rows[0]
}

export async function listFormDetails(pool) {
  const { rows } = await pool.query(`
    SELECT t.id, t.name, t.description, v.id AS "versionId", v.version_number AS "versionNumber", v.status,
      COALESCE(json_agg(json_build_object('id', f.id, 'key', f.field_key, 'type', f.field_type, 'label', f.label, 'helpText', f.help_text, 'required', f.is_required, 'config', f.config_json) ORDER BY f.position) FILTER (WHERE f.id IS NOT NULL), '[]'::json) AS fields
    FROM form_templates t LEFT JOIN form_versions v ON v.form_template_id = t.id AND v.status = 'published'
    LEFT JOIN form_fields f ON f.form_version_id = v.id
    GROUP BY t.id, v.id ORDER BY t.created_at
  `)
  return rows
}
