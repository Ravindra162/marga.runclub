import { Icon } from './Icon'

export function Hero({ onExplore }) {
  return (
    <section className="hero-section" id="top">
      <div className="page-container hero-grid">
        <div className="hero-copy-column">
          <div className="eyebrow-pill"><span className="pulse-dot" /> EST. 2024 • BANGALORE &amp; MUMBAI • FREE &amp; ACCESSIBLE</div>
          <h1>MOVE TOGETHER.<br /><span>FEEL ALIVE.</span></h1>
          <p className="hero-description">Marga Run Club brings city dwellers together for weekly morning runs, pickleball games, indoor badminton, and community screenings. No pace requirements, no intimidation—just good people, fresh air, and movement that fits your life.</p>
          <div className="hero-actions">
            <button className="button button-primary button-large" type="button" onClick={onExplore}>Explore upcoming events <Icon name="arrow_forward" size={20} /></button>
            <a className="underlined-link" href="#community">Join the community <Icon name="groups" size={18} /></a>
          </div>
          <div className="trust-line"><Icon name="verified" size={18} /> Always free for first-timers • UPI / PhonePe supported for court events</div>
          <div className="hero-metrics">
            <div><strong>1,800+</strong><span>Active Members</span></div>
            <div><strong>4</strong><span>Weekly Meetups</span></div>
            <div><strong className="metric-blue">0</strong><span>Pace Shaming</span></div>
          </div>
        </div>
        <div className="hero-visual-wrap">
          <div className="hero-frame">
            <div className="hero-image-wrap">
              <img src="https://lh3.googleusercontent.com/aida-public/AB6AXuBKlqwwDmugiXVVNRzw8A0S52ZnvPy_z2S0OA7NjoTFr3dOzbK78UuU-7OcQTu5GYDh1aIyWYwIzxpHUIL4WWDxF6L43j7PdQfPW7ZAQKjbJdDf9knptyIk93cgHQsEUoXvi0h2O0DtlE3sChebkrmuAro934PlSNZJQt3rREpno4_dZbdLBHS9f6dR-mEz4wM4goWMwR4DK7KfMReb0SV3-E_dQLvXLEI5b27SsVy5E1j_5zY3R5tTJZ-GR7OusZAEWL2K5vqqccg" alt="Diverse runners jogging together at golden hour" />
              <div className="hero-bib"> <span className="pulse-dot" /> #MRC-001 • SUNDAY HARVEST</div>
              <div className="hero-welcome">EVERYONE WELCOME</div>
              <div className="next-run-card">
                <div className="next-run-icon"><Icon name="calendar_today" size={22} /></div>
                <div><span>NEXT COMMUNITY RUN</span><strong>Cubbon Park Bandstand</strong><small>Sunday 6:30 AM • 5K &amp; 3K Walk/Jog groups</small></div>
                <b>Free</b>
              </div>
            </div>
          </div>
          <div className="geo-coordinates"><span>LAT 12.9716° N</span><span>LON 77.5946° E</span><span>BANGALORE HQ</span></div>
        </div>
      </div>
    </section>
  )
}
