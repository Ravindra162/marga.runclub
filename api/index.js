import { handleVercelRequest } from '../server/src/index.js'

export default async function handler(request, response) {
  try {
    await handleVercelRequest(request, response)
  } catch (error) {
    console.error(error)
    if (!response.headersSent) response.writeHead(error.status || 500, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ error: error.message || 'Unexpected server error.', registration: error.registration }))
  }
}
