import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const { Client } = pg
const root = dirname(fileURLToPath(import.meta.url))
const client = new Client({ connectionString: process.env.DATABASE_URL })

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required. Copy server/.env.example to server/.env and set it.')

await client.connect()
try {
  await client.query(await readFile(join(root, '..', 'db', 'schema.sql'), 'utf8'))
  await client.query(await readFile(join(root, '..', 'db', 'seed.sql'), 'utf8'))
  console.log('Marga Run Club PostgreSQL schema and seed applied.')
} finally {
  await client.end()
}
