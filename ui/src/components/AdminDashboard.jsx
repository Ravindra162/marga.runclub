import { useEffect, useState } from 'react'

const defaultFields = [
  { key: 'full_name', type: 'short_text', label: 'Full name', required: true, config: { placeholder: 'Your name' } },
  { key: 'email', type: 'email', label: 'Email address', required: true, config: { placeholder: 'you@example.com' } },
  { key: 'phone', type: 'phone', label: 'Phone number', required: true, config: { placeholder: '+91 98765 43210' } },
]

export function AdminDashboard({ onClose }) {
  const [key, setKey] = useState(localStorage.getItem('marga-admin-key') || '')
  const [overview, setOverview] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [formName, setFormName] = useState('Event Registration Form')
  const [fields, setFields] = useState(defaultFields)
  const [occurrence, setOccurrence] = useState({ seriesSlug: 'sunday-morning-run', startsAt: '', capacity: '24', amountMinor: '0' })

  async function loadDashboard() {
    setError('')
    const response = await fetch('/api/admin/overview', { headers: { 'x-admin-key': key } })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Unable to load organizer dashboard.')
    setOverview(result)
    localStorage.setItem('marga-admin-key', key)
  }

  useEffect(() => { if (key) loadDashboard().catch((loadError) => setError(loadError.message)) }, [])

  async function createForm(event) {
    event.preventDefault(); setMessage('')
    try {
      const createResponse = await fetch('/api/admin/forms', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-key': key }, body: JSON.stringify({ name: formName }) })
      const created = await createResponse.json()
      if (!createResponse.ok) throw new Error(created.error)
      const publishResponse = await fetch(`/api/admin/forms/${created.form.id}/publish`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-key': key }, body: JSON.stringify({ fields }) })
      const published = await publishResponse.json()
      if (!publishResponse.ok) throw new Error(published.error)
      setMessage(`Published form version ${published.version.versionNumber}.`)
      await loadDashboard()
    } catch (formError) { setError(formError.message) }
  }

  async function createOccurrence(event) {
    event.preventDefault(); setError(''); setMessage('')
    try {
      const response = await fetch('/api/admin/occurrences', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-key': key }, body: JSON.stringify({ ...occurrence, capacity: Number(occurrence.capacity), ticket: { name: 'Standard entry', amountMinor: Number(occurrence.amountMinor) } }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      setMessage('Event occurrence created and opened for registration.')
      await loadDashboard()
    } catch (occurrenceError) { setError(occurrenceError.message) }
  }

  function updateField(index, patch) { setFields((current) => current.map((field, fieldIndex) => fieldIndex === index ? { ...field, ...patch } : field)) }

  if (!key || !overview) return <div className="admin-screen"><div className="admin-shell"><div className="admin-topbar"><div><div className="section-kicker">MARGA OPERATIONS</div><h1>Organizer Console</h1><p>Build forms, schedule events, and keep every meetup moving.</p></div><button className="button button-light" type="button" onClick={onClose}>Back to site</button></div><section className="admin-card admin-access"><h2>Organizer access</h2><p>Enter the server-side admin key configured in <code>ADMIN_API_KEY</code>.</p><form onSubmit={(event) => { event.preventDefault(); loadDashboard().catch((loadError) => setError(loadError.message)) }}><input type="password" value={key} onChange={(event) => setKey(event.target.value)} placeholder="Admin API key" required /><button className="button button-primary" type="submit">Open dashboard</button></form>{error && <p className="form-error">{error}</p>}</section></div></div>

  return <div className="admin-screen"><div className="admin-shell"><div className="admin-topbar"><div><div className="section-kicker">MARGA OPERATIONS</div><h1>Organizer Console</h1><p>Build forms, schedule events, and keep every meetup moving.</p></div><button className="button button-light" type="button" onClick={onClose}>Back to site</button></div><div className="admin-stats"><div><strong>{overview.registrations.length}</strong><span>Recent registrations</span></div><div><strong>{overview.occurrences.length}</strong><span>Event occurrences</span></div><div><strong>{overview.forms.length}</strong><span>Form templates</span></div></div><div className="admin-grid"><section className="admin-card"><div className="admin-card-heading"><div><div className="section-kicker">FORM BUILDER</div><h2>Publish a new template</h2></div><span className="admin-badge">Immutable versions</span></div><form className="builder-form" onSubmit={createForm}><label>Form name<input value={formName} onChange={(event) => setFormName(event.target.value)} /></label><div className="field-list">{fields.map((field, index) => <div className="builder-field" key={`${field.key}-${index}`}><input value={field.label} onChange={(event) => updateField(index, { label: event.target.value })} aria-label="Field label" /><select value={field.type} onChange={(event) => updateField(index, { type: event.target.value })} aria-label="Field type"><option value="short_text">Short text</option><option value="email">Email</option><option value="phone">Phone</option><option value="long_text">Long text</option><option value="dropdown">Dropdown</option><option value="consent">Consent</option></select><label className="inline-check"><input type="checkbox" checked={field.required} onChange={(event) => updateField(index, { required: event.target.checked })} /> Required</label><button type="button" className="remove-field" onClick={() => setFields((current) => current.filter((_, fieldIndex) => fieldIndex !== index))}>×</button></div>)}</div><div className="builder-actions"><button className="button button-light" type="button" onClick={() => setFields((current) => [...current, { key: `question_${current.length + 1}`, type: 'short_text', label: 'New question', required: false, config: {} }])}>+ Add question</button><button className="button button-primary" type="submit">Publish form</button></div></form></section><section className="admin-card"><div className="section-kicker">NEW OCCURRENCE</div><h2>Schedule an event</h2><form className="builder-form" onSubmit={createOccurrence}><label>Event series<select value={occurrence.seriesSlug} onChange={(event) => setOccurrence({ ...occurrence, seriesSlug: event.target.value })}><option value="sunday-morning-run">Sunday Morning Run</option><option value="tuesday-badminton">Tuesday Badminton</option><option value="thursday-pickleball">Thursday Pickleball</option><option value="f1-screening">F1 Screening</option></select></label><label>Date and time<input required type="datetime-local" value={occurrence.startsAt} onChange={(event) => setOccurrence({ ...occurrence, startsAt: event.target.value })} /></label><label>Capacity<input type="number" min="1" value={occurrence.capacity} onChange={(event) => setOccurrence({ ...occurrence, capacity: event.target.value })} /></label><label>Price in paise<input type="number" min="0" value={occurrence.amountMinor} onChange={(event) => setOccurrence({ ...occurrence, amountMinor: event.target.value })} /></label><button className="button button-primary" type="submit">Open registration</button></form></section></div>{message && <p className="form-success admin-message">{message}</p>}{error && <p className="form-error admin-message">{error}</p>}<section className="admin-card"><div className="section-kicker">REGISTRATIONS</div><h2>Latest signups</h2><div className="admin-table">{overview.registrations.map((registration) => <div className="admin-row" key={registration.registrationCode}><div><strong>{registration.fullName}</strong><small>{registration.title} · {registration.email}</small></div><span className={`status-pill status-${registration.status}`}>{registration.status.replaceAll('_', ' ')}</span></div>)}{overview.registrations.length === 0 && <p className="admin-muted">No registrations yet.</p>}</div></section><section className="admin-card"><div className="section-kicker">EVENT OCCURRENCES</div><h2>Capacity and revenue</h2><div className="admin-table">{overview.occurrences.map((item) => <div className="admin-row" key={item.id}><div><strong>{item.title}</strong><small>{new Date(item.startsAt).toLocaleString()} · {item.confirmedCount}/{item.capacity || '∞'} confirmed</small></div><b>₹{Number(item.confirmedRevenueMinor || 0) / 100}</b></div>)}</div></section></div></div>
}
