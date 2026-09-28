import { useEffect, useMemo, useState } from 'react'
import { Footer } from './Footer'
import { Header } from './Header'
import { Icon } from './Icon'
import { RegistrationModal } from './RegistrationModal'

function formatDate(value) {
  return new Date(value).toLocaleString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function formatTime(value) {
  return new Date(value).toLocaleString('en-IN', { hour: 'numeric', minute: '2-digit' })
}

export function EventDetailPage({ event, onBack, user, onSignIn, onSignOut, onAccount }) {
  const [selectedEvent, setSelectedEvent] = useState(null)
  const ticket = event.tickets?.[0]
  const venue = event.location?.venue || event.location?.address || event.location || 'Location to be announced'
  const price = ticket?.amountMinor ? `₹${Number(ticket.amountMinor) / 100}` : 'Free'
  const detail = ticket?.name || 'Community meetup'
  const action = price === 'Free' ? 'Register Free' : 'Book Slot'
  const date = useMemo(() => formatDate(event.startsAt), [event.startsAt])

  return <div className="app-shell"><Header user={user} onJoin={() => setSelectedEvent(event)} onSignIn={onSignIn} onSignOut={onSignOut} onAccount={onAccount} /><main className="event-detail-page page-container">
    <button className="text-button event-back" type="button" onClick={onBack}><Icon name="arrow_back" size={18} /> Back to all events</button>
    <section className="event-detail-hero">
      <div className="event-detail-image"><img src={event.image} alt={event.alt || event.title} /><span className={`event-day ${event.badgeClass}`}>{event.dayLabel}</span><span className="event-tag">{event.tag}</span></div>
      <div className="event-detail-copy"><div className="section-kicker">{event.category} · MARGA RUN CLUB</div><h1>{event.title}</h1><p className="event-detail-description">{event.description || 'Come move, play, and meet your people at Marga Run Club.'}</p><div className="event-detail-facts"><div><Icon name="calendar_month" size={20} /><span><small>When</small><strong>{date}</strong><b>{formatTime(event.startsAt)}{event.endsAt ? ` – ${formatTime(event.endsAt)}` : ''}</b></span></div><div><Icon name="location_on" size={20} /><span><small>Where</small><strong>{venue}</strong><b>{detail}</b></span></div><div><Icon name="payments" size={20} /><span><small>Entry</small><strong>{price}</strong><b>{price === 'Free' ? 'No payment required' : 'Per participant'}</b></span></div></div><button className="button button-primary button-large event-detail-cta" type="button" onClick={() => setSelectedEvent(event)}>{action} <Icon name="arrow_forward" size={19} /></button></div>
    </section>
    <section className="event-detail-note"><div className="section-kicker">WHAT TO EXPECT</div><h2>SHOW UP READY TO MOVE</h2><p>Bring comfortable gear, arrive a few minutes early, and look out for the Marga crew at the venue. First-timers are always welcome—there are no auditions and no cliques.</p></section>
  </main><Footer />{selectedEvent && <RegistrationModal event={selectedEvent} user={user} onClose={() => setSelectedEvent(null)} />}</div>
}
