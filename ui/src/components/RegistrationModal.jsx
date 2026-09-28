import { useEffect, useState } from 'react'
import { Icon } from './Icon'

function inputType(type) {
  return ({ email: 'email', phone: 'tel', number: 'number', date: 'date', time: 'time' })[type] || 'text'
}

function fieldValue(fields, answers, predicate) {
  const field = fields.find(predicate)
  return field ? answers[field.key] : undefined
}

function identityAnswers(fields, answers) {
  const email = answers.email || fieldValue(fields, answers, (field) => field.type === 'email' || /email/i.test(`${field.key} ${field.label}`))
  const name = answers.full_name || answers.name || fieldValue(fields, answers, (field) => {
    const text = `${field.key} ${field.label}`.toLowerCase()
    return /full.?name|your.?name|what.*name|\bname\b/.test(text) && !/emergency/.test(text)
  })
  const phone = answers.phone || fieldValue(fields, answers, (field) => field.type === 'phone' || /whats?app|phone|mobile|contact.?number/i.test(`${field.key} ${field.label}`))
  return { name: String(name || '').trim(), email: String(email || '').trim(), phone: String(phone || '').trim() }
}

function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = resolve
    script.onerror = () => reject(new Error('Razorpay Checkout could not be loaded.'))
    document.head.appendChild(script)
  })
}

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

async function verifyOrReconcilePayment({ registrationCode, payment, checkoutResult }) {
  let lastError = new Error('Payment verification is still processing.')
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const verifyResponse = await fetch('/api/payments/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ registrationCode, ...checkoutResult }) })
    const verifyResult = await verifyResponse.json()
    if (verifyResponse.ok) return verifyResult
    lastError = new Error(verifyResult.error || 'Payment verification failed.')

    const statusResponse = await fetch(`/api/payments/${encodeURIComponent(payment.merchantOrderId)}/status`)
    const statusResult = await statusResponse.json()
    if (statusResponse.ok && statusResult.payment?.registrationStatus === 'expired') throw new Error(statusResult.payment.message || 'Payment succeeded, but the event became full. Please contact the organizers for a refund.')
    if (statusResponse.ok && statusResult.payment?.status === 'paid') return { registration: { registrationCode, status: statusResult.payment.registrationStatus || 'confirmed' }, payment: statusResult.payment }
    if (attempt < 3) await wait(1000 * (attempt + 1))
  }
  throw lastError
}

function DynamicField({ field, value, onChange }) {
  const config = field.config || {}
  if (field.type === 'heading') return <h3 className="dynamic-field-heading">{field.label}</h3>
  if (field.type === 'paragraph') return <p className="dynamic-field-help">{field.label}</p>
  if (field.type === 'long_text') return <label>{field.label}{field.required && ' *'}<textarea required={field.required} value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={config.placeholder || ''} /></label>
  if (field.type === 'boolean' || field.type === 'consent') return <label className="checkbox-field"><input type="checkbox" required={field.required} checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} /><span>{field.label}{field.required && ' *'}</span></label>
  if (field.type === 'dropdown' || field.type === 'radio') return <label>{field.label}{field.required && ' *'}<select required={field.required} value={value || ''} onChange={(e) => onChange(e.target.value)}><option value="">Choose an option</option>{(config.options || []).map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
  if (field.type === 'multi_select' || field.type === 'checkbox') return <fieldset className="choice-field"><legend>{field.label}{field.required && ' *'}</legend>{(config.options || []).map((option) => <label key={option} className="checkbox-field"><input type="checkbox" checked={Array.isArray(value) && value.includes(option)} onChange={(e) => { const current = Array.isArray(value) ? value : []; onChange(e.target.checked ? [...current, option] : current.filter((item) => item !== option)) }} /><span>{option}</span></label>)}</fieldset>
  if (field.key === 'ticket_quantity') {
    const quantity = Math.max(1, Math.min(10, Number(value) || 1))
    return <label>{field.label}{field.required && ' *'}<span className="quantity-stepper"><button type="button" aria-label="Decrease number of tickets" onClick={() => onChange(quantity - 1)} disabled={quantity <= 1}>−</button><input required={field.required} type="number" min="1" max="10" value={quantity} onChange={(e) => onChange(e.target.value)} aria-label={field.label} /><button type="button" aria-label="Increase number of tickets" onClick={() => onChange(quantity + 1)} disabled={quantity >= 10}>+</button></span></label>
  }
  return <label>{field.label}{field.required && ' *'}<input required={field.required} type={inputType(field.type)} min={config.min} max={config.max} autoComplete={field.type === 'email' ? 'email' : /name/i.test(field.key) ? 'name' : field.type === 'phone' ? 'tel' : undefined} value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={config.placeholder || ''} /></label>
}

export function RegistrationModal({ event, onClose, user }) {
  const [form, setForm] = useState(null)
  const [answers, setAnswers] = useState({ full_name: user?.name || '', email: user?.email || '', phone: '', ticket_quantity: 1 })
  const [quantity, setQuantity] = useState(1)
  const [attendees, setAttendees] = useState([])
  const [submitted, setSubmitted] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const onKeyDown = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKeyDown)
    document.body.classList.add('modal-open')
    const occurrenceId = event.occurrenceId || event.id
    fetch(`/api/events/${encodeURIComponent(occurrenceId)}/form`).then((response) => response.json()).then((result) => { setForm(result.form); setAnswers((current) => ({ ...current, full_name: user?.name || current.full_name, email: user?.email || current.email })) }).catch(() => setForm(null))
    return () => { document.removeEventListener('keydown', onKeyDown); document.body.classList.remove('modal-open') }
  }, [event.id, onClose, user?.email, user?.name])

  function changeQuantity(value) {
    const nextQuantity = Math.max(1, Math.min(10, Number(value) || 1))
    setQuantity(nextQuantity)
    setAnswers((current) => ({ ...current, ticket_quantity: nextQuantity }))
    setAttendees((current) => Array.from({ length: nextQuantity - 1 }, (_, index) => current[index] || { name: '', email: '', phone: '' }))
  }

  async function submitRegistration(e) {
    e.preventDefault(); setSubmitting(true); setError('')
    try {
      const identity = identityAnswers(form?.fields || [], answers)
      const name = identity.name
      const email = identity.email
       const occurrenceId = event.occurrenceId || event.id
       if (name.length < 2 || !email.includes('@') || !occurrenceId) throw new Error('Please enter your name and a valid email address.')
       if (fields.some((field) => field.required && (answers[field.key] === undefined || answers[field.key] === '' || (Array.isArray(answers[field.key]) && !answers[field.key].length)))) throw new Error('Please complete all required fields.')
       const attendeeDetails = Array.from({ length: quantity - 1 }, (_, index) => ({ name: answers[`attendee_${index + 1}_name`], email: answers[`attendee_${index + 1}_email`], phone: answers[`attendee_${index + 1}_phone`] }))
        const response = await fetch('/api/registrations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId: occurrenceId, name, email, phone: identity.phone, answers, quantity, attendees: attendeeDetails }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to register right now.')
      if (result.registration.paymentRequired) {
        const paymentResponse = await fetch('/api/payments/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ registrationCode: result.registration.registration_code || result.registration.registrationCode, redirectUrl: window.location.href }) })
        const paymentResult = await paymentResponse.json()
        if (!paymentResponse.ok) throw new Error(paymentResult.error || 'Your spot was saved, but checkout could not be started.')
        const payment = paymentResult.payment
        await loadRazorpay()
        await new Promise((resolve, reject) => {
          const checkout = new window.Razorpay({
            key: payment.keyId,
            amount: payment.amount,
            currency: payment.currency,
            name: 'Marga Run Club',
            description: event.title,
            order_id: payment.razorpayOrderId,
            prefill: { name, email, contact: identity.phone },
            notes: { registration_code: result.registration.registration_code || result.registration.registrationCode },
            theme: { color: '#d94f2b' },
            handler: async (checkoutResult) => {
              try {
                const registrationCode = result.registration.registration_code || result.registration.registrationCode
                const verifyResult = await verifyOrReconcilePayment({ registrationCode, payment, checkoutResult })
                if (verifyResult.registration?.status !== 'confirmed') throw new Error(verifyResult.payment?.message || 'Payment succeeded, but your registration could not be confirmed. Please contact the organizers.')
                result.registration = { ...result.registration, ...verifyResult.registration, paymentRequired: false, paymentStatus: 'paid' }
                resolve()
              } catch (verificationError) { reject(verificationError) }
            },
             modal: { ondismiss: () => reject(new Error('Payment was cancelled. No slot was booked. You can try again anytime.')) },
          })
          checkout.open()
        })
      }
       setSubmitted(result.registration)
    } catch (submitError) { setError(submitError.message || 'Unable to register right now.') } finally { setSubmitting(false) }
  }

  const fields = [...(form?.fields || [
    { key: 'full_name', type: 'short_text', label: 'Full name', required: true, config: { placeholder: 'Your name' } },
    { key: 'email', type: 'email', label: 'Email address', required: true, config: { placeholder: 'you@example.com' } },
  ]), { key: 'ticket_quantity', type: 'number', label: 'Number of tickets', required: true, config: { min: 1, max: 10, placeholder: '1' } }, ...Array.from({ length: quantity - 1 }, (_, index) => [
    { key: `attendee_${index + 1}_name`, type: 'short_text', label: `Additional attendee ${index + 1} — full name`, required: true, config: { placeholder: 'Full name' } },
    { key: `attendee_${index + 1}_email`, type: 'email', label: `Additional attendee ${index + 1} — email`, required: true, config: { placeholder: 'you@example.com' } },
    { key: `attendee_${index + 1}_phone`, type: 'phone', label: `Additional attendee ${index + 1} — phone`, required: false, config: { placeholder: '+91' } },
  ]).flat()]

  return <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><div className="registration-modal" role="dialog" aria-modal="true" aria-labelledby="registration-title"><button className="modal-close" type="button" onClick={onClose} aria-label="Close registration"><Icon name="close" size={22} /></button>{submitted ? <div className="success-state"><span className="success-icon"><Icon name="check" size={28} /></span><div className="section-kicker">{submitted.paymentRequired ? 'SPOT HELD' : "YOU'RE ON THE LIST"}</div><h2>{submitted.paymentRequired ? 'PAYMENT CHECKOUT READY' : `SEE YOU AT ${event.title.toUpperCase()}`}</h2><p>Your registration code is <strong>{submitted.registration_code || submitted.registrationCode}</strong>. {submitted.paymentRequired ? 'Complete Razorpay checkout to confirm your spot.' : `We’ll send the meetup details to ${identityAnswers(fields, answers).email}.`}</p><button type="button" className="button button-primary" onClick={onClose}>Done <Icon name="arrow_forward" size={18} /></button></div> : <><div className="section-kicker">MARGA EVENT RSVP</div><h2 id="registration-title">JOIN {event.title.toUpperCase()}</h2><p className="modal-intro">A friendly spot is waiting. Add your details and we’ll confirm the meetup by email.</p><div className="modal-event-summary"><span className="modal-day">{event.dayLabel}</span><strong>{event.location}</strong><small>{event.price === 'Free' || event.price === 'Free RSVP' ? 'Free community entry' : `${event.price} per player`} · {quantity} ticket{quantity === 1 ? '' : 's'}</small></div><form onSubmit={submitRegistration}>{fields.map((field) => <DynamicField key={field.id || field.key} field={field} value={answers[field.key]} onChange={(value) => field.key === 'ticket_quantity' ? changeQuantity(value) : setAnswers((current) => ({ ...current, [field.key]: value }))} />)}{error && <p className="form-error" role="alert">{error}</p>}<button className="button button-primary modal-submit" type="submit" disabled={submitting}>{submitting ? 'Saving your spot…' : event.price === 'Free' ? 'Confirm my spot' : 'Continue to Razorpay'} {!submitting && <Icon name="arrow_forward" size={18} />}</button></form><small className="modal-note">Your answers are stored securely with this event’s published form version.</small></>}</div></div>
}
