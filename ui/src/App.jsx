import { useEffect, useMemo, useRef, useState } from 'react'
import { CommunitySection } from './components/CommunitySection'
import { EventsSection } from './components/EventsSection'
import { Footer } from './components/Footer'
import { Header } from './components/Header'
import { Hero } from './components/Hero'
import { Marquee } from './components/Marquee'
import { RegistrationModal } from './components/RegistrationModal'
import { AdminDashboard } from './components/AdminDashboard'
import { MemberDashboard } from './components/MemberDashboard'

function App() {
  const [activeFilter, setActiveFilter] = useState('All Events')
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [events, setEvents] = useState([])
  const [adminOpen, setAdminOpen] = useState(false)
  const [memberOpen, setMemberOpen] = useState(false)
  const [user, setUser] = useState(null)
  const eventsRef = useRef(null)
  useEffect(() => {
    fetch('/api/events')
      .then((response) => response.json())
      .then((result) => {
        setEvents((result.events || []).map((event) => ({
          ...event,
          id: event.occurrenceId,
          location: event.location?.venue || event.location?.address || 'Location to be announced',
          dayLabel: new Date(event.startsAt).toLocaleString('en-IN', { weekday: 'short', hour: '2-digit', minute: '2-digit' }).toUpperCase(),
          detail: event.tickets?.[0]?.name || 'Community meetup',
          action: event.price === 'Free' ? 'Register Free' : 'Book Slot',
          tag: `${event.category} • COMMUNITY`,
          icon: 'how_to_reg',
          badgeClass: 'badge-blue',
          priceClass: event.price === 'Free' ? 'price-green' : 'price-dark',
        })))
      })
      .catch(() => {})
  }, [])
  useEffect(() => {
    fetch('/api/me', { credentials: 'include' }).then((response) => response.json()).then((result) => setUser(result.user || null)).catch(() => {})
  }, [])
  const visibleEvents = useMemo(() => activeFilter === 'All Events' ? events : events.filter((event) => event.category === activeFilter), [activeFilter, events])
  const openEvent = (event) => setSelectedEvent(event === 'all' ? events[0] : event)
  const scrollToEvents = () => eventsRef.current?.scrollIntoView({ behavior: 'smooth' })
  const signIn = async () => {
    const response = await fetch('/api/auth/sign-in/social', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: 'google', callbackURL: `${window.location.origin}${window.location.pathname}` }) })
    const result = await response.json()
    if (!response.ok || !result.url) return window.alert(result.error || 'Google sign-in is not configured yet.')
    window.location.assign(result.url)
  }
  const signOut = async () => {
    await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' })
    setUser(null)
    setMemberOpen(false)
  }

  return adminOpen ? <AdminDashboard onClose={() => setAdminOpen(false)} /> : memberOpen ? <MemberDashboard user={user} onClose={() => setMemberOpen(false)} onSignOut={signOut} /> : <div className="app-shell"><Header user={user} onJoin={openEvent} onAdmin={() => setAdminOpen(true)} onSignIn={signIn} onSignOut={signOut} onAccount={() => setMemberOpen(true)} /><main><Hero onExplore={scrollToEvents} /><Marquee /><div ref={eventsRef}><EventsSection activeFilter={activeFilter} setActiveFilter={setActiveFilter} visibleEvents={visibleEvents} onRegister={setSelectedEvent} /></div><CommunitySection /><section className="closing-section page-container" id="schedule"><div className="closing-card"><div className="closing-grid"><div><div className="closing-kicker">⌁ NEXT MEET: THIS SUNDAY 6:30 AM</div><h2>READY TO TAKE YOUR FIRST STRIDE?</h2><p>Join 1,800+ members this week. No auditions, no memberships required—just show up in your sneakers.</p></div><div className="closing-actions"><button type="button" className="button button-primary button-large" onClick={scrollToEvents}>See all events <span>→</span></button><a className="button button-light" href="https://wa.me/919999999999" target="_blank" rel="noreferrer">♧ WhatsApp Community</a></div></div><div className="closing-bottom"><span>Instant RSVP via Razorpay / UPI</span><b>#RUNMARGA • NO STRANGERS HERE</b></div></div></section></main><Footer />{selectedEvent && <RegistrationModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />}</div>
}

export default App
