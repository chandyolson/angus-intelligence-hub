
-- Log of corrections made through the Data Quality UI
CREATE TABLE public.corrections_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  table_name text NOT NULL,
  lifetime_id text,
  breeding_year integer,
  field_name text NOT NULL,
  original_value text,
  new_value text,
  corrected_at timestamptz NOT NULL DEFAULT now(),
  note text
);

-- Flags that have been reviewed and suppressed
CREATE TABLE public.reviewed_flags (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rule text NOT NULL,
  lifetime_id text NOT NULL,
  breeding_year integer,
  note text,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(rule, lifetime_id, breeding_year)
);

-- No RLS needed since this is an internal analytics tool without auth
