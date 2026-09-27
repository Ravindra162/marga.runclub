import { useMemo, useRef, useState } from 'react'
import { CommunitySection } from './components/CommunitySection'
import { EventsSection } from './components/EventsSection'
import { Footer } from './components/Footer'
import { Header } from './components/Header'
import { Hero } from './components/Hero'
import { Marquee } from './components/Marquee'
import { RegistrationModal } from './components/RegistrationModal'
import { events } from './data/mockData'

function App() {
  const [activeFilter, setActiveFilter] = useState('All Events')
  const [selectedEvent, setSelectedEvent] = useState(null)
  const eventsRef = useRef(null)
  const visibleEvents = useMemo(() => activeFilter === 'All Events' ? events : events.filter((event) => event.category === activeFilter), [activeFilter])
  const openEvent = (event) => setSelectedEvent(event === 'all' ? events[0] : event)
  const scrollToEvents = () => eventsRef.current?.scrollIntoView({ behavior: 'smooth' })

  return <div className="app-shell"><Header onJoin={openEvent} /><main><Hero onExplore={scrollToEvents} /><Marquee /><div ref={eventsRef}><EventsSection activeFilter={activeFilter} setActiveFilter={setActiveFilter} visibleEvents={visibleEvents} onRegister={setSelectedEvent} /></div><CommunitySection /><section className="closing-section page-container" id="schedule"><div className="closing-card"><div className="closing-grid"><div><div className="closing-kicker">⌁ NEXT MEET: THIS SUNDAY 6:30 AM</div><h2>READY TO TAKE YOUR FIRST STRIDE?</h2><p>Join 1,800+ members this week. No auditions, no memberships required—just show up in your sneakers.</p></div><div className="closing-actions"><button type="button" className="button button-primary button-large" onClick={scrollToEvents}>See all events <span>→</span></button><a className="button button-light" href="https://wa.me/919999999999" target="_blank" rel="noreferrer">♧ WhatsApp Community</a></div></div><div className="closing-bottom"><span>Instant RSVP via WhatsApp &amp; PhonePe / UPI</span><b>#RUNMARGA • NO STRANGERS HERE</b></div></div></section></main><Footer />{selectedEvent && <RegistrationModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />}</div>
}

export default App
