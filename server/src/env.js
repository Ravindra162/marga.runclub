import dotenv from 'dotenv'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

// Vercel injects environment variables directly. Local development loads the
// ignored Neon and server env files, with server settings taking precedence.
if (process.env.VERCEL !== '1') {
  dotenv.config({ path: join(projectRoot, '.env.local') })
  dotenv.config({ path: join(projectRoot, 'server', '.env') })
}
