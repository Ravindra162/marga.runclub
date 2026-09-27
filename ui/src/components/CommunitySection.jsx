import { values } from '../data/mockData'
import { Icon } from './Icon'

export function CommunitySection() {
  return <section className="community-section" id="community"><div className="page-container"><div className="section-heading community-heading"><div className="section-kicker">THE MARGA ETHOS</div><h2>MORE THAN A WORKOUT</h2><p>Why hundreds of runners and recreational players choose Marga every week over gym memberships and solo treadmills.</p></div><div className="values-grid">{values.map((value) => <article className="value-card" key={value.number}><div><div className="value-top"><b>{value.number}</b><span className={value.iconClass}><Icon name={value.icon} size={28} /></span></div><h3>{value.title}</h3><p>{value.body}</p></div><footer>{value.footer}</footer></article>)}</div></div></section>
}
