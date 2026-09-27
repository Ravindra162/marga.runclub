import { betterAuth } from 'better-auth'
import { pool } from './db.js'

const appUrl = process.env.PUBLIC_APP_URL || 'http://localhost:5173'
const apiUrl = process.env.AUTH_URL || 'http://localhost:8787'

const socialProviders = process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  ? {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        prompt: 'select_account',
        requireEmailVerification: true,
      },
    }
  : undefined

export const auth = betterAuth({
  database: pool,
  baseURL: apiUrl,
  basePath: '/api/auth',
  secret: process.env.BETTER_AUTH_SECRET || 'local-development-only-change-me',
  trustedOrigins: [appUrl, process.env.UI_ORIGIN, apiUrl].filter(Boolean),
  socialProviders,
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await syncAppUser(user)
        },
      },
      update: {
        after: async (user) => {
          await syncAppUser(user)
        },
      },
    },
  },
  advanced: {
    database: {
      joins: true,
    },
  },
})

async function syncAppUser(user) {
  await pool.query(`
    INSERT INTO app_users (email, display_name, auth_user_id)
    VALUES ($1, $2, $3)
    ON CONFLICT (lower(email)) DO UPDATE SET display_name = EXCLUDED.display_name, auth_user_id = EXCLUDED.auth_user_id, updated_at = now()
  `, [user.email.toLowerCase(), user.name || user.email, user.id])
}

export function authIsConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.BETTER_AUTH_SECRET)
}
