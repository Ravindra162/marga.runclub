import 'dotenv/config'
import { createServer } from 'node:http'
import { createHash, randomUUID } from 'node:crypto'
import { pool, withTransaction } from './db.js'
import { adminOverview, createFormTemplate, createOccurrence, listFormDetails, publishForm, requireAdmin } from './admin.js'
import { createCheckoutOrder, getOrderStatus, merchantOrderId, phonePeConfigured, verifyWebhookSignature } from './phonepe.js'

const PORT = Number(process.env.PORT || 8787)
const UI_ORIGIN = process.env.UI_ORIGIN || '*'

function sendJson(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': UI_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  })
  response.end(JSON.stringify(body))
}

async function readRawBody(request) {
  let raw = ''
  for await (const chunk of request) {
    raw += chunk
    if (raw.length > 1_000_000) throw Object.assign(new Error('Request body is too large.'), { status: 413 })
  }
  return raw
}

async function parseBody(request, rawBody = null) {
  const raw = rawBody ?? await readRawBody(request)
  try {
    return JSON.parse(raw || '{}')
  } catch {
    throw Object.assign(new Error('Request body must be valid JSON.'), { status: 400 })
  }
}

function httpError(message, status = 400) {
  return Object.assign(new Error(message), { status })
}

function registrationCode() {
  return `MRC-${randomUUID().slice(0, 8).toUpperCase()}`
}

function normalizeEvent(row) {
  const ticket = row.tickets?.[0]
  return {
    ...row,
    category: row.category === 'f1_screening' ? 'Socials' : row.category[0].toUpperCase() + row.category.slice(1),
    price: ticket?.amountMinor ? `₹${Number(ticket.amountMinor) / 100}` : 'Free',
    priceMinor: ticket?.amountMinor || 0,
    priceLabel: ticket?.amountMinor ? 'Share' : 'Entry',
    ticketId: ticket?.id || null,
  }
}

async function listEvents() {
  const { rows } = await pool.query(`
    SELECT s.slug AS "eventId", s.title, s.category, s.description,
      o.id AS "occurrenceId", o.starts_at AS "startsAt", o.ends_at AS "endsAt", o.capacity, o.status, o.location,
      COALESCE(json_agg(json_build_object('id', t.id, 'code', t.code, 'name', t.name, 'amountMinor', t.amount_minor, 'currency', t.currency) ORDER BY t.created_at) FILTER (WHERE t.id IS NOT NULL), '[]'::json) AS tickets
    FROM event_series s
    JOIN event_occurrences o ON o.event_series_id = s.id
    LEFT JOIN event_tickets t ON t.occurrence_id = o.id AND t.active = true
    WHERE o.status IN ('open', 'full') AND (o.registration_closes_at IS NULL OR o.registration_closes_at > now()) AND o.starts_at > now()
    GROUP BY s.slug, s.title, s.category, s.description, o.id
    ORDER BY o.starts_at ASC
  `)
  return rows.map(normalizeEvent)
}

async function getFormForEvent(eventId) {
  const { rows } = await pool.query(`
    SELECT v.id AS "versionId", v.version_number AS "versionNumber",
      json_agg(json_build_object('id', f.id, 'key', f.field_key, 'type', f.field_type, 'label', f.label, 'helpText', f.help_text, 'required', f.is_required, 'config', f.config_json) ORDER BY f.position) AS fields
    FROM event_occurrences o
    JOIN event_series s ON s.id = o.event_series_id
    JOIN form_versions v ON v.id = o.form_version_id AND v.status = 'published'
    JOIN form_fields f ON f.form_version_id = v.id
    WHERE s.slug = $1 AND o.status IN ('open', 'full') AND o.starts_at > now()
    GROUP BY v.id
    ORDER BY o.starts_at ASC LIMIT 1
  `, [eventId])
  if (!rows.length) throw httpError('Registration form is not available for this event.', 404)
  return rows[0]
}

async function createRegistration(body) {
  const name = String(body.name || body.answers?.full_name || '').trim()
  const email = String(body.email || body.answers?.email || '').trim().toLowerCase()
  const phone = String(body.phone || body.answers?.phone || '').trim() || null
  const eventId = String(body.eventId || '').trim()
  const answers = body.answers && typeof body.answers === 'object' ? body.answers : { full_name: name, email, ...(phone ? { phone } : {}) }
  if (name.length < 2 || !email.includes('@') || !eventId) throw httpError('Please provide a valid name, email, and event.')

  return withTransaction(async (client) => {
    const occurrenceResult = await client.query(`
      SELECT o.*, s.slug, s.title FROM event_occurrences o JOIN event_series s ON s.id = o.event_series_id
      WHERE s.slug = $1 AND o.status = 'open' AND o.starts_at > now()
        AND (o.registration_opens_at IS NULL OR o.registration_opens_at <= now())
        AND (o.registration_closes_at IS NULL OR o.registration_closes_at > now())
      ORDER BY o.starts_at ASC LIMIT 1 FOR UPDATE OF o
    `, [eventId])
    if (!occurrenceResult.rowCount) throw httpError('Registration is not open for this event yet.', 409)
    const occurrence = occurrenceResult.rows[0]

    if (occurrence.capacity) {
      const countResult = await client.query(`SELECT count(*)::int AS count FROM registrations WHERE occurrence_id = $1 AND status IN ('awaiting_payment', 'payment_pending', 'confirmed')`, [occurrence.id])
      if (countResult.rows[0].count >= occurrence.capacity) throw httpError('This event is full. Please contact the organizers for a waitlist spot.', 409)
    }
    const organization = await client.query(`SELECT id FROM organizations WHERE slug = 'marga-run-club' LIMIT 1`)
    if (!organization.rowCount) throw httpError('Marga Run Club has not been initialized in the database. Run the seed script first.', 503)
    const organizationId = organization.rows[0].id

    const participantResult = await client.query(`
      INSERT INTO participants (organization_id, full_name, email, phone) VALUES ($1, $2, $3, $4)
      ON CONFLICT (organization_id, lower(email)) DO UPDATE SET full_name = EXCLUDED.full_name, phone = COALESCE(EXCLUDED.phone, participants.phone), updated_at = now()
      RETURNING id
    `, [organizationId, name, email, phone])
    const participantId = participantResult.rows[0].id
    const existing = await client.query(`SELECT registration_code, status FROM registrations WHERE occurrence_id = $1 AND participant_id = $2 AND status NOT IN ('cancelled', 'expired', 'refunded') LIMIT 1`, [occurrence.id, participantId])
    if (existing.rowCount) throw Object.assign(httpError(`You already have a ${existing.rows[0].status.replace('_', ' ')} registration for this event.`, 409), { registration: existing.rows[0] })
    if (!occurrence.form_version_id) throw httpError('This event form is not configured yet.', 503)

    const fields = await client.query(`SELECT id, field_key, label, is_required FROM form_fields WHERE form_version_id = $1 ORDER BY position`, [occurrence.form_version_id])
    for (const field of fields.rows) {
      const value = answers[field.field_key]
      if (field.is_required && (value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length))) throw httpError(`${field.label} is required.`, 400)
    }
    const submissionId = randomUUID()
    await client.query(`INSERT INTO form_submissions (id, form_version_id, occurrence_id, participant_id, response_token, status, answers_json, submitted_from, submitted_at) VALUES ($1, $2, $3, $4, $5, 'submitted', $6::jsonb, $7, now())`, [submissionId, occurrence.form_version_id, occurrence.id, participantId, randomUUID(), JSON.stringify(answers), body.source || 'website'])
    for (const field of fields.rows) {
      if (Object.prototype.hasOwnProperty.call(answers, field.field_key)) await client.query(`INSERT INTO form_submission_answers (submission_id, field_id, field_key, field_label_snapshot, value_json) VALUES ($1, $2, $3, $4, $5::jsonb)`, [submissionId, field.id, field.field_key, field.label, JSON.stringify(answers[field.field_key])])
    }

    const ticketResult = await client.query(`SELECT id, name, amount_minor, currency FROM event_tickets WHERE occurrence_id = $1 AND active = true ORDER BY amount_minor ASC, created_at ASC LIMIT 1`, [occurrence.id])
    const ticket = ticketResult.rows[0] || null
    const totalAmountMinor = ticket ? Number(ticket.amount_minor) : 0
    const status = totalAmountMinor === 0 ? 'confirmed' : 'awaiting_payment'
    const registrationResult = await client.query(`
      INSERT INTO registrations (registration_code, occurrence_id, participant_id, form_submission_id, form_version_id, status, total_amount_minor, currency, source, confirmed_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'website', $9)
      RETURNING id, registration_code, status, total_amount_minor, currency, confirmed_at
    `, [registrationCode(), occurrence.id, participantId, submissionId, occurrence.form_version_id, status, totalAmountMinor, ticket?.currency || 'INR', status === 'confirmed' ? new Date() : null])
    const registration = registrationResult.rows[0]
    if (ticket) await client.query(`INSERT INTO registration_items (registration_id, ticket_id, quantity, unit_amount_minor, total_amount_minor, ticket_name_snapshot) VALUES ($1, $2, 1, $3, $3, $4)`, [registration.id, ticket.id, ticket.amount_minor, ticket.name])
    return { ...registration, paymentRequired: totalAmountMinor > 0, paymentStatus: totalAmountMinor > 0 ? 'not_started' : 'not_required', eventTitle: occurrence.title }
  })
}

async function createPaymentOrder(body) {
  const registrationCodeValue = String(body.registrationCode || '').trim()
  if (!registrationCodeValue) throw httpError('registrationCode is required.')
  const registration = await pool.query(`SELECT r.id, r.registration_code, r.status, r.total_amount_minor, r.currency, p.phone FROM registrations r JOIN participants p ON p.id = r.participant_id WHERE r.registration_code = $1`, [registrationCodeValue])
  if (!registration.rowCount) throw httpError('Registration not found.', 404)
  const row = registration.rows[0]
  if (row.status !== 'awaiting_payment') throw httpError('This registration is not awaiting payment.', 409)
  if (Number(row.total_amount_minor) < 100) throw httpError('Payment amount must be at least ₹1.', 400)

  const existing = await pool.query(`SELECT merchant_order_id, status, checkout_url FROM payment_orders WHERE registration_id = $1`, [row.id])
  if (existing.rowCount && existing.rows[0].checkout_url) return {
    merchantOrderId: existing.rows[0].merchant_order_id,
    status: existing.rows[0].status,
    checkoutUrl: existing.rows[0].checkout_url,
    demo: !phonePeConfigured(),
  }
  const orderId = existing.rows[0]?.merchant_order_id || merchantOrderId()
  const checkout = await createCheckoutOrder({ merchantOrderId: orderId, amountMinor: Number(row.total_amount_minor), phone: row.phone, redirectUrl: body.redirectUrl })
  await withTransaction(async (client) => {
    await client.query(`
      INSERT INTO payment_orders (registration_id, merchant_order_id, provider_order_id, amount_minor, currency, status, checkout_url, expires_at, idempotency_key, provider_payload)
      VALUES ($1, $2, $3, $4, $5, 'pending', $6, to_timestamp($7 / 1000.0), $2, $8::jsonb)
      ON CONFLICT (registration_id) DO UPDATE SET provider_order_id = EXCLUDED.provider_order_id, status = EXCLUDED.status, checkout_url = EXCLUDED.checkout_url, expires_at = EXCLUDED.expires_at, provider_payload = EXCLUDED.provider_payload, updated_at = now()
    `, [row.id, orderId, checkout.orderId || null, Number(row.total_amount_minor), row.currency, checkout.redirectUrl || null, checkout.expireAt || Date.now() + 1_200_000, JSON.stringify(checkout)])
    await client.query(`UPDATE registrations SET status = 'payment_pending', updated_at = now() WHERE id = $1 AND status = 'awaiting_payment'`, [row.id])
  })
  return { merchantOrderId: orderId, checkoutUrl: checkout.redirectUrl, status: 'pending', demo: Boolean(checkout.demo) }
}

async function applyPaymentStatus(providerPayload) {
  const merchantId = providerPayload.merchantOrderId || providerPayload.merchant_order_id || providerPayload.metaInfo?.udf2
  if (!merchantId) throw httpError('PhonePe payload has no merchant order ID.', 400)
  return withTransaction(async (client) => {
    const order = await client.query(`SELECT id, registration_id, amount_minor, status FROM payment_orders WHERE merchant_order_id = $1 FOR UPDATE`, [merchantId])
    if (!order.rowCount) throw httpError('Payment order not found.', 404)
    const payment = order.rows[0]
    const providerState = String(providerPayload.state || '').toUpperCase()
    if (providerPayload.amount !== undefined && Number(providerPayload.amount) !== Number(payment.amount_minor)) throw httpError('Payment amount mismatch.', 400)
    const details = providerPayload.paymentDetails || []
    const latest = details[details.length - 1] || {}
    let status = payment.status
    if (providerState === 'COMPLETED') status = 'paid'
    else if (providerState === 'FAILED') status = 'failed'
    else if (providerState === 'EXPIRED') status = 'expired'
    await client.query(`UPDATE payment_orders SET status = $1, provider_order_id = COALESCE(provider_order_id, $2), paid_at = CASE WHEN $1 = 'paid' THEN now() ELSE paid_at END, provider_payload = $3::jsonb, updated_at = now() WHERE id = $4`, [status, providerPayload.orderId || null, JSON.stringify(providerPayload), payment.id])
    if (latest.transactionId) await client.query(`
      INSERT INTO payment_attempts (payment_order_id, attempt_number, status, payment_method, provider_transaction_id, provider_response_code, provider_payload, completed_at)
      SELECT $1, COALESCE(MAX(attempt_number), 0) + 1, $2, $3, $4, $5, $6::jsonb, CASE WHEN $2 IN ('success', 'failed') THEN now() ELSE NULL END
      FROM payment_attempts
      WHERE payment_order_id = $1
        AND NOT EXISTS (SELECT 1 FROM payment_attempts existing WHERE existing.payment_order_id = $1 AND existing.provider_transaction_id = $4 AND $4 IS NOT NULL)
    `, [payment.id, providerState === 'COMPLETED' ? 'success' : providerState === 'FAILED' ? 'failed' : 'pending', latest.paymentMode || null, latest.transactionId || null, latest.errorCode || null, JSON.stringify(latest)])
    if (status === 'paid') await client.query(`UPDATE registrations SET status = 'confirmed', confirmed_at = COALESCE(confirmed_at, now()), updated_at = now() WHERE id = $1`, [payment.registration_id])
    if (status === 'failed') await client.query(`UPDATE registrations SET status = 'awaiting_payment', updated_at = now() WHERE id = $1 AND status = 'payment_pending'`, [payment.registration_id])
    return { merchantOrderId: merchantId, status }
  })
}

async function handleRequest(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`)
  if (request.method === 'OPTIONS') return sendJson(response, 204, {})
  if (request.method === 'GET' && url.pathname === '/api/health') {
    try { await pool.query('SELECT 1'); return sendJson(response, 200, { ok: true, database: 'postgres', phonePe: phonePeConfigured(), service: 'marga-run-club-server' }) } catch (error) { return sendJson(response, 503, { ok: false, database: 'unavailable', error: error.message }) }
  }
  if (request.method === 'GET' && url.pathname === '/api/events') return sendJson(response, 200, { events: await listEvents() })
  if (request.method === 'GET' && url.pathname.startsWith('/api/events/') && url.pathname.endsWith('/form')) return sendJson(response, 200, { form: await getFormForEvent(url.pathname.split('/')[3]) })
  if (request.method === 'POST' && url.pathname === '/api/registrations') return sendJson(response, 201, { registration: await createRegistration(await parseBody(request)) })
  if (request.method === 'POST' && url.pathname === '/api/payments/orders') return sendJson(response, 201, { payment: await createPaymentOrder(await parseBody(request)) })
  if (request.method === 'GET' && url.pathname.startsWith('/api/payments/') && url.pathname.endsWith('/status')) {
    const merchantId = url.pathname.split('/')[3]
    const provider = await getOrderStatus(merchantId)
    const applied = provider.demo ? { merchantOrderId: merchantId, status: 'pending' } : await applyPaymentStatus(provider)
    return sendJson(response, 200, { payment: { ...applied, providerState: provider.state } })
  }
  if (request.method === 'POST' && url.pathname === '/api/payments/webhook') {
    const rawBody = await readRawBody(request)
    if (!verifyWebhookSignature(rawBody, request.headers)) return sendJson(response, 401, { error: 'Invalid webhook signature.' })
    const body = await parseBody(request, rawBody)
    const payload = body.payload || body
    const hash = createHash('sha256').update(rawBody).digest('hex')
    const stored = await pool.query(`INSERT INTO payment_webhook_events (provider_event_id, event_type, payload_hash, payload) VALUES ($1, $2, $3, $4::jsonb) ON CONFLICT (payload_hash) DO NOTHING RETURNING id`, [payload.orderId || payload.merchantOrderId || null, body.event || null, hash, rawBody])
    if (stored.rowCount) await applyPaymentStatus(payload)
    return sendJson(response, 200, { ok: true, duplicate: !stored.rowCount })
  }

  if (url.pathname.startsWith('/api/admin')) {
    requireAdmin(request)
    if (request.method === 'GET' && url.pathname === '/api/admin/overview') return sendJson(response, 200, await adminOverview(pool))
    if (request.method === 'GET' && url.pathname === '/api/admin/forms') return sendJson(response, 200, { forms: await listFormDetails(pool) })
    if (request.method === 'POST' && url.pathname === '/api/admin/forms') return sendJson(response, 201, { form: await createFormTemplate(pool, await parseBody(request)) })
    if (request.method === 'POST' && url.pathname.match(/^\/api\/admin\/forms\/[^/]+\/publish$/)) return sendJson(response, 201, { version: await publishForm(pool, url.pathname.split('/')[4], await parseBody(request)) })
    if (request.method === 'POST' && url.pathname === '/api/admin/occurrences') return sendJson(response, 201, { occurrence: await createOccurrence(pool, await parseBody(request)) })
  }
  return sendJson(response, 404, { error: 'Not found' })
}

if (!process.env.DATABASE_URL) console.warn('DATABASE_URL is not set. Database routes will be unavailable.')
createServer((request, response) => handleRequest(request, response).catch((error) => { console.error(error); sendJson(response, error.status || 500, { error: error.message || 'Unexpected server error.', registration: error.registration }) })).listen(PORT, () => console.log(`Marga Run Club server listening on http://localhost:${PORT}`))
