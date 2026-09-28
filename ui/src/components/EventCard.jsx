import { Icon } from './Icon'

export function EventCard({ event, onRegister, onOpen }) {
  const actionClass = event.category === 'Running' || event.category === 'Socials' ? 'action-orange' : event.category === 'Pickleball' ? 'action-blue' : 'action-dark'
  const openDetails = () => onOpen?.(null, event)
  const handleKeyDown = (clickEvent) => {
    if (clickEvent.key === 'Enter' || clickEvent.key === ' ') {
      clickEvent.preventDefault()
      openDetails()
    }
  }
  return (
    <article className="event-card" role="link" tabIndex="0" onClick={openDetails} onKeyDown={handleKeyDown} aria-label={`View details for ${event.title}`}>
      <div className="event-image-wrap event-poster-link">
        <img src={event.image} alt={event.alt} />
        <span className={`event-day ${event.badgeClass}`}>{event.dayLabel}</span>
        <span className="event-tag">{event.tag}</span>
      </div>
      <div className="event-content">
        <div className="event-meta"><span><Icon name="location_on" size={16} /> {event.location}</span><b>{event.detail}</b></div>
        <h3>{event.title}</h3>
        <p>{event.description}</p>
        <div className="event-footer">
          <div><span>{event.priceLabel}</span><strong className={event.priceClass}>{event.price}</strong></div>
           <button className={`event-action ${actionClass}`} type="button" onClick={(clickEvent) => { clickEvent.stopPropagation(); onRegister(event) }}>{event.action} <Icon name={event.icon} size={16} /></button>
        </div>
      </div>
    </article>
  )
}
