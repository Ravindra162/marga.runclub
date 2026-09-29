import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { CommunitySection } from './components/CommunitySection'
import { EventsSection } from './components/EventsSection'
import { Footer } from './components/Footer'
import { Header } from './components/Header'
import { Marquee } from './components/Marquee'
import { RegistrationModal } from './components/RegistrationModal'
import { AdminDashboard } from './components/AdminDashboard'
import { MemberDashboard } from './components/MemberDashboard'
import { EventDetailPage } from './components/EventDetailPage'

const fallbackEventImages = {
  Running: 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?auto=format&fit=crop&w=1200&q=85',
  Badminton: 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?auto=format&fit=crop&w=1200&q=85',
  Pickleball: 'https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?auto=format&fit=crop&w=1200&q=85',
  Socials: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=85',
  Fitness: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1200&q=85',
}

function App() {
  const [activeFilter, setActiveFilter] = useState('All Events')
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [events, setEvents] = useState([])
  const [memberOpen, setMemberOpen] = useState(false)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const eventsRef = useRef(null)
  useEffect(() => {
    fetch('/api/events')
      .then((response) => response.json())
      .then((result) => {
        setEvents((result.events || []).map((event) => ({
           ...event,
           id: event.occurrenceId,
           image: event.image || fallbackEventImages[event.category] || fallbackEventImages.Running,
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
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => {
    fetch('/api/me', { credentials: 'include' }).then((response) => response.json()).then((result) => setUser(result.user || null)).catch(() => {})
  }, [])
  const visibleEvents = useMemo(() => activeFilter === 'All Events' ? events : events.filter((event) => event.category === activeFilter), [activeFilter, events])
  useLayoutEffect(() => {
    if (loading) return undefined
    const scope = document.querySelector('.app-shell')
    if (!scope) return undefined
    const context = gsap.context(() => {
      const motion = gsap.matchMedia()
      motion.add({ reduceMotion: '(prefers-reduced-motion: reduce)', mobile: '(max-width: 700px)' }, ({ conditions }) => {
        const { reduceMotion, mobile } = conditions
        const targets = '.site-header, .marquee, .event-card, .value-card, .closing-card'
        if (reduceMotion) {
          gsap.set(targets, { clearProps: 'all', autoAlpha: 1 })
          return
        }

        const lift = mobile ? 14 : 28
        const revealDuration = mobile ? 0.48 : 0.7
        gsap.timeline({ defaults: { ease: 'power3.out' } })
          .from('.site-header', { y: mobile ? -10 : -24, autoAlpha: 0, duration: mobile ? 0.4 : 0.65 })
          .from('.marquee', { y: mobile ? 8 : 18, autoAlpha: 0, duration: mobile ? 0.35 : 0.5 }, '-=0.15')
        if (!mobile) gsap.to('.pulse-dot', { scale: 1.45, opacity: 0.55, duration: 0.75, repeat: -1, yoyo: true, ease: 'sine.inOut' })

        const observers = gsap.utils.toArray('.event-card, .value-card, .closing-card').map((element) => {
          gsap.set(element, { y: lift, autoAlpha: 0 })
          const observer = new IntersectionObserver(([entry]) => {
            if (!entry.isIntersecting) return
            gsap.to(element, { y: 0, autoAlpha: 1, duration: revealDuration, ease: 'power3.out' })
            observer.disconnect()
          }, { threshold: 0.16 })
          observer.observe(element)
          return observer
        })
        return () => observers.forEach((observer) => observer.disconnect())
      })
      return () => motion.revert()
    }, scope)
    return () => context.revert()
  }, [loading, visibleEvents.length])
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

  const eventPathMatch = window.location.pathname.match(/^\/events\/([^/]+)\/?$/)
  const eventPathId = eventPathMatch ? decodeURIComponent(eventPathMatch[1]) : null
  const detailEvent = eventPathId ? events.find((event) => event.occurrenceId === eventPathId || event.id === eventPathId) : null
  const openEventDetail = (clickEvent, event) => {
    if (clickEvent) clickEvent.preventDefault()
    window.location.assign(`/events/${encodeURIComponent(event.occurrenceId || event.id)}`)
  }

  if (window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/')) return <AdminDashboard onClose={() => window.location.assign('/')} />
  if (eventPathId && detailEvent) return <EventDetailPage event={detailEvent} onBack={() => window.location.assign('/#events')} user={user} onSignIn={signIn} onSignOut={signOut} onAccount={() => setMemberOpen(true)} />
  if (eventPathId && events.length) return <div className="app-shell"><Header user={user} onJoin={openEvent} onSignIn={signIn} onSignOut={signOut} onAccount={() => setMemberOpen(true)} /><main className="event-detail-page page-container"><p className="event-detail-loading">That event could not be found.</p><button className="button button-primary" type="button" onClick={() => window.location.assign('/#events')}>Back to events</button></main></div>
  if (loading && !eventPathId) return <div className="app-shell loading-shell"><div className="running-loader" aria-label="Loading Marga Run Club"><span>🏃</span></div><p>Getting the next meetup ready…</p></div>
  return memberOpen ? <MemberDashboard user={user} onClose={() => setMemberOpen(false)} onSignOut={signOut} onProfileUpdate={setUser} /> : <div className="app-shell"><Header user={user} onJoin={openEvent} onSignIn={signIn} onSignOut={signOut} onAccount={() => setMemberOpen(true)} /><main><Marquee /><div ref={eventsRef}><EventsSection activeFilter={activeFilter} setActiveFilter={setActiveFilter} visibleEvents={visibleEvents} onRegister={setSelectedEvent} onOpenEvent={openEventDetail} /></div><CommunitySection /><section className="closing-section page-container" id="schedule"><div className="closing-card"><div className="closing-grid"><div><div className="closing-kicker">⌁ NEXT MEET: THIS SUNDAY 6:30 AM</div><h2>READY TO TAKE YOUR FIRST STRIDE?</h2><p>Join 1,800+ members this week. No auditions, no memberships required—just show up in your sneakers.</p></div><div className="closing-actions"><button type="button" className="button button-primary button-large" onClick={scrollToEvents}>See all events <span>→</span></button><a className="button button-light" href="https://wa.me/919999999999" target="_blank" rel="noreferrer">♧ WhatsApp Community</a></div></div><div className="closing-bottom"><span>Instant RSVP via Razorpay / UPI</span><b>#RUNMARGA • NO STRANGERS HERE</b></div></div></section></main><Footer />{selectedEvent && <RegistrationModal event={selectedEvent} user={user} onClose={() => setSelectedEvent(null)} />}</div>
}

export default App
