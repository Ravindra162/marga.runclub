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
  const [occurrences, forms, registrations, series] = await Promise.all([
    pool.query(`
       SELECT o.id, o.event_series_id AS "eventSeriesId", s.slug AS "eventId", s.title, s.category, o.starts_at AS "startsAt", o.status,
              o.form_version_id AS "formVersionId", fv.version_number AS "formVersionNumber",
              ft.name AS "formName", et.name AS "ticketName", et.description AS "ticketDescription",
              COALESCE(et.amount_minor, 0)::bigint AS "amountMinor", COALESCE(et.currency, 'INR') AS currency,
              o.capacity, o.location, COUNT(r.id) FILTER (WHERE r.status = 'confirmed')::int AS "registrationCount",
             COUNT(r.id) FILTER (WHERE r.status = 'confirmed')::int AS "confirmedCount",
             COALESCE(SUM(r.total_amount_minor) FILTER (WHERE r.status = 'confirmed'), 0)::bigint AS "confirmedRevenueMinor"
       FROM event_occurrences o
       JOIN event_series s ON s.id = o.event_series_id
       LEFT JOIN form_versions fv ON fv.id = o.form_version_id
       LEFT JOIN form_templates ft ON ft.id = fv.form_template_id
       LEFT JOIN LATERAL (SELECT name, description, amount_minor, currency FROM event_tickets WHERE occurrence_id = o.id AND active = true ORDER BY created_at LIMIT 1) et ON true
      LEFT JOIN registrations r ON r.occurrence_id = o.id AND r.status NOT IN ('cancelled', 'expired')
       GROUP BY o.id, s.slug, s.title, s.category, o.form_version_id, fv.version_number, ft.name, et.name, et.description, et.amount_minor, et.currency
      ORDER BY o.starts_at DESC
    `),
    pool.query(`
       SELECT t.id, t.name, t.description, t.status, t.updated_at AS "updatedAt",
              COUNT(v.id)::int AS "versionCount", t.status AS "templateStatus",
              current_version.id AS "versionId", current_version.version_number AS "versionNumber",
              current_version.status AS "versionStatus",
              COALESCE((
                SELECT json_agg(json_build_object(
                  'id', f.id, 'key', f.field_key, 'type', f.field_type, 'label', f.label,
                  'helpText', f.help_text, 'required', f.is_required, 'config', f.config_json
                ) ORDER BY f.position)
                FROM form_fields f WHERE f.form_version_id = current_version.id
              ), '[]'::json) AS fields,
              COALESCE(json_agg(json_build_object('id', v.id, 'versionNumber', v.version_number, 'status', v.status, 'publishedAt', v.published_at) ORDER BY v.version_number DESC) FILTER (WHERE v.id IS NOT NULL), '[]'::json) AS versions
       FROM form_templates t
       LEFT JOIN form_versions v ON v.form_template_id = t.id
       LEFT JOIN LATERAL (
         SELECT id, version_number, status FROM form_versions
         WHERE form_template_id = t.id AND status = 'published'
         LIMIT 1
       ) current_version ON true
       GROUP BY t.id, t.status, current_version.id, current_version.version_number, current_version.status
       ORDER BY t.updated_at DESC
    `),
    pool.query(`
      SELECT r.registration_code AS "registrationCode", r.status, r.total_amount_minor AS "amountMinor",
             r.currency, r.submitted_at AS "submittedAt", s.title, p.full_name AS "fullName", p.email
      FROM registrations r JOIN event_occurrences o ON o.id = r.occurrence_id
      JOIN event_series s ON s.id = o.event_series_id JOIN participants p ON p.id = r.participant_id
      ORDER BY r.created_at DESC LIMIT 100
    `),
    pool.query(`
      SELECT id, slug, title, category, description, status, default_location AS "defaultLocation"
      FROM event_series
      WHERE status <> 'archived'
      ORDER BY title
    `),
  ])
  return { occurrences: occurrences.rows, forms: forms.rows, registrations: registrations.rows, series: series.rows }
}

function slugify(value) {
  return String(value).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)
}

export async function createEventSeries(pool, body) {
  const title = String(body.title || '').trim()
  const category = String(body.category || 'other').trim()
  const slug = slugify(body.slug || title)
  if (!title || !slug) throw httpError('Event title is required.')
  const result = await pool.query(`
    INSERT INTO event_series (organization_id, slug, title, category, description, default_location, metadata)
    SELECT id, $1, $2, $3, $4, $5::jsonb, $6::jsonb
    FROM organizations WHERE slug = 'marga-run-club'
    RETURNING id, slug, title, category, description, status, default_location AS "defaultLocation"
  `, [slug, title, category, body.description || null, JSON.stringify(body.defaultLocation || {}), JSON.stringify(body.metadata || {})])
  if (!result.rowCount) throw httpError('Organization has not been seeded.', 503)
  return result.rows[0]
}

export async function createOccurrence(pool, body) {
  const seriesId = String(body.seriesId || '').trim()
  const startsAt = String(body.startsAt || '').trim()
  if (!seriesId || !startsAt) throw httpError('seriesId and startsAt are required.')
  return withTransaction(async (client) => {
    const series = await client.query(`SELECT id, organization_id FROM event_series WHERE id = $1::uuid`, [seriesId])
    if (!series.rowCount) throw httpError('Event series not found.', 404)
    const form = body.formVersionId
      ? await client.query(`SELECT id FROM form_versions WHERE id = $1 AND status = 'published'`, [body.formVersionId])
      : await client.query(`SELECT id FROM form_versions WHERE status = 'published' ORDER BY published_at DESC LIMIT 1`)
    if (!form.rowCount) throw httpError('Choose a valid published form version before creating an occurrence.')
    const inserted = await client.query(`
      INSERT INTO event_occurrences (event_series_id, form_version_id, starts_at, ends_at, registration_opens_at, registration_closes_at, capacity, status, location)
      VALUES ($1, $2, $3, $4, now(), $5, $6, $7, $8::jsonb)
      RETURNING id, starts_at AS "startsAt", status, capacity, location
    `, [series.rows[0].id, form.rows[0].id, startsAt, body.endsAt || null, body.registrationClosesAt || null, body.capacity ? Number(body.capacity) : null, body.status || 'open', JSON.stringify(body.location || {})])
    const occurrence = inserted.rows[0]
    if (body.ticket) {
      const ticket = body.ticket
      const amountMinor = Number(ticket.amountMinor)
      if (!Number.isInteger(amountMinor) || amountMinor < 0) throw httpError('Price must be a valid non-negative amount.')
      await client.query(`INSERT INTO event_tickets (occurrence_id, code, name, description, amount_minor, currency, capacity) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [occurrence.id, ticket.code || 'standard', ticket.name || (amountMinor ? 'Standard entry' : 'Community entry'), ticket.description || null, amountMinor, ticket.currency || 'INR', ticket.capacity ? Number(ticket.capacity) : null])
    }
    return occurrence
  })
}

export async function updateOccurrence(pool, occurrenceId, body) {
  const startsAt = String(body.startsAt || '').trim()
  const capacity = Number(body.capacity)
  const amountMinor = Number(body.ticket?.amountMinor)
  if (!startsAt) throw httpError('Date and time are required.')
  if (!Number.isInteger(capacity) || capacity < 1) throw httpError('Capacity must be a positive whole number.')
  if (!Number.isInteger(amountMinor) || amountMinor < 0) throw httpError('Price must be a valid non-negative amount.')

  return withTransaction(async (client) => {
    const occurrence = await client.query(`
      SELECT id, event_series_id FROM event_occurrences WHERE id = $1::uuid FOR UPDATE
    `, [occurrenceId])
    if (!occurrence.rowCount) throw httpError('Event occurrence not found.', 404)

    if (body.formVersionId) {
      const form = await client.query(`SELECT id FROM form_versions WHERE id = $1 AND status = 'published'`, [body.formVersionId])
      if (!form.rowCount) throw httpError('Choose a valid published form version.')
    }

    const seriesId = String(body.seriesId || occurrence.rows[0].event_series_id).trim()
    const series = await client.query(`SELECT id FROM event_series WHERE id = $1::uuid`, [seriesId])
    if (!series.rowCount) throw httpError('Event series not found.', 404)

    const updated = await client.query(`
      UPDATE event_occurrences
      SET event_series_id = $2, form_version_id = COALESCE($3, form_version_id), starts_at = $4, capacity = $5,
          status = COALESCE($6, status), location = COALESCE($7::jsonb, location), updated_at = now()
      WHERE id = $1
      RETURNING id, starts_at AS "startsAt", status, capacity, location
    `, [occurrenceId, seriesId, body.formVersionId || null, startsAt, capacity, body.status || null, body.location ? JSON.stringify(body.location) : null])

    if (body.title || body.description || body.category) {
      await client.query(`
        UPDATE event_series
        SET title = COALESCE($2, title), description = COALESCE($3, description),
            category = COALESCE($4, category), updated_at = now()
        WHERE id = $1
      `, [seriesId, body.title?.trim() || null, body.description ?? null, body.category || null])
    }

    const ticket = await client.query(`SELECT id FROM event_tickets WHERE occurrence_id = $1 AND active = true ORDER BY created_at LIMIT 1`, [occurrenceId])
    const ticketValues = [body.ticket?.name?.trim() || 'Standard entry', body.ticket?.description?.trim() || null, amountMinor]
    if (ticket.rowCount) {
      await client.query(`UPDATE event_tickets SET name = $2, description = $3, amount_minor = $4 WHERE id = $1`, [ticket.rows[0].id, ...ticketValues])
    } else {
      await client.query(`INSERT INTO event_tickets (occurrence_id, code, name, description, amount_minor, currency) VALUES ($1, 'standard', $2, $3, $4, 'INR')`, [occurrenceId, ...ticketValues])
    }
    return updated.rows[0]
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
      if (['dropdown', 'radio', 'multi_select', 'checkbox'].includes(field.type)) {
        const options = Array.isArray(field.config?.options) ? field.config.options.map((option) => String(option).trim()).filter(Boolean) : []
        if (!options.length) throw httpError(`Add at least one option for “${field.label}”.`)
      }
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

export async function updateFormTemplate(pool, templateId, body) {
  const name = String(body.name || '').trim()
  if (!name) throw httpError('Form name is required.')
  const result = await pool.query(`UPDATE form_templates SET name = $1, description = $2, updated_at = now() WHERE id = $3 RETURNING id, name, description, status`, [name, body.description || null, templateId])
  if (!result.rowCount) throw httpError('Form template not found.', 404)
  return result.rows[0]
}

export async function archiveFormTemplate(pool, templateId) {
  const result = await pool.query(`UPDATE form_templates SET status = 'archived', updated_at = now() WHERE id = $1 AND status <> 'archived' RETURNING id, name, status`, [templateId])
  if (!result.rowCount) throw httpError('Form template not found or already archived.', 404)
  return result.rows[0]
}

export async function listFormDetails(pool) {
  const { rows } = await pool.query(`
    SELECT t.id, t.name, t.description, t.status AS "templateStatus", v.id AS "versionId", v.version_number AS "versionNumber", v.status,
      COALESCE(json_agg(json_build_object('id', f.id, 'key', f.field_key, 'type', f.field_type, 'label', f.label, 'helpText', f.help_text, 'required', f.is_required, 'config', f.config_json) ORDER BY f.position) FILTER (WHERE f.id IS NOT NULL), '[]'::json) AS fields
    FROM form_templates t LEFT JOIN form_versions v ON v.form_template_id = t.id AND v.status = 'published'
    LEFT JOIN form_fields f ON f.form_version_id = v.id
    GROUP BY t.id, v.id ORDER BY t.created_at
  `)
  return rows
}
