import dotenv from 'dotenv'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const { Client } = pg
const root = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(root, '..', '..', '.env.local') })
dotenv.config({ path: join(root, '..', '.env') })
const client = new Client({ connectionString: process.env.DATABASE_URL })

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required. Copy server/.env.example to server/.env and set it.')

await client.connect()
try {
  const schemaExists = await client.query(`SELECT to_regclass('public.organizations') IS NOT NULL AS exists`)
  if (!schemaExists.rows[0].exists) {
    await client.query(await readFile(join(root, '..', 'db', 'schema.sql'), 'utf8'))
  } else {
    console.log('Marga Run Club PostgreSQL schema already exists; applying seed only.')
    await client.query(`
      ALTER TABLE app_users ADD COLUMN IF NOT EXISTS auth_user_id text;
      CREATE UNIQUE INDEX IF NOT EXISTS app_users_auth_user_id_idx ON app_users (auth_user_id) WHERE auth_user_id IS NOT NULL;
      CREATE TABLE IF NOT EXISTS "user" (
        "id" text NOT NULL PRIMARY KEY,
        "name" text NOT NULL,
        "email" text NOT NULL UNIQUE,
        "emailVerified" boolean NOT NULL,
        "image" text,
        "createdAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
        "updatedAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
      CREATE TABLE IF NOT EXISTS "session" (
        "id" text NOT NULL PRIMARY KEY,
        "expiresAt" timestamptz NOT NULL,
        "token" text NOT NULL UNIQUE,
        "createdAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
        "updatedAt" timestamptz NOT NULL,
        "ipAddress" text,
        "userAgent" text,
        "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS "account" (
        "id" text NOT NULL PRIMARY KEY,
        "accountId" text NOT NULL,
        "providerId" text NOT NULL,
        "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
        "accessToken" text,
        "refreshToken" text,
        "idToken" text,
        "accessTokenExpiresAt" timestamptz,
        "refreshTokenExpiresAt" timestamptz,
        "scope" text,
        "password" text,
        "createdAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
        "updatedAt" timestamptz NOT NULL
      );
      CREATE TABLE IF NOT EXISTS "verification" (
        "id" text NOT NULL PRIMARY KEY,
        "identifier" text NOT NULL,
        "value" text NOT NULL,
        "expiresAt" timestamptz NOT NULL,
        "createdAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
        "updatedAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session" ("userId");
      CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account" ("userId");
      CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification" ("identifier");
      ALTER TABLE payment_orders DROP CONSTRAINT IF EXISTS payment_orders_provider_check;
      UPDATE payment_orders SET provider = 'razorpay' WHERE provider = 'phonepe';
      ALTER TABLE payment_orders ADD CONSTRAINT payment_orders_provider_check CHECK (provider IN ('razorpay'));
      ALTER TABLE payment_orders ALTER COLUMN provider SET DEFAULT 'razorpay';
      UPDATE payment_webhook_events SET provider = 'razorpay' WHERE provider = 'phonepe';
      ALTER TABLE payment_webhook_events ALTER COLUMN provider SET DEFAULT 'razorpay';
      CREATE TABLE IF NOT EXISTS email_deliveries (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        registration_id uuid NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
        email_type text NOT NULL CHECK (email_type IN ('registration_confirmation')),
        recipient_email text NOT NULL,
        status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
        provider text NOT NULL DEFAULT 'resend',
        provider_message_id text,
        error_message text,
        sent_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (registration_id, email_type)
      );
      CREATE INDEX IF NOT EXISTS email_deliveries_status_idx ON email_deliveries (status, created_at);
    `)
  }
  await client.query(await readFile(join(root, '..', 'db', 'seed.sql'), 'utf8'))
  console.log('Marga Run Club PostgreSQL schema and seed applied.')
} finally {
  await client.end()
}
