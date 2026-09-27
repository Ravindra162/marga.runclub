import { useEffect, useMemo, useRef, useState } from 'react'
import { CommunitySection } from './components/CommunitySection'
import { EventsSection } from './components/EventsSection'
import { Footer } from './components/Footer'
import { Header } from './components/Header'
import { Hero } from './components/Hero'
import { Marquee } from './components/Marquee'
import { RegistrationModal } from './components/RegistrationModal'
import { AdminDashboard } from './components/AdminDashboard'
import { events as fallbackEvents } from './data/mockData'

function App() {
  const [activeFilter, setActiveFilter] = useState('All Events')
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [events, setEvents] = useState(fallbackEvents)
  const [adminOpen, setAdminOpen] = useState(false)
  const eventsRef = useRef(null)
  useEffect(() => {
    fetch('/api/events')
      .then((response) => response.json())
      .then((result) => {
        if (!result.events?.length) return
        setEvents((current) => result.events.map((event, index) => {
          const fallback = current[index % current.length]
          return {
            ...fallback,
            ...event,
            id: event.eventId,
            location: event.location?.venue || event.location?.address || fallback.location,
            dayLabel: new Date(event.startsAt).toLocaleString('en-IN', { weekday: 'short', hour: '2-digit', minute: '2-digit' }).toUpperCase(),
            detail: event.tickets?.[0]?.name || 'Community meetup',
            price: event.price,
            action: event.price === 'Free' ? 'Register Free' : 'Book Slot',
            tag: `${event.category} • COMMUNITY`,
          }
        }))
      })
      .catch(() => {})
  }, [])
  const visibleEvents = useMemo(() => activeFilter === 'All Events' ? events : events.filter((event) => event.category === activeFilter), [activeFilter, events])
  const openEvent = (event) => setSelectedEvent(event === 'all' ? events[0] : event)
  const scrollToEvents = () => eventsRef.current?.scrollIntoView({ behavior: 'smooth' })

  return adminOpen ? <AdminDashboard onClose={() => setAdminOpen(false)} /> : <div className="app-shell"><Header onJoin={openEvent} onAdmin={() => setAdminOpen(true)} /><main><Hero onExplore={scrollToEvents} /><Marquee /><div ref={eventsRef}><EventsSection activeFilter={activeFilter} setActiveFilter={setActiveFilter} visibleEvents={visibleEvents} onRegister={setSelectedEvent} /></div><CommunitySection /><section className="closing-section page-container" id="schedule"><div className="closing-card"><div className="closing-grid"><div><div className="closing-kicker">⌁ NEXT MEET: THIS SUNDAY 6:30 AM</div><h2>READY TO TAKE YOUR FIRST STRIDE?</h2><p>Join 1,800+ members this week. No auditions, no memberships required—just show up in your sneakers.</p></div><div className="closing-actions"><button type="button" className="button button-primary button-large" onClick={scrollToEvents}>See all events <span>→</span></button><a className="button button-light" href="https://wa.me/919999999999" target="_blank" rel="noreferrer">♧ WhatsApp Community</a></div></div><div className="closing-bottom"><span>Instant RSVP via WhatsApp &amp; PhonePe / UPI</span><b>#RUNMARGA • NO STRANGERS HERE</b></div></div></section></main><Footer />{selectedEvent && <RegistrationModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />}</div>
}

export default App
