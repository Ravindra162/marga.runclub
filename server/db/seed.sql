-- Minimal development seed for Marga Run Club.
-- Run after schema.sql. Dates are intentionally omitted: organizers create dated
-- occurrences from these reusable series based on the current calendar.

INSERT INTO organizations (name, slug, default_currency, timezone)
VALUES ('Marga Run Club', 'marga-run-club', 'INR', 'Asia/Kolkata')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO event_series (
  organization_id, slug, title, category, description, recurrence_rule,
  default_weekday, default_start_time, default_duration_minutes, default_location
)
SELECT o.id, seed.slug, seed.title, seed.category, seed.description, seed.recurrence_rule,
       seed.default_weekday, seed.default_start_time::time, seed.default_duration_minutes,
       seed.default_location::jsonb
FROM organizations o
CROSS JOIN (VALUES
  ('sunday-morning-run', 'Sunday Morning Run', 'running', 'Weekly sunrise run with 5K, 3K and walk/jog groups.', 'FREQ=WEEKLY;BYDAY=SU', 0, '06:30', 90, '{"venue":"Cubbon Park Gate"}'),
  ('tuesday-badminton', 'Tuesday Badminton', 'badminton', 'Friendly recreational doubles and drills.', 'FREQ=WEEKLY;BYDAY=TU', 2, '19:30', 120, '{"venue":"ASC Indiranagar"}'),
  ('thursday-pickleball', 'Thursday Pickleball', 'pickleball', 'Rookie-friendly sunset dink and play night.', 'FREQ=WEEKLY;BYDAY=TH', 4, '18:30', 120, '{"venue":"City Hub Koramangala"}'),
  ('f1-screening', 'F1 Screening', 'f1_screening', 'Race-calendar-based community screening and social.', NULL, NULL, NULL, 240, '{"venue":"Third Wave Terrace"}')
) AS seed(slug, title, category, description, recurrence_rule, default_weekday, default_start_time, default_duration_minutes, default_location)
ON o.slug = 'marga-run-club'
ON CONFLICT (organization_id, slug) DO NOTHING;

-- A form template is reusable, while each published form version is immutable.
INSERT INTO form_templates (organization_id, name, description)
SELECT id, 'Standard Event Registration', 'Default registration form for Marga Run Club events.'
FROM organizations WHERE slug = 'marga-run-club'
  AND NOT EXISTS (
    SELECT 1 FROM form_templates WHERE organization_id = organizations.id AND name = 'Standard Event Registration'
  );

INSERT INTO form_versions (form_template_id, version_number, status, published_at)
SELECT id, 1, 'published', now()
FROM form_templates
WHERE name = 'Standard Event Registration'
  AND NOT EXISTS (SELECT 1 FROM form_versions WHERE form_template_id = form_templates.id AND version_number = 1);

INSERT INTO form_fields (form_version_id, field_key, field_type, label, is_required, position, config_json)
SELECT v.id, f.field_key, f.field_type, f.label, f.is_required, f.position, f.config_json::jsonb
FROM form_versions v
CROSS JOIN (VALUES
  ('full_name', 'short_text', 'Full name', true, 0, '{"placeholder":"Your name"}'),
  ('email', 'email', 'Email address', true, 1, '{"placeholder":"you@example.com"}'),
  ('phone', 'phone', 'Phone number', true, 2, '{"placeholder":"+91 98765 43210"}'),
  ('emergency_contact', 'short_text', 'Emergency contact', true, 3, '{"placeholder":"Name and phone number"}'),
  ('waiver', 'consent', 'I agree to Marga Run Club safety and participation guidelines.', true, 4, '{"link":"/community-guidelines"}')
) AS f(field_key, field_type, label, is_required, position, config_json)
WHERE v.version_number = 1
  AND NOT EXISTS (SELECT 1 FROM form_fields existing WHERE existing.form_version_id = v.id);

-- Create the next open occurrence for the three weekly activities. F1 occurrences are
-- created by an organizer after the race calendar and venue are confirmed.
INSERT INTO event_occurrences (
  event_series_id, form_version_id, starts_at, ends_at,
  registration_opens_at, registration_closes_at, capacity, status, location
)
SELECT
  s.id,
  v.id,
  (((current_date + ((s.default_weekday - extract(dow FROM current_date)::int + 7) % 7))::date + s.default_start_time) AT TIME ZONE o.timezone),
  (((current_date + ((s.default_weekday - extract(dow FROM current_date)::int + 7) % 7))::date + s.default_start_time + make_interval(mins => s.default_duration_minutes)) AT TIME ZONE o.timezone),
  now(),
  (((current_date + ((s.default_weekday - extract(dow FROM current_date)::int + 7) % 7))::date + s.default_start_time) AT TIME ZONE o.timezone),
  CASE s.category WHEN 'running' THEN 100 ELSE 24 END,
  'open',
  s.default_location
FROM event_series s
JOIN organizations o ON o.id = s.organization_id
JOIN form_versions v ON v.status = 'published'
WHERE o.slug = 'marga-run-club'
  AND s.default_weekday IS NOT NULL
  AND v.form_template_id IN (SELECT id FROM form_templates WHERE organization_id = o.id)
  AND NOT EXISTS (
    SELECT 1 FROM event_occurrences existing
    WHERE existing.event_series_id = s.id
      AND existing.starts_at::date = current_date + ((s.default_weekday - extract(dow FROM current_date)::int + 7) % 7)
  );

INSERT INTO event_tickets (occurrence_id, code, name, amount_minor, currency, capacity)
SELECT o.id,
       CASE s.category WHEN 'running' THEN 'free-entry' ELSE 'standard' END,
       CASE s.category WHEN 'running' THEN 'Community entry' WHEN 'badminton' THEN 'Badminton court share' ELSE 'Pickleball player slot' END,
       CASE s.category WHEN 'running' THEN 0 WHEN 'badminton' THEN 25000 ELSE 35000 END,
       'INR',
       o.capacity
FROM event_occurrences o
JOIN event_series s ON s.id = o.event_series_id
WHERE o.status = 'open'
  AND NOT EXISTS (SELECT 1 FROM event_tickets existing WHERE existing.occurrence_id = o.id);
