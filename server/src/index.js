import 'dotenv/config'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { pool, withTransaction } from './db.js'

const PORT = Number(process.env.PORT || 8787)
const UI_ORIGIN = process.env.UI_ORIGIN || '*'

function sendJson(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': UI_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  })
  response.end(JSON.stringify(body))
}

async function parseBody(request) {
  let raw = ''
  for await (const chunk of request) raw += chunk
  return JSON.parse(raw || '{}')
}

function registrationCode() {
  return `MRC-${randomUUID().slice(0, 8).toUpperCase()}`
}

async function listEvents() {
  const { rows } = await pool.query(`
    SELECT
      s.slug AS "eventId",
      s.title,
      s.category,
      s.description,
      o.id AS "occurrenceId",
      o.starts_at AS "startsAt",
      o.ends_at AS "endsAt",
      o.capacity,
      o.status,
      o.location,
      COALESCE(json_agg(json_build_object(
        'id', t.id,
        'code', t.code,
        'name', t.name,
        'amountMinor', t.amount_minor,
        'currency', t.currency
      ) ORDER BY t.created_at) FILTER (WHERE t.id IS NOT NULL), '[]'::json) AS tickets
    FROM event_series s
    JOIN event_occurrences o ON o.event_series_id = s.id
    LEFT JOIN event_tickets t ON t.occurrence_id = o.id AND t.active = true
    WHERE o.status IN ('open', 'full')
      AND (o.registration_closes_at IS NULL OR o.registration_closes_at > now())
      AND o.starts_at > now()
    GROUP BY s.slug, s.title, s.category, s.description, o.id
    ORDER BY o.starts_at ASC
  `)
  return rows
}

async function createRegistration(body) {
  const name = String(body.name || '').trim()
  const email = String(body.email || '').trim().toLowerCase()
  const phone = String(body.phone || '').trim() || null
  const eventId = String(body.eventId || '').trim()
  const answers = body.answers && typeof body.answers === 'object' ? body.answers : { full_name: name, email, ...(phone ? { phone } : {}) }

  if (name.length < 2 || !email.includes('@') || !eventId) {
    const error = new Error('Please provide a valid name, email, and event.')
    error.status = 400
    throw error
  }

  return withTransaction(async (client) => {
    const occurrenceResult = await client.query(`
      SELECT o.*, s.slug, s.title
      FROM event_occurrences o
      JOIN event_series s ON s.id = o.event_series_id
      WHERE s.slug = $1
        AND o.status = 'open'
        AND o.starts_at > now()
        AND (o.registration_opens_at IS NULL OR o.registration_opens_at <= now())
        AND (o.registration_closes_at IS NULL OR o.registration_closes_at > now())
      ORDER BY o.starts_at ASC
      LIMIT 1
      FOR UPDATE OF o
    `, [eventId])
    if (!occurrenceResult.rowCount) {
      const error = new Error('Registration is not open for this event yet.')
      error.status = 409
      throw error
    }
    const occurrence = occurrenceResult.rows[0]

    if (occurrence.capacity) {
      const countResult = await client.query(`
        SELECT count(*)::int AS count
        FROM registrations
        WHERE occurrence_id = $1
          AND status IN ('awaiting_payment', 'payment_pending', 'confirmed')
      `, [occurrence.id])
      if (countResult.rows[0].count >= occurrence.capacity) {
        const error = new Error('This event is full. Please join the waitlist from the organizer dashboard.')
        error.status = 409
        throw error
      }
    }

    const organization = await client.query(`SELECT id FROM organizations WHERE slug = 'marga-run-club' LIMIT 1`)
    if (!organization.rowCount) {
      const error = new Error('Marga Run Club has not been initialized in the database. Run the seed script first.')
      error.status = 503
      throw error
    }
    const organizationId = organization.rows[0].id

    const participantResult = await client.query(`
      INSERT INTO participants (organization_id, full_name, email, phone)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (organization_id, lower(email)) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        phone = COALESCE(EXCLUDED.phone, participants.phone),
        updated_at = now()
      RETURNING id
    `, [organizationId, name, email, phone])
    const participantId = participantResult.rows[0].id

    const existing = await client.query(`
      SELECT registration_code, status
      FROM registrations
      WHERE occurrence_id = $1
        AND participant_id = $2
        AND status NOT IN ('cancelled', 'expired', 'refunded')
      LIMIT 1
    `, [occurrence.id, participantId])
    if (existing.rowCount) {
      const error = new Error(`You already have a ${existing.rows[0].status.replace('_', ' ')} registration for this event.`)
      error.status = 409
      error.registration = existing.rows[0]
      throw error
    }

    const formVersion = await client.query(`
      SELECT id
      FROM form_versions
      WHERE id = $1 AND status = 'published'
    `, [occurrence.form_version_id])
    if (!formVersion.rowCount) {
      const error = new Error('This event form is not configured yet.')
      error.status = 503
      throw error
    }

    const submissionId = randomUUID()
    const responseToken = randomUUID()
    await client.query(`
      INSERT INTO form_submissions (
        id, form_version_id, occurrence_id, participant_id, response_token,
        status, answers_json, submitted_from, submitted_at
      ) VALUES ($1, $2, $3, $4, $5, 'submitted', $6::jsonb, $7, now())
    `, [submissionId, occurrence.form_version_id, occurrence.id, participantId, responseToken, JSON.stringify(answers), body.source || 'website'])

    const fields = await client.query(`SELECT id, field_key, label FROM form_fields WHERE form_version_id = $1`, [occurrence.form_version_id])
    for (const field of fields.rows) {
      if (Object.prototype.hasOwnProperty.call(answers, field.field_key)) {
        await client.query(`
          INSERT INTO form_submission_answers (submission_id, field_id, field_key, field_label_snapshot, value_json)
          VALUES ($1, $2, $3, $4, $5::jsonb)
        `, [submissionId, field.id, field.field_key, field.label, JSON.stringify(answers[field.field_key])])
      }
    }

    const ticketResult = await client.query(`
      SELECT id, name, amount_minor, currency
      FROM event_tickets
      WHERE occurrence_id = $1 AND active = true
      ORDER BY amount_minor ASC, created_at ASC
      LIMIT 1
    `, [occurrence.id])
    const ticket = ticketResult.rows[0] || null
    const totalAmountMinor = ticket ? Number(ticket.amount_minor) : 0
    const status = totalAmountMinor === 0 ? 'confirmed' : 'awaiting_payment'
    const code = registrationCode()

    const registrationResult = await client.query(`
      INSERT INTO registrations (
        registration_code, occurrence_id, participant_id, form_submission_id,
        form_version_id, status, total_amount_minor, currency,
        source, confirmed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'website', $9)
      RETURNING id, registration_code, status, total_amount_minor, currency, confirmed_at
    `, [code, occurrence.id, participantId, submissionId, occurrence.form_version_id, status, totalAmountMinor, ticket?.currency || 'INR', status === 'confirmed' ? new Date() : null])

    const registration = registrationResult.rows[0]
    if (ticket) {
      await client.query(`
        INSERT INTO registration_items (
          registration_id, ticket_id, quantity, unit_amount_minor,
          total_amount_minor, ticket_name_snapshot
        ) VALUES ($1, $2, 1, $3, $3, $4)
      `, [registration.id, ticket.id, ticket.amount_minor, ticket.name])
    }

    return {
      ...registration,
      paymentRequired: totalAmountMinor > 0,
      paymentStatus: totalAmountMinor > 0 ? 'not_started' : 'not_required',
      eventTitle: occurrence.title,
    }
  })
}

async function handleRequest(request, response) {
  if (request.method === 'OPTIONS') return sendJson(response, 204, {})
  if (request.method === 'GET' && request.url === '/api/health') {
    try {
      await pool.query('SELECT 1')
      return sendJson(response, 200, { ok: true, database: 'postgres', service: 'marga-run-club-server' })
    } catch (error) {
      return sendJson(response, 503, { ok: false, database: 'unavailable', error: error.message })
    }
  }
  if (request.method === 'GET' && request.url === '/api/events') return sendJson(response, 200, { events: await listEvents() })
  if (request.method === 'POST' && request.url === '/api/registrations') {
    try {
      return sendJson(response, 201, { registration: await createRegistration(await parseBody(request)) })
    } catch (error) {
      console.error(error)
      return sendJson(response, error.status || 500, { error: error.message || 'Unable to save registration right now.', registration: error.registration })
    }
  }
  return sendJson(response, 404, { error: 'Not found' })
}

if (!process.env.DATABASE_URL) console.warn('DATABASE_URL is not set. The API will start, but database routes will be unavailable.')
createServer((request, response) => handleRequest(request, response).catch((error) => {
  console.error(error)
  sendJson(response, 500, { error: 'Unexpected server error.' })
})).listen(PORT, () => console.log(`Marga Run Club server listening on http://localhost:${PORT}`))
