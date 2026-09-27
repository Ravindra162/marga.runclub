import { createServer } from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

const PORT = Number(process.env.PORT || 8787)
const DATA_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'registrations.json')

const events = new Set(['morning-run', 'badminton', 'pickleball', 'f1-screening'])

async function ensureDataFile() {
  await mkdir(dirname(DATA_FILE), { recursive: true })
  try {
    await readFile(DATA_FILE, 'utf8')
  } catch {
    await writeFile(DATA_FILE, '[]\n', 'utf8')
  }
}

async function getRegistrations() {
  return JSON.parse(await readFile(DATA_FILE, 'utf8'))
}

async function saveRegistration(registration) {
  const registrations = await getRegistrations()
  registrations.push(registration)
  await writeFile(DATA_FILE, `${JSON.stringify(registrations, null, 2)}\n`, 'utf8')
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': process.env.UI_ORIGIN || '*',
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

async function handleRequest(request, response) {
  if (request.method === 'OPTIONS') return sendJson(response, 204, {})
  if (request.method === 'GET' && request.url === '/api/health') return sendJson(response, 200, { ok: true, service: 'marga-run-club-server' })

  if (request.method === 'POST' && request.url === '/api/registrations') {
    try {
      const body = await parseBody(request)
      const name = String(body.name || '').trim()
      const email = String(body.email || '').trim().toLowerCase()
      const eventId = String(body.eventId || '').trim()
      if (name.length < 2 || !email.includes('@') || !events.has(eventId)) return sendJson(response, 400, { error: 'Please provide a valid name, email, and event.' })

      const registration = {
        id: `MRC-${randomUUID().slice(0, 8).toUpperCase()}`,
        eventId,
        name,
        email,
        status: 'pending',
        createdAt: new Date().toISOString(),
      }
      await saveRegistration(registration)
      return sendJson(response, 201, { registration })
    } catch (error) {
      console.error(error)
      return sendJson(response, 500, { error: 'Unable to save registration right now.' })
    }
  }

  return sendJson(response, 404, { error: 'Not found' })
}

await ensureDataFile()
createServer((request, response) => handleRequest(request, response).catch((error) => {
  console.error(error)
  sendJson(response, 500, { error: 'Unexpected server error.' })
})).listen(PORT, () => console.log(`Marga Run Club server listening on http://localhost:${PORT}`))
