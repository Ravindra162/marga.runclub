import { useEffect, useMemo, useState } from 'react'

const defaultFields = [
  { key: 'full_name', type: 'short_text', label: 'Full name', required: true, config: { placeholder: 'Your name' } },
  { key: 'email', type: 'email', label: 'Email address', required: true, config: { placeholder: 'you@example.com' } },
  { key: 'phone', type: 'phone', label: 'Phone number', required: true, config: { placeholder: '+91 98765 43210' } },
]
const emptySeries = { title: '', slug: '', category: 'other', description: '', venue: '' }
const emptyOccurrence = { seriesId: '', formVersionId: '', startsAt: '', capacity: '24', ticketName: 'Standard entry', ticketDescription: '', priceRupees: '0' }
const optionFieldTypes = new Set(['dropdown', 'radio', 'multi_select', 'checkbox'])
const navigation = [
  { id: 'overview', label: 'Overview', icon: '⌂' },
  { id: 'events', label: 'Events', icon: '◷' },
  { id: 'forms', label: 'Forms', icon: '▤' },
  { id: 'registrations', label: 'Registrations', icon: '✓' },
]

function localDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  const pad = (number) => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function money(amountMinor) {
  return `₹${(Number(amountMinor || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

export function AdminDashboard({ onClose }) {
  const [key, setKey] = useState(localStorage.getItem('marga-admin-key') || '')
  const [overview, setOverview] = useState(null)
  const [activeView, setActiveView] = useState('overview')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [formName, setFormName] = useState('Event Registration Form')
  const [fields, setFields] = useState(defaultFields)
  const [editingForm, setEditingForm] = useState(null)
  const [seriesForm, setSeriesForm] = useState(emptySeries)
  const [occurrence, setOccurrence] = useState(emptyOccurrence)
  const [editingOccurrence, setEditingOccurrence] = useState(null)

  const headers = () => ({ 'Content-Type': 'application/json', 'x-admin-key': key })
  async function request(path, options = {}) {
    const response = await fetch(path, { ...options, headers: { ...headers(), ...(options.headers || {}) } })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Organizer request failed.')
    return result
  }

  async function loadDashboard() {
    setError('')
    const result = await request('/api/admin/overview')
    setOverview(result)
    setOccurrence((current) => ({ ...current, seriesId: current.seriesId || result.series?.[0]?.id || '', formVersionId: current.formVersionId || result.forms?.find((form) => form.versionId)?.versionId || '' }))
    localStorage.setItem('marga-admin-key', key)
  }

  useEffect(() => { if (key) loadDashboard().catch((loadError) => setError(loadError.message)) }, [])

  const publishedForms = useMemo(() => overview?.forms.filter((form) => form.versionId && form.templateStatus !== 'archived') || [], [overview])

  function showMessage(text) { setMessage(text); setError('') }
  function startNewForm() { setEditingForm(null); setFormName('Event Registration Form'); setFields(defaultFields); showMessage('') }
  function editForm(form) { setActiveView('forms'); setEditingForm(form); setFormName(form.name); setFields(form.fields?.length ? form.fields : defaultFields); showMessage(`Editing ${form.name}. Publishing creates a new immutable version.`) }
  function editEvent(item) {
    setActiveView('events')
    setEditingOccurrence(item)
    setOccurrence({ seriesId: item.eventSeriesId, formVersionId: '', title: item.title, startsAt: localDateTime(item.startsAt), capacity: String(item.capacity || 24), ticketName: item.ticketName || 'Standard entry', ticketDescription: item.ticketDescription || '', priceRupees: String(Number(item.amountMinor || 0) / 100) })
    showMessage(`Editing ${item.title}. Changes apply to this scheduled occurrence.`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function saveForm(event) {
    event.preventDefault(); setMessage(''); setError('')
    try {
      let templateId = editingForm?.id
      if (templateId) await request(`/api/admin/forms/${templateId}`, { method: 'PATCH', body: JSON.stringify({ name: formName }) })
      else templateId = (await request('/api/admin/forms', { method: 'POST', body: JSON.stringify({ name: formName }) })).form.id
      const published = await request(`/api/admin/forms/${templateId}/publish`, { method: 'POST', body: JSON.stringify({ fields }) })
      showMessage(`${editingForm ? 'Updated' : 'Published'} “${formName}”, version ${published.version.versionNumber}.`)
      setEditingForm(null); await loadDashboard()
    } catch (formError) { setError(formError.message) }
  }

  async function archiveForm(form) {
    if (!window.confirm(`Archive “${form.name}”? Existing events and submissions will remain intact.`)) return
    try { await request(`/api/admin/forms/${form.id}`, { method: 'DELETE' }); showMessage(`Archived “${form.name}”.`); await loadDashboard() } catch (archiveError) { setError(archiveError.message) }
  }

  async function createSeries(event) {
    event.preventDefault(); setMessage(''); setError('')
    try {
      const result = await request('/api/admin/events', { method: 'POST', body: JSON.stringify({ ...seriesForm, defaultLocation: { venue: seriesForm.venue } }) })
      setSeriesForm(emptySeries); setOccurrence((current) => ({ ...current, seriesId: result.event.id })); showMessage(`Created event series “${result.event.title}”.`); await loadDashboard()
    } catch (seriesError) { setError(seriesError.message) }
  }

  async function saveOccurrence(event) {
    event.preventDefault(); setError(''); setMessage('')
    try {
      const payload = { seriesId: occurrence.seriesId, title: occurrence.title, formVersionId: occurrence.formVersionId || undefined, startsAt: occurrence.startsAt, capacity: Number(occurrence.capacity), ticket: { name: occurrence.ticketName, description: occurrence.ticketDescription, amountMinor: Math.round(Number(occurrence.priceRupees || 0) * 100) } }
      if (editingOccurrence) {
        await request(`/api/admin/occurrences/${editingOccurrence.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
        showMessage('Event details and pricing updated.')
        setEditingOccurrence(null)
      } else {
        await request('/api/admin/occurrences', { method: 'POST', body: JSON.stringify(payload) })
        showMessage('Event occurrence created with the selected form and price.')
      }
      setOccurrence((current) => ({ ...emptyOccurrence, seriesId: current.seriesId, formVersionId: current.formVersionId })); await loadDashboard()
    } catch (occurrenceError) { setError(occurrenceError.message) }
  }

  function updateField(index, patch) { setFields((current) => current.map((field, fieldIndex) => fieldIndex === index ? { ...field, ...patch } : field)) }
  function removeField(index) { setFields((current) => current.filter((_, fieldIndex) => fieldIndex !== index)) }
  function updateFieldConfig(index, patch) { setFields((current) => current.map((field, fieldIndex) => fieldIndex === index ? { ...field, config: { ...(field.config || {}), ...patch } } : field)) }
  function updateOption(fieldIndex, optionIndex, value) { setFields((current) => current.map((field, index) => index === fieldIndex ? { ...field, config: { ...(field.config || {}), options: (field.config?.options || []).map((option, index) => index === optionIndex ? value : option) } } : field)) }
  function addOption(fieldIndex) { setFields((current) => current.map((field, index) => index === fieldIndex ? { ...field, config: { ...(field.config || {}), options: [...(field.config?.options || []), `Option ${(field.config?.options || []).length + 1}`] } } : field)) }
  function removeOption(fieldIndex, optionIndex) { setFields((current) => current.map((field, index) => index === fieldIndex ? { ...field, config: { ...(field.config || {}), options: (field.config?.options || []).filter((_, index) => index !== optionIndex) } } : field)) }
  function updateSeries(patch) { setSeriesForm((current) => ({ ...current, ...patch })) }
  function updateOccurrence(patch) { setOccurrence((current) => ({ ...current, ...patch })) }

  if (!key || !overview) return <div className="admin-screen"><div className="admin-shell"><div className="admin-topbar"><div><div className="section-kicker">MARGA OPERATIONS</div><h1>Organizer Console</h1><p>Build forms, schedule events, and keep every meetup moving.</p></div><button className="button button-light" type="button" onClick={onClose}>Back to site</button></div><section className="admin-card admin-access"><h2>Organizer access</h2><p>Enter the server-side admin key configured in <code>ADMIN_API_KEY</code>.</p><form onSubmit={(event) => { event.preventDefault(); loadDashboard().catch((loadError) => setError(loadError.message)) }}><input type="password" value={key} onChange={(event) => setKey(event.target.value)} placeholder="Admin API key" required /><button className="button button-primary" type="submit">Open dashboard</button></form>{error && <p className="form-error">{error}</p>}</section></div></div>

  return <div className="admin-screen"><div className="admin-layout"><aside className="admin-sidebar"><div className="admin-logo"><span>M</span><div><strong>MARGA</strong><small>RUN CLUB / OPS</small></div></div><div className="admin-sidebar-label">Workspace</div><nav className="admin-nav">{navigation.map((item) => <button key={item.id} type="button" className={activeView === item.id ? 'active' : ''} onClick={() => { setActiveView(item.id); setMessage(''); setError('') }}><span>{item.icon}</span>{item.label}</button>)}</nav><button className="admin-back" type="button" onClick={onClose}>← Back to website</button></aside><main className="admin-main"><header className="admin-topbar"><div><div className="section-kicker">MARGA OPERATIONS / {activeView}</div><h1>{navigation.find((item) => item.id === activeView)?.label}</h1><p>{activeView === 'overview' ? 'A clear view of what is happening across your club.' : activeView === 'events' ? 'Schedule meetups, update pricing, and keep registrations accurate.' : activeView === 'forms' ? 'Build reusable forms and assign them to events.' : 'Review the latest people joining your events.'}</p></div><div className="admin-topbar-actions"><span className="admin-live"><i /> Production</span><button className="button button-light" type="button" onClick={loadDashboard}>Refresh</button></div></header>{message && <p className="form-success admin-message">{message}</p>}{error && <p className="form-error admin-message">{error}</p>}{activeView === 'overview' && <Overview overview={overview} onView={setActiveView} onEditEvent={editEvent} />}{activeView === 'events' && <EventsView overview={overview} occurrence={occurrence} editingOccurrence={editingOccurrence} publishedForms={publishedForms} seriesForm={seriesForm} onSeriesChange={updateSeries} onOccurrenceChange={updateOccurrence} onCreateSeries={createSeries} onSaveOccurrence={saveOccurrence} onEditEvent={editEvent} onCancelEdit={() => { setEditingOccurrence(null); setOccurrence(emptyOccurrence) }} />}{activeView === 'forms' && <FormsView overview={overview} publishedForms={publishedForms} editingForm={editingForm} formName={formName} fields={fields} onFormNameChange={setFormName} onEditForm={editForm} onArchiveForm={archiveForm} onStartNew={startNewForm} onSave={saveForm} onUpdateField={updateField} onRemoveField={removeField} onUpdateConfig={updateFieldConfig} onUpdateOption={updateOption} onAddOption={addOption} onRemoveOption={removeOption} onAddField={() => setFields((current) => [...current, { key: `question_${current.length + 1}`, type: 'short_text', label: 'New question', required: false, config: {} }])} />}{activeView === 'registrations' && <RegistrationsView registrations={overview.registrations} />}</main></div></div>
}

function Stats({ overview }) {
  const confirmed = overview.registrations.filter((item) => item.status === 'confirmed').length
  return <div className="admin-stats"><div><span>Upcoming events</span><strong>{overview.occurrences.length}</strong><small>Scheduled occurrences</small></div><div><span>Registrations</span><strong>{overview.registrations.length}</strong><small>{confirmed} confirmed</small></div><div><span>Published forms</span><strong>{overview.forms.filter((form) => form.versionId).length}</strong><small>Ready to assign</small></div><div><span>Event series</span><strong>{overview.series.length}</strong><small>Active event types</small></div></div>
}

function Overview({ overview, onView, onEditEvent }) {
  return <><Stats overview={overview} /><div className="admin-overview-grid"><section className="admin-card"><div className="admin-card-heading"><div><div className="section-kicker">SCHEDULE</div><h2>Upcoming events</h2></div><button className="text-button" type="button" onClick={() => onView('events')}>Manage events →</button></div><div className="admin-table">{overview.occurrences.slice(0, 5).map((item) => <EventRow key={item.id} item={item} onEdit={onEditEvent} />)}{!overview.occurrences.length && <p className="admin-muted">No scheduled events yet.</p>}</div></section><section className="admin-card quick-actions"><div className="section-kicker">SHORTCUTS</div><h2>Keep things moving</h2><button type="button" onClick={() => onView('events')}><span>＋</span><div><strong>Schedule an event</strong><small>Set date, form, capacity and price</small></div></button><button type="button" onClick={() => onView('forms')}><span>▤</span><div><strong>Build a registration form</strong><small>Add questions and answer options</small></div></button><button type="button" onClick={() => onView('registrations')}><span>✓</span><div><strong>View registrations</strong><small>See your latest signups</small></div></button></section></div><section className="admin-card"><div className="admin-card-heading"><div><div className="section-kicker">LATEST ACTIVITY</div><h2>Recent registrations</h2></div><button className="text-button" type="button" onClick={() => onView('registrations')}>View all →</button></div><RegistrationTable registrations={overview.registrations.slice(0, 5)} /></section></>
}

function EventRow({ item, onEdit }) { return <div className="admin-row event-row"><div className="event-date"><strong>{new Date(item.startsAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</strong><small>{new Date(item.startsAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</small></div><div className="event-row-main"><strong>{item.title}</strong><small>{item.formName || 'No form'} · {item.ticketName || 'No ticket'}</small></div><div className="event-row-price"><strong>{money(item.amountMinor)}</strong><small>{item.registrationCount} / {item.capacity || '∞'} joined</small></div><button className="button button-light button-small" type="button" onClick={() => onEdit(item)}>Edit</button></div> }

function EventSections({ occurrences, onEdit }) {
  const active = occurrences.filter((item) => new Date(item.startsAt) > new Date() && !['cancelled', 'completed'].includes(item.status))
  const past = occurrences.filter((item) => !active.includes(item))
  return <><div className="event-section-heading"><h3>Active events</h3><span>{active.length} not expired</span></div><div className="admin-table">{active.map((item) => <EventRow key={item.id} item={item} onEdit={onEdit} />)}{!active.length && <p className="admin-muted">No active events. Schedule a new occurrence above.</p>}</div><div className="event-section-heading"><h3>Past and closed</h3><span>{past.length} events</span></div><div className="admin-table past-events">{past.map((item) => <EventRow key={item.id} item={item} onEdit={onEdit} />)}{!past.length && <p className="admin-muted">No past events.</p>}</div></>
}

function EventsView({ overview, occurrence, editingOccurrence, publishedForms, seriesForm, onSeriesChange, onOccurrenceChange, onCreateSeries, onSaveOccurrence, onEditEvent, onCancelEdit }) {
  return <><div className="view-toolbar"><div><div className="section-kicker">EVENT MANAGEMENT</div><h2>{editingOccurrence ? `Edit ${editingOccurrence.title}` : 'Schedule and manage events'}</h2></div>{editingOccurrence && <button className="button button-light" type="button" onClick={onCancelEdit}>Cancel editing</button>}</div><div className="admin-content-grid"><section className="admin-card"><div className="section-kicker">{editingOccurrence ? 'EDIT EVENT' : 'SCHEDULE OCCURRENCE'}</div><h2>{editingOccurrence ? 'Update event details' : 'Open a registration'}</h2><p className="admin-muted">Choose the form participants will see and set the ticket price in rupees.</p><form className="builder-form" onSubmit={onSaveOccurrence}>{editingOccurrence && <label>Event title<input required value={occurrence.title || ''} onChange={(event) => onOccurrenceChange({ title: event.target.value })} /><small className="admin-help">This updates the event series title shown to participants.</small></label>}<label>Event series<select required value={occurrence.seriesId} onChange={(event) => onOccurrenceChange({ seriesId: event.target.value })}>{overview.series.map((series) => <option key={series.id} value={series.id}>{series.title}</option>)}</select></label><label>Registration form<select required={!editingOccurrence} value={occurrence.formVersionId} onChange={(event) => onOccurrenceChange({ formVersionId: event.target.value })}><option value="">{editingOccurrence ? 'Keep currently assigned form' : 'Choose a published form'}</option>{publishedForms.map((form) => <option key={form.versionId} value={form.versionId}>{form.name} · v{form.versionNumber}</option>)}</select></label><div className="form-two-column"><label>Date and time<input required type="datetime-local" value={occurrence.startsAt} onChange={(event) => onOccurrenceChange({ startsAt: event.target.value })} /></label><label>Capacity<input required type="number" min="1" value={occurrence.capacity} onChange={(event) => onOccurrenceChange({ capacity: event.target.value })} /></label></div><div className="form-divider"><span>Ticket & pricing</span></div><label>Ticket name<input required value={occurrence.ticketName} onChange={(event) => onOccurrenceChange({ ticketName: event.target.value })} /></label><label>What does the ticket include?<input value={occurrence.ticketDescription} onChange={(event) => onOccurrenceChange({ ticketDescription: event.target.value })} placeholder="Court booking, snacks, community access..." /></label><label>Price (₹)<input required type="number" min="0" step="0.01" value={occurrence.priceRupees} onChange={(event) => onOccurrenceChange({ priceRupees: event.target.value })} /><small className="admin-help">Enter 0 for a free event.</small></label><button className="button button-primary" type="submit" disabled={!overview.series.length || (!editingOccurrence && !publishedForms.length)}>{editingOccurrence ? 'Save event changes' : 'Open registration'}</button></form></section><section className="admin-card"><div className="section-kicker">NEW EVENT TYPE</div><h2>Create an event series</h2><p className="admin-muted">A series is the reusable event type, like “Saturday Run” or “F1 Screening”.</p><form className="builder-form" onSubmit={onCreateSeries}><label>Title<input required value={seriesForm.title} onChange={(event) => onSeriesChange({ title: event.target.value })} placeholder="e.g. Saturday Yoga" /></label><div className="form-two-column"><label>Category<select value={seriesForm.category} onChange={(event) => onSeriesChange({ category: event.target.value })}><option value="running">Running</option><option value="badminton">Badminton</option><option value="pickleball">Pickleball</option><option value="f1_screening">F1 screening</option><option value="fitness">Fitness</option><option value="other">Other</option></select></label><label>Venue<input value={seriesForm.venue} onChange={(event) => onSeriesChange({ venue: event.target.value })} placeholder="Venue name" /></label></div><label>Description<textarea value={seriesForm.description} onChange={(event) => onSeriesChange({ description: event.target.value })} /></label><button className="button button-light" type="submit">Create event type</button></form></section></div><section className="admin-card"><div className="admin-card-heading"><div><div className="section-kicker">ALL OCCURRENCES</div><h2>Your event calendar</h2></div><span className="admin-badge">{overview.occurrences.length} scheduled</span></div><EventSections occurrences={overview.occurrences} onEdit={onEditEvent} /></section></>
}

function FormsView({ overview, publishedForms, editingForm, formName, fields, onFormNameChange, onEditForm, onArchiveForm, onStartNew, onSave, onUpdateField, onRemoveField, onUpdateConfig, onUpdateOption, onAddOption, onRemoveOption, onAddField }) {
  return <><div className="view-toolbar"><div><div className="section-kicker">FORM MANAGEMENT</div><h2>Forms library</h2></div><button className="button button-primary" type="button" onClick={onStartNew}>＋ New form</button></div><div className="admin-content-grid"><section className="admin-card"><div className="admin-card-heading"><div><div className="section-kicker">FORM BUILDER</div><h2>{editingForm ? 'Edit published form' : 'Create a form'}</h2></div><span className="admin-badge">Immutable versions</span></div><p className="admin-muted">{editingForm ? 'Your changes publish as a new version; existing events keep their assigned version.' : 'Create a reusable form, then assign it to an event.'}</p><form className="builder-form" onSubmit={onSave}><label>Form name<input required value={formName} onChange={(event) => onFormNameChange(event.target.value)} /></label><div className="field-list">{fields.map((field, index) => <div className="builder-field-wrap" key={`${field.key}-${index}`}><div className="builder-field"><input value={field.label} onChange={(event) => onUpdateField(index, { label: event.target.value })} aria-label="Field label" /><select value={field.type} onChange={(event) => { const type = event.target.value; onUpdateField(index, { type }); if (optionFieldTypes.has(type) && !field.config?.options?.length) onUpdateConfig(index, { options: ['Option 1'] }) }} aria-label="Field type"><option value="short_text">Short text</option><option value="email">Email</option><option value="phone">Phone</option><option value="long_text">Long text</option><option value="number">Number</option><option value="date">Date</option><option value="dropdown">Dropdown</option><option value="radio">Multiple choice</option><option value="multi_select">Multi-select</option><option value="checkbox">Checkboxes</option><option value="consent">Consent</option></select><label className="inline-check"><input type="checkbox" checked={field.required} onChange={(event) => onUpdateField(index, { required: event.target.checked })} /> Required</label><button type="button" className="remove-field" onClick={() => onRemoveField(index)}>×</button></div>{optionFieldTypes.has(field.type) && <div className="option-editor"><strong>Options</strong>{(field.config?.options || []).map((option, optionIndex) => <div className="option-row" key={`${field.key}-option-${optionIndex}`}><input value={option} onChange={(event) => onUpdateOption(index, optionIndex, event.target.value)} aria-label={`Option ${optionIndex + 1}`} /><button type="button" className="remove-field" onClick={() => onRemoveOption(index, optionIndex)}>×</button></div>)}<button type="button" className="button button-light button-small" onClick={() => onAddOption(index)}>+ Add option</button></div>}</div>)}</div><div className="builder-actions"><button className="button button-light" type="button" onClick={onAddField}>+ Add question</button><button className="button button-primary" type="submit">{editingForm ? 'Publish new version' : 'Publish form'}</button></div></form></section><section className="admin-card"><div className="section-kicker">PUBLISHED FORMS</div><h2>Forms library</h2><div className="admin-table">{overview.forms.map((form) => <div className="admin-row" key={form.id}><div><strong>{form.name}</strong><small>{form.templateStatus === 'archived' ? 'Archived' : form.versionId ? `Published v${form.versionNumber} · ${form.versionCount} versions` : 'No published version'}</small></div>{form.templateStatus !== 'archived' && <div className="admin-row-actions"><button className="button button-light button-small" type="button" onClick={() => onEditForm(form)}>Edit</button><button className="button button-light button-small" type="button" onClick={() => onArchiveForm(form)}>Archive</button></div>}</div>)}{!overview.forms.length && <p className="admin-muted">No forms created yet.</p>}</div><p className="library-note">{publishedForms.length} published form{publishedForms.length === 1 ? '' : 's'} available for event assignment.</p></section></div></>
}

function RegistrationTable({ registrations }) { return <div className="admin-table">{registrations.map((registration) => <div className="admin-row" key={registration.registrationCode}><div><strong>{registration.fullName}</strong><small>{registration.title} · {registration.email}</small></div><div className="registration-meta"><span className={`status-pill status-${registration.status}`}>{registration.status.replaceAll('_', ' ')}</span><small>{money(registration.amountMinor)}</small></div></div>)}{!registrations.length && <p className="admin-muted">No registrations yet.</p>}</div> }
function RegistrationsView({ registrations }) { return <><div className="view-toolbar"><div><div className="section-kicker">PARTICIPANTS</div><h2>Registration activity</h2></div><span className="admin-badge">{registrations.length} latest</span></div><section className="admin-card"><RegistrationTable registrations={registrations} /></section></> }
