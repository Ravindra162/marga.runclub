import { useEffect, useState } from 'react'
import { Icon } from './Icon'

function inputType(type) {
  return ({ email: 'email', phone: 'tel', number: 'number', date: 'date', time: 'time' })[type] || 'text'
}

function DynamicField({ field, value, onChange }) {
  const config = field.config || {}
  if (field.type === 'heading') return <h3 className="dynamic-field-heading">{field.label}</h3>
  if (field.type === 'paragraph') return <p className="dynamic-field-help">{field.label}</p>
  if (field.type === 'long_text') return <label>{field.label}{field.required && ' *'}<textarea required={field.required} value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={config.placeholder || ''} /></label>
  if (field.type === 'boolean' || field.type === 'consent') return <label className="checkbox-field"><input type="checkbox" required={field.required} checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} /><span>{field.label}{field.required && ' *'}</span></label>
  if (field.type === 'dropdown' || field.type === 'radio') return <label>{field.label}{field.required && ' *'}<select required={field.required} value={value || ''} onChange={(e) => onChange(e.target.value)}><option value="">Choose an option</option>{(config.options || []).map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
  if (field.type === 'multi_select' || field.type === 'checkbox') return <fieldset className="choice-field"><legend>{field.label}{field.required && ' *'}</legend>{(config.options || []).map((option) => <label key={option} className="checkbox-field"><input type="checkbox" checked={Array.isArray(value) && value.includes(option)} onChange={(e) => { const current = Array.isArray(value) ? value : []; onChange(e.target.checked ? [...current, option] : current.filter((item) => item !== option)) }} /><span>{option}</span></label>)}</fieldset>
  return <label>{field.label}{field.required && ' *'}<input required={field.required} type={inputType(field.type)} value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={config.placeholder || ''} /></label>
}

export function RegistrationModal({ event, onClose }) {
  const [form, setForm] = useState(null)
  const [answers, setAnswers] = useState({ full_name: '', email: '', phone: '' })
  const [submitted, setSubmitted] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const onKeyDown = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKeyDown)
    document.body.classList.add('modal-open')
    fetch(`/api/events/${encodeURIComponent(event.id)}/form`).then((response) => response.json()).then((result) => setForm(result.form)).catch(() => setForm(null))
    return () => { document.removeEventListener('keydown', onKeyDown); document.body.classList.remove('modal-open') }
  }, [event.id, onClose])

  async function submitRegistration(e) {
    e.preventDefault(); setSubmitting(true); setError('')
    try {
      const response = await fetch('/api/registrations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId: event.id, name: answers.full_name, email: answers.email, phone: answers.phone, answers }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to register right now.')
      if (result.registration.paymentRequired) {
        const paymentResponse = await fetch('/api/payments/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ registrationCode: result.registration.registration_code || result.registration.registrationCode, redirectUrl: window.location.href }) })
        const paymentResult = await paymentResponse.json()
        if (!paymentResponse.ok) throw new Error(paymentResult.error || 'Your spot was saved, but checkout could not be started.')
        if (paymentResult.payment?.checkoutUrl && !paymentResult.payment.demo) {
          window.location.assign(paymentResult.payment.checkoutUrl)
          return
        }
        result.registration.paymentDemo = true
      }
      setSubmitted(result.registration)
    } catch (submitError) { setError(submitError.message || 'Unable to register right now.') } finally { setSubmitting(false) }
  }

  const fields = form?.fields || [
    { key: 'full_name', type: 'short_text', label: 'Full name', required: true, config: { placeholder: 'Your name' } },
    { key: 'email', type: 'email', label: 'Email address', required: true, config: { placeholder: 'you@example.com' } },
  ]

  return <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><div className="registration-modal" role="dialog" aria-modal="true" aria-labelledby="registration-title"><button className="modal-close" type="button" onClick={onClose} aria-label="Close registration"><Icon name="close" size={22} /></button>{submitted ? <div className="success-state"><span className="success-icon"><Icon name="check" size={28} /></span><div className="section-kicker">{submitted.paymentRequired ? 'SPOT HELD' : "YOU'RE ON THE LIST"}</div><h2>{submitted.paymentRequired ? 'PAYMENT CHECKOUT READY' : `SEE YOU AT ${event.title.toUpperCase()}`}</h2><p>Your registration code is <strong>{submitted.registration_code || submitted.registrationCode}</strong>. {submitted.paymentRequired ? (submitted.paymentDemo ? 'Demo mode is active, so no money was charged. Add PhonePe credentials on the server to enable checkout.' : 'Complete PhonePe checkout to confirm your spot.') : `We’ll send the meetup details to ${answers.email}.`}</p><button type="button" className="button button-primary" onClick={onClose}>Done <Icon name="arrow_forward" size={18} /></button></div> : <><div className="section-kicker">MARGA EVENT RSVP</div><h2 id="registration-title">JOIN {event.title.toUpperCase()}</h2><p className="modal-intro">A friendly spot is waiting. Add your details and we’ll confirm the meetup by email.</p><div className="modal-event-summary"><span className="modal-day">{event.dayLabel}</span><strong>{event.location}</strong><small>{event.price === 'Free' || event.price === 'Free RSVP' ? 'Free community entry' : `${event.price} per player`}</small></div><form onSubmit={submitRegistration}>{fields.map((field) => <DynamicField key={field.id || field.key} field={field} value={answers[field.key]} onChange={(value) => setAnswers((current) => ({ ...current, [field.key]: value }))} />)}{error && <p className="form-error" role="alert">{error}</p>}<button className="button button-primary modal-submit" type="submit" disabled={submitting}>{submitting ? 'Saving your spot…' : event.price === 'Free' ? 'Confirm my spot' : 'Continue to PhonePe'} {!submitting && <Icon name="arrow_forward" size={18} />}</button></form><small className="modal-note">Your answers are stored securely with this event’s published form version.</small></>}</div></div>
}
