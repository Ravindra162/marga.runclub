import { EventCard } from './EventCard'
import { Icon } from './Icon'

export function EventsSection({ activeFilter, setActiveFilter, visibleEvents, onRegister }) {
  const filters = ['All Events', ...new Set(visibleEvents.map((event) => event.category))]
  return (
    <section className="events-section page-container" id="events">
      <div className="section-heading events-heading">
        <div><div className="section-kicker"><Icon name="sports_score" size={16} /> WEEKLY CALENDAR</div><h2>YOUR WEEK, IN MOTION</h2><p>Four friendly gatherings every week. Grab your spot in 30 seconds.</p></div>
        <div className="filter-row" role="tablist" aria-label="Filter events">
          {filters.map((filter) => <button key={filter} type="button" className={activeFilter === filter ? 'filter-chip active' : 'filter-chip'} onClick={() => setActiveFilter(filter)}>{filter}</button>)}
        </div>
      </div>
      <div className="events-grid">{visibleEvents.map((event) => <EventCard key={event.id} event={event} onRegister={onRegister} />)}</div>
      {visibleEvents.length === 0 && <div className="empty-events">No events in this category yet. Try another filter.</div>}
    </section>
  )
}
