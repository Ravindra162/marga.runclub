-- Marga Run Club database schema
-- PostgreSQL 15+ / Supabase compatible.
-- Money is always stored in the smallest currency unit (paise for INR).
-- Payment credentials and secrets are never stored in this database.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  default_currency char(3) NOT NULL DEFAULT 'INR',
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  display_name text NOT NULL,
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX app_users_email_lower_idx ON app_users (lower(email));

CREATE TABLE organization_members (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'event_manager', 'viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

-- A series describes a recurring activity; an occurrence is the actual dated event.
CREATE TABLE event_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  slug text NOT NULL,
  title text NOT NULL,
  category text NOT NULL CHECK (category IN ('running', 'badminton', 'pickleball', 'f1_screening', 'fitness', 'other')),
  description text,
  recurrence_rule text,
  default_weekday smallint CHECK (default_weekday BETWEEN 0 AND 6),
  default_start_time time,
  default_duration_minutes integer CHECK (default_duration_minutes > 0),
  default_location jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug)
);

CREATE TABLE form_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_series_id uuid REFERENCES event_series(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived')),
  created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Published versions are immutable. Editing a form creates version 2, never mutates version 1.
CREATE TABLE form_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_template_id uuid NOT NULL REFERENCES form_templates(id) ON DELETE CASCADE,
  version_number integer NOT NULL CHECK (version_number > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'retired')),
  published_at timestamptz,
  created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (form_template_id, version_number)
);

CREATE UNIQUE INDEX one_published_form_version_idx
  ON form_versions (form_template_id)
  WHERE status = 'published';

-- Field definitions power the Google Forms-style builder.
-- config_json examples: options, min/max, placeholder, regex, visibility rules, etc.
CREATE TABLE form_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_version_id uuid NOT NULL REFERENCES form_versions(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  field_type text NOT NULL CHECK (field_type IN (
    'short_text', 'long_text', 'email', 'phone', 'number', 'date', 'time',
    'dropdown', 'multi_select', 'radio', 'checkbox', 'boolean', 'consent',
    'heading', 'paragraph', 'file'
  )),
  label text NOT NULL,
  help_text text,
  is_required boolean NOT NULL DEFAULT false,
  position integer NOT NULL CHECK (position >= 0),
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  data_classification text NOT NULL DEFAULT 'normal' CHECK (data_classification IN ('normal', 'sensitive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (form_version_id, field_key),
  UNIQUE (form_version_id, position)
);

CREATE TABLE event_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_series_id uuid NOT NULL REFERENCES event_series(id) ON DELETE CASCADE,
  form_version_id uuid REFERENCES form_versions(id) ON DELETE RESTRICT,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  capacity integer CHECK (capacity IS NULL OR capacity > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'full', 'closed', 'cancelled', 'completed')),
  location jsonb NOT NULL DEFAULT '{}'::jsonb,
  external_reference text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at > starts_at),
  CHECK (registration_closes_at IS NULL OR registration_opens_at IS NULL OR registration_closes_at > registration_opens_at)
);

CREATE INDEX event_occurrences_calendar_idx ON event_occurrences (event_series_id, starts_at);
CREATE INDEX event_occurrences_open_idx ON event_occurrences (status, starts_at);

CREATE TABLE event_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurrence_id uuid NOT NULL REFERENCES event_occurrences(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  currency char(3) NOT NULL DEFAULT 'INR',
  capacity integer CHECK (capacity IS NULL OR capacity > 0),
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (occurrence_id, code)
);

CREATE TABLE participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  marketing_consent boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX participants_email_lower_idx
  ON participants (organization_id, lower(email));

-- A form submission is separate from a registration so the form system can later support
-- contact forms, waitlists, feedback, or other non-payment forms.
CREATE TABLE form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_version_id uuid NOT NULL REFERENCES form_versions(id) ON DELETE RESTRICT,
  occurrence_id uuid REFERENCES event_occurrences(id) ON DELETE RESTRICT,
  participant_id uuid REFERENCES participants(id) ON DELETE SET NULL,
  response_token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft', 'submitted', 'invalid', 'deleted')),
  answers_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_from text,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'submitted' OR submitted_at IS NOT NULL)
);

-- Optional normalized answers make exports and admin filters efficient while preserving
-- answers_json as the canonical response snapshot.
CREATE TABLE form_submission_answers (
  submission_id uuid NOT NULL REFERENCES form_submissions(id) ON DELETE CASCADE,
  field_id uuid NOT NULL REFERENCES form_fields(id) ON DELETE RESTRICT,
  field_key text NOT NULL,
  field_label_snapshot text NOT NULL,
  value_json jsonb NOT NULL DEFAULT 'null'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (submission_id, field_id)
);

CREATE TABLE registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_code text NOT NULL UNIQUE,
  occurrence_id uuid NOT NULL REFERENCES event_occurrences(id) ON DELETE RESTRICT,
  participant_id uuid NOT NULL REFERENCES participants(id) ON DELETE RESTRICT,
  form_submission_id uuid NOT NULL UNIQUE REFERENCES form_submissions(id) ON DELETE RESTRICT,
  form_version_id uuid NOT NULL REFERENCES form_versions(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'awaiting_payment' CHECK (status IN (
    'draft', 'awaiting_payment', 'payment_pending', 'confirmed', 'waitlisted',
    'cancelled', 'expired', 'refunded'
  )),
  total_amount_minor bigint NOT NULL DEFAULT 0 CHECK (total_amount_minor >= 0),
  currency char(3) NOT NULL DEFAULT 'INR',
  source text NOT NULL DEFAULT 'website' CHECK (source IN ('website', 'admin', 'import', 'api')),
  expires_at timestamptz,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Prevent duplicate active signups, while allowing a cancelled participant to register again.
CREATE UNIQUE INDEX one_active_registration_per_participant_idx
  ON registrations (occurrence_id, participant_id)
  WHERE status NOT IN ('cancelled', 'expired', 'refunded');

CREATE INDEX registrations_occurrence_status_idx ON registrations (occurrence_id, status);
CREATE INDEX registrations_code_idx ON registrations (registration_code);

CREATE TABLE registration_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  ticket_id uuid NOT NULL REFERENCES event_tickets(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_amount_minor bigint NOT NULL CHECK (unit_amount_minor >= 0),
  total_amount_minor bigint NOT NULL CHECK (total_amount_minor >= 0),
  ticket_name_snapshot text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One order is the business payment intent. Attempts record retries/status checks.
CREATE TABLE payment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL UNIQUE REFERENCES registrations(id) ON DELETE RESTRICT,
  provider text NOT NULL DEFAULT 'phonepe' CHECK (provider IN ('phonepe')),
  merchant_order_id text NOT NULL UNIQUE,
  provider_order_id text,
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  currency char(3) NOT NULL DEFAULT 'INR',
  status text NOT NULL DEFAULT 'created' CHECK (status IN (
    'created', 'pending', 'paid', 'failed', 'expired', 'cancelled', 'refunded', 'partially_refunded'
  )),
  checkout_url text,
  expires_at timestamptz,
  paid_at timestamptz,
  idempotency_key text NOT NULL UNIQUE,
  provider_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX payment_orders_status_idx ON payment_orders (status, created_at);

CREATE TABLE payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_order_id uuid NOT NULL REFERENCES payment_orders(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  status text NOT NULL CHECK (status IN ('started', 'pending', 'success', 'failed', 'cancelled')),
  payment_method text,
  provider_transaction_id text,
  provider_response_code text,
  provider_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (payment_order_id, attempt_number)
);

-- Webhook processing must be idempotent: never apply the same provider event twice.
CREATE TABLE payment_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'phonepe',
  provider_event_id text,
  event_type text,
  payload_hash text NOT NULL UNIQUE,
  payload jsonb NOT NULL,
  processing_status text NOT NULL DEFAULT 'received' CHECK (processing_status IN ('received', 'processed', 'ignored', 'failed')),
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  error_message text,
  UNIQUE (provider, provider_event_id)
);

CREATE TABLE refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_order_id uuid NOT NULL REFERENCES payment_orders(id) ON DELETE RESTRICT,
  provider_refund_id text UNIQUE,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'pending', 'completed', 'failed')),
  reason text,
  provider_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_entity_idx ON audit_log (entity_type, entity_id, created_at DESC);

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER organizations_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER app_users_updated_at BEFORE UPDATE ON app_users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER event_series_updated_at BEFORE UPDATE ON event_series FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER form_templates_updated_at BEFORE UPDATE ON form_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER event_occurrences_updated_at BEFORE UPDATE ON event_occurrences FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER participants_updated_at BEFORE UPDATE ON participants FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER registrations_updated_at BEFORE UPDATE ON registrations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER payment_orders_updated_at BEFORE UPDATE ON payment_orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
