import './env.js'
import nodemailer from 'nodemailer'

export function emailConfigured() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS && process.env.EMAIL_FROM)
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]))
}

function money(amountMinor, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(Number(amountMinor || 0) / 100)
}

export async function sendRegistrationConfirmationEmail(details) {
  if (!emailConfigured()) {
    console.warn('Confirmation email skipped: SMTP_USER, SMTP_PASS, or EMAIL_FROM is not configured.')
    return { skipped: true }
  }

  const eventDate = new Date(details.startsAt).toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Kolkata' })
  const eventUrl = process.env.PUBLIC_APP_URL ? `${process.env.PUBLIC_APP_URL.replace(/\/$/, '')}/events/${encodeURIComponent(details.occurrenceId)}` : null
  const subject = `Registration confirmed: ${details.eventTitle}`
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || 'true') === 'true',
    auth: { user: process.env.SMTP_USER, pass: String(process.env.SMTP_PASS).replace(/\s/g, '') },
  })
  const result = await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: details.email,
    replyTo: process.env.SMTP_USER,
    subject,
    html: `<!doctype html><html><body style="margin:0;background:#fbf8fc;color:#1b1b1e;font-family:Arial,sans-serif"><div style="max-width:620px;margin:24px auto;padding:32px;background:#fff;border:1px solid #e1bfb6"><p style="color:#ab2f05;font-weight:700;letter-spacing:2px">MARGA RUN CLUB</p><h1 style="font-size:32px;margin:12px 0">You're confirmed, ${escapeHtml(details.fullName)}!</h1><p>Your payment was received and your spot is confirmed.</p><div style="margin:24px 0;padding:20px;border-left:4px solid #ab2f05;background:#f6f2f7"><h2 style="margin:0 0 14px">${escapeHtml(details.eventTitle)}</h2><p style="margin:7px 0"><b>When:</b> ${escapeHtml(eventDate)}</p><p style="margin:7px 0"><b>Where:</b> ${escapeHtml(details.location)}</p><p style="margin:7px 0"><b>Ticket:</b> ${escapeHtml(details.ticketName)}</p><p style="margin:7px 0"><b>Paid:</b> ${escapeHtml(money(details.amountMinor, details.currency))}</p></div><p><b>Registration code:</b> <span style="font-family:monospace;font-size:18px">${escapeHtml(details.registrationCode)}</span></p><p><b>Payment ID:</b> ${escapeHtml(details.paymentId || 'Recorded by Razorpay')}</p>${eventUrl ? `<p style="margin-top:24px"><a href="${escapeHtml(eventUrl)}" style="display:inline-block;padding:13px 18px;background:#e4572e;color:#fff;text-decoration:none;font-weight:700">View event details</a></p>` : ''}<p style="margin-top:28px;color:#59413b;font-size:13px">Please keep this email and your registration code handy at check-in. See you there!</p></div></body></html>`,
    text: `You're confirmed, ${details.fullName}!\n\nEvent: ${details.eventTitle}\nWhen: ${eventDate}\nWhere: ${details.location}\nTicket: ${details.ticketName}\nPaid: ${money(details.amountMinor, details.currency)}\nRegistration code: ${details.registrationCode}\nPayment ID: ${details.paymentId || 'Recorded by Razorpay'}${eventUrl ? `\nEvent details: ${eventUrl}` : ''}`,
  })
  return { providerId: result.messageId }
}
