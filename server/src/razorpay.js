import './env.js'
import { createHmac, timingSafeEqual } from 'node:crypto'

const apiBase = 'https://api.razorpay.com/v1'

export function razorpayConfigured() {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET)
}

export function merchantOrderId() {
  return `MRC_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

async function razorpayRequest(path, options = {}) {
  if (!razorpayConfigured()) throw Object.assign(new Error('Razorpay credentials are not configured on the server.'), { status: 503 })
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')}`,
      ...(options.headers || {}),
    },
  })
  const body = await response.json()
  if (!response.ok) throw Object.assign(new Error(body.error?.description || body.error?.reason || 'Razorpay request failed.'), { status: response.status })
  return body
}

export async function createCheckoutOrder({ receipt, amountMinor, currency = 'INR', notes = {} }) {
  const order = await razorpayRequest('/orders', {
    method: 'POST',
    body: JSON.stringify({ amount: amountMinor, currency, receipt, payment_capture: 1, notes }),
  })
  return { orderId: order.id, amount: order.amount, currency: order.currency, status: order.status, createdAt: order.created_at }
}

export async function getOrderStatus(orderId) {
  const order = await razorpayRequest(`/orders/${encodeURIComponent(orderId)}`, { method: 'GET' })
  return {
    orderId: order.id,
    state: order.status === 'paid' ? 'COMPLETED' : order.status === 'attempted' ? 'PENDING' : String(order.status || '').toUpperCase(),
    amount: order.amount,
    paymentDetails: [],
    providerPayload: order,
  }
}

export async function getPayment(paymentId) {
  return razorpayRequest(`/payments/${encodeURIComponent(paymentId)}`, { method: 'GET' })
}

export function verifyPaymentSignature(orderId, paymentId, signature) {
  if (!razorpayConfigured() || !orderId || !paymentId || !signature) return false
  const expected = createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest()
  const received = Buffer.from(signature)
  return received.length === expected.length && timingSafeEqual(received, expected)
}

export function verifyWebhookSignature(rawBody, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET
  if (!secret || !signature) return false
  const expected = createHmac('sha256', secret).update(rawBody).digest()
  const received = Buffer.from(signature)
  return received.length === expected.length && timingSafeEqual(received, expected)
}
