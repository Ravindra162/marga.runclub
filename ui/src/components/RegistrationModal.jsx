import { useEffect, useState } from 'react'
import { Icon } from './Icon'

export function RegistrationModal({ event, onClose }) {
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')

  useEffect(() => {
    const onKeyDown = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKeyDown)
    document.body.classList.add('modal-open')
    return () => { document.removeEventListener('keydown', onKeyDown); document.body.classList.remove('modal-open') }
  }, [onClose])

  async function submitRegistration(e) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const response = await fetch('/api/registrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: event.id, name, email }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to register right now.')
      setSubmitted(true)
    } catch (submitError) {
      setError(submitError.message || 'Unable to register right now.')
    } finally {
      setSubmitting(false)
    }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><div className="registration-modal" role="dialog" aria-modal="true" aria-labelledby="registration-title"><button className="modal-close" type="button" onClick={onClose} aria-label="Close registration"><Icon name="close" size={22} /></button>{submitted ? <div className="success-state"><span className="success-icon"><Icon name="check" size={28} /></span><div className="section-kicker">YOU'RE ON THE LIST</div><h2>SEE YOU AT {event.title.toUpperCase()}</h2><p>We’ll send the meetup details and your confirmation to <strong>{email}</strong>.</p><button type="button" className="button button-primary" onClick={onClose}>Done <Icon name="arrow_forward" size={18} /></button></div> : <><div className="section-kicker">MARGA EVENT RSVP</div><h2 id="registration-title">JOIN {event.title.toUpperCase()}</h2><p className="modal-intro">A friendly spot is waiting. Add your details and we’ll confirm the meetup by email.</p><div className="modal-event-summary"><span className="modal-day">{event.dayLabel}</span><strong>{event.location}</strong><small>{event.price === 'Free' || event.price === 'Free RSVP' ? 'Free community entry' : `${event.price} per player`}</small></div><form onSubmit={submitRegistration}><label>Full name<input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" /></label><label>Email address<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button button-primary modal-submit" type="submit" disabled={submitting}>{submitting ? 'Saving your spot…' : 'Confirm my spot'} {!submitting && <Icon name="arrow_forward" size={18} />}</button></form><small className="modal-note">For paid court events, PhonePe / UPI checkout will be connected here next.</small></>}</div></div>
}
