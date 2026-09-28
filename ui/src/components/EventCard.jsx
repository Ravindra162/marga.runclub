import { Icon } from './Icon'

export function EventCard({ event, onRegister, onOpen }) {
  const actionClass = event.category === 'Running' || event.category === 'Socials' ? 'action-orange' : event.category === 'Pickleball' ? 'action-blue' : 'action-dark'
  return (
    <article className="event-card">
      <a className="event-image-wrap event-poster-link" href={`/events/${encodeURIComponent(event.occurrenceId || event.id)}`} aria-label={`View details for ${event.title}`} onClick={onOpen ? (clickEvent) => onOpen(clickEvent, event) : undefined}>
        <img src={event.image} alt={event.alt} />
        <span className={`event-day ${event.badgeClass}`}>{event.dayLabel}</span>
        <span className="event-tag">{event.tag}</span>
      </a>
      <div className="event-content">
        <div className="event-meta"><span><Icon name="location_on" size={16} /> {event.location}</span><b>{event.detail}</b></div>
        <h3>{event.title}</h3>
        <p>{event.description}</p>
        <div className="event-footer">
          <div><span>{event.priceLabel}</span><strong className={event.priceClass}>{event.price}</strong></div>
           <button className={`event-action ${actionClass}`} type="button" onClick={() => onRegister(event)}>{event.action} <Icon name={event.icon} size={16} /></button>
        </div>
      </div>
    </article>
  )
}
