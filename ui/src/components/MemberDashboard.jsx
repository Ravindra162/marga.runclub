import { useEffect, useState } from 'react'
import { Icon } from './Icon'

function dateLabel(value) {
  return value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Date to be announced'
}

function money(amountMinor, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(Number(amountMinor || 0) / 100)
}

export function MemberDashboard({ user, onClose, onSignOut, onProfileUpdate }) {
  const [registrations, setRegistrations] = useState([])
  const [profile, setProfile] = useState({ name: user?.name || '', phone: user?.phone || '' })
  const [editingProfile, setEditingProfile] = useState(false)
  const [profileMessage, setProfileMessage] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/me/registrations', { credentials: 'include' })
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Could not load registrations.')
        return result
      })
      .then((result) => setRegistrations(result.registrations || []))
      .catch((reason) => setError(reason.message))
      .finally(() => setLoading(false))
  }, [])

  async function saveProfile(event) {
    event.preventDefault()
    setSavingProfile(true); setProfileMessage('')
    try {
      const response = await fetch('/api/me', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not update your profile.')
      setProfile({ name: result.user.name || '', phone: result.user.phone || '' })
      onProfileUpdate?.(result.user)
      setEditingProfile(false)
      setProfileMessage('Profile updated successfully.')
    } catch (reason) { setProfileMessage(reason.message) } finally { setSavingProfile(false) }
  }

  return <div className="member-screen">
    <div className="member-shell">
      <div className="member-topbar">
        <button className="text-button" type="button" onClick={onClose}><Icon name="arrow_back" size={18} /> Back to events</button>
        <button className="button button-light button-small" type="button" onClick={onSignOut}>Sign out</button>
      </div>
      <section className="member-hero">
        <div>
          <div className="section-kicker">⌁ MEMBER AREA</div>
          <h1>YOUR RUN<br /><span>HISTORY.</span></h1>
          <p>Welcome back, {user.name || user.email}. Your registrations and payment updates are all in one place.</p>
        </div>
        {user.image ? <img className="member-avatar" src={user.image} alt="" /> : <div className="member-avatar member-avatar-fallback"><Icon name="person" size={30} /></div>}
      </section>
      <section className="member-content">
        <section className="member-profile-card">
          <div className="section-heading member-heading"><div><div className="section-kicker">⌁ YOUR PROFILE</div><h2>PERSONAL DETAILS</h2><p>Your email is linked to your Google account and cannot be changed here.</p></div><button className="button button-light button-small" type="button" onClick={() => { setEditingProfile((value) => !value); setProfileMessage('') }}>{editingProfile ? 'Cancel' : 'Edit profile'}</button></div>
          {editingProfile ? <form className="profile-form" onSubmit={saveProfile}><label>Name<input required minLength="2" value={profile.name} onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))} /></label><label>Email<input value={user.email} disabled /></label><label>Mobile number<input required value={profile.phone} onChange={(event) => setProfile((current) => ({ ...current, phone: event.target.value }))} placeholder="+91 98765 43210" /></label><button className="button button-primary" type="submit" disabled={savingProfile}>{savingProfile ? 'Saving…' : 'Save profile'}</button></form> : <div className="profile-summary"><div><span>NAME</span><strong>{profile.name || 'Not added yet'}</strong></div><div><span>EMAIL</span><strong>{user.email}</strong></div><div><span>MOBILE</span><strong>{profile.phone || 'Not added yet'}</strong></div></div>}
          {profileMessage && <p className="profile-message" role="status">{profileMessage}</p>}
        </section>
        <div className="section-heading member-heading"><div><div className="section-kicker">⌁ MY REGISTRATIONS</div><h2>BOOKED EVENTS</h2><p>Keep your registration code handy at check-in.</p></div><b className="member-count">{registrations.length} EVENT{registrations.length === 1 ? '' : 'S'}</b></div>
        {loading && <div className="member-empty">Loading your registrations…</div>}
        {!loading && error && <div className="member-empty member-error">{error}</div>}
        {!loading && !error && !registrations.length && <div className="member-empty"><Icon name="directions_run" size={28} /><strong>No registrations yet</strong><span>Join your first Marga Run Club event to see it here.</span><button className="button button-primary" type="button" onClick={onClose}>Explore events</button></div>}
        {!loading && !error && registrations.length > 0 && <div className="member-registration-list">{registrations.map((registration) => <article className="member-registration-card" key={registration.registrationCode}>
          <div className="member-registration-main"><div className="section-kicker">{dateLabel(registration.startsAt)}</div><h3>{registration.eventTitle}</h3><p>{registration.location?.venue || registration.location?.address || 'Marga Run Club venue'}</p></div>
          <div className="member-registration-details"><div><span>REGISTRATION CODE</span><strong>{registration.registrationCode}</strong></div><div><span>TICKET</span><strong>{registration.tickets?.map((ticket) => `${ticket.name} ×${ticket.quantity}`).join(', ') || 'Community entry'}</strong></div><div><span>AMOUNT</span><strong>{money(registration.amountMinor, registration.currency)}</strong></div></div>
          <div className="member-registration-status"><div className={`status-pill status-${registration.status}`}>{registration.status.replaceAll('_', ' ')}</div><small>Payment: {registration.paymentStatus.replaceAll('_', ' ')}</small></div>
        </article>)}</div>}
      </section>
    </div>
  </div>
}
