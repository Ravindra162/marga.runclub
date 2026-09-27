import { createHmac, timingSafeEqual } from 'node:crypto'

const sandbox = process.env.PHONEPE_ENV !== 'production'
const apiBase = sandbox
  ? 'https://api-preprod.phonepe.com/apis/pg-sandbox'
  : 'https://api.phonepe.com/apis/pg'
const authUrl = sandbox
  ? 'https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token'
  : 'https://api.phonepe.com/apis/identity-manager/v1/oauth/token'

let tokenCache = null

export function phonePeConfigured() {
  return Boolean(
    process.env.PHONEPE_CLIENT_ID &&
    process.env.PHONEPE_CLIENT_SECRET &&
    process.env.PHONEPE_CLIENT_VERSION,
  )
}

async function getAccessToken() {
  if (!phonePeConfigured()) throw Object.assign(new Error('PhonePe credentials are not configured on the server.'), { status: 503 })
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.value

  const response = await fetch(authUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.PHONEPE_CLIENT_ID,
      client_version: process.env.PHONEPE_CLIENT_VERSION,
      client_secret: process.env.PHONEPE_CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
  })
  const body = await response.json()
  if (!response.ok || !body.access_token) throw new Error(body.message || 'PhonePe authorization failed.')
  tokenCache = {
    value: body.access_token,
    expiresAt: Number(body.expires_at || Math.floor(Date.now() / 1000) + 1200) * 1000,
  }
  return tokenCache.value
}

async function phonePeRequest(path, options = {}) {
  const token = await getAccessToken()
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `O-Bearer ${token}`,
      ...(process.env.PHONEPE_MERCHANT_ID ? { 'X-MERCHANT-ID': process.env.PHONEPE_MERCHANT_ID } : {}),
      ...(options.headers || {}),
    },
  })
  const body = await response.json()
  if (!response.ok) throw new Error(body.message || body.code || 'PhonePe request failed.')
  return body
}

export function merchantOrderId() {
  return `MRC_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export async function createCheckoutOrder({ merchantOrderId: orderId, amountMinor, phone, redirectUrl }) {
  if (process.env.PHONEPE_DEMO === 'true' || !phonePeConfigured()) {
    if (process.env.PHONEPE_DEMO !== 'true') throw Object.assign(new Error('PhonePe credentials are not configured on the server.'), { status: 503 })
    return {
      orderId,
      state: 'PENDING',
      redirectUrl: `${process.env.PUBLIC_APP_URL || 'http://localhost:5173'}/?payment=demo&merchantOrderId=${encodeURIComponent(orderId)}`,
      demo: true,
    }
  }

  return phonePeRequest('/checkout/v2/pay', {
    method: 'POST',
    body: JSON.stringify({
      merchantOrderId: orderId,
      amount: amountMinor,
      expireAfter: 1200,
      paymentFlow: {
        type: 'PG_CHECKOUT',
        merchantUrls: { redirectUrl: redirectUrl || process.env.PHONEPE_REDIRECT_URL || `${process.env.PUBLIC_APP_URL}/` },
      },
      ...(phone ? { prefillUserLoginDetails: { phoneNumber: phone } } : {}),
      metaInfo: { udf1: 'Marga Run Club' },
    }),
  })
}

export async function getOrderStatus(orderId) {
  if (process.env.PHONEPE_DEMO === 'true' || !phonePeConfigured()) return { orderId, state: 'PENDING', demo: true, paymentDetails: [] }
  return phonePeRequest(`/checkout/v2/order/${encodeURIComponent(orderId)}/status?details=true`, { method: 'GET' })
}

function safeCompare(left, right) {
  if (!left || !right) return false
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function verifyWebhookSignature(rawBody, headers) {
  if (process.env.PHONEPE_DEMO === 'true') return true
  const secret = process.env.PHONEPE_WEBHOOK_SECRET
  const signature = headers['x-phonepe-checksum-signature'] || headers['authorization']
  if (!secret || !signature) return false

  const digestHex = createHmac('sha256', secret).update(rawBody).digest('hex')
  const digestBase64 = createHmac('sha256', secret).update(rawBody).digest('base64')
  const expectedBasic = `SHA256 ${createHmac('sha256').update(`${process.env.PHONEPE_WEBHOOK_USERNAME || ''}:${process.env.PHONEPE_WEBHOOK_PASSWORD || ''}`).digest('hex')}`
  return safeCompare(signature, digestHex) || safeCompare(signature, digestBase64) || safeCompare(signature, expectedBasic)
}
