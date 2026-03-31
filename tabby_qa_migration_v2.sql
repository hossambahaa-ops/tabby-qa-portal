-- ============================================================================
-- TABBY QA PERFORMANCE PORTAL — COMPLETE DATABASE MIGRATION (FIXED)
-- ============================================================================
-- Single file. Paste into Supabase SQL Editor and run once.
-- Safe on a fresh project — uses IF NOT EXISTS everywhere.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 0. EXTENSIONS
-- ────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "moddatetime";


-- ────────────────────────────────────────────────────────────────────────────
-- 1. CUSTOM ENUM TYPES
-- ────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN CREATE TYPE user_role AS ENUM ('qa','qa_lead','qa_supervisor','admin','super_admin'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE domain_enum AS ENUM ('tabby.ai','tabby.sa'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE profile_status AS ENUM ('active','inactive','on_leave'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE dam_severity AS ENUM ('notice','warning','critical'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE dam_action AS ENUM ('coaching','action_plan','pip','termination_review'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE dam_flag_status AS ENUM ('pending','acknowledged','action_created','resolved','dismissed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE plan_type_enum AS ENUM ('action_plan','pip'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE plan_status AS ENUM ('draft','active','extended','completed_pass','completed_fail','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE meeting_type_enum AS ENUM ('weekly_1on1','performance_review','ap_checkin','pip_checkin','ad_hoc','return_from_leave'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE session_conclusion AS ENUM ('on_track','needs_improvement','ap_recommended','pip_recommended','pip_pass','pip_fail'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE email_template_type AS ENUM ('weekly_feedback','ap_start','ap_checkin','pip_start','pip_checkin','pip_outcome','general'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE email_status AS ENUM ('draft','sent','failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE hr_case_type AS ENUM ('verbal_warning','written_warning','final_warning','suspension','termination'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE hr_case_status AS ENUM ('open','in_progress','escalated','resolved','closed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE escalation_status AS ENUM ('submitted','under_review','investigating','resolved','dismissed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE escalation_category AS ENUM ('unfair_treatment','harassment','scoring_dispute','workload','policy_violation','other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ────────────────────────────────────────────────────────────────────────────
-- 2. TABLES
-- ────────────────────────────────────────────────────────────────────────────

-- ░░░ IDENTITY & ACCESS ░░░ --

CREATE TABLE IF NOT EXISTS teams (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  domain        domain_enum NOT NULL,
  lead_id       uuid,
  supervisor_id uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profiles (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         text NOT NULL UNIQUE,
  display_name  text,
  avatar_url    text,
  role          user_role NOT NULL DEFAULT 'qa',
  domain        domain_enum NOT NULL DEFAULT 'tabby.ai',
  team_id       uuid REFERENCES teams(id) ON DELETE SET NULL,
  status        profile_status NOT NULL DEFAULT 'active',
  hired_at      date,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE teams ADD CONSTRAINT fk_teams_lead FOREIGN KEY (lead_id) REFERENCES profiles(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE teams ADD CONSTRAINT fk_teams_supervisor FOREIGN KEY (supervisor_id) REFERENCES profiles(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS role_hierarchy (
  id            serial PRIMARY KEY,
  role          user_role NOT NULL,
  manages_role  user_role NOT NULL,
  level         int NOT NULL,
  UNIQUE (role, manages_role)
);

INSERT INTO role_hierarchy (role, manages_role, level) VALUES
  ('qa_lead',       'qa',             2),
  ('qa_supervisor', 'qa',             3),
  ('qa_supervisor', 'qa_lead',        3),
  ('admin',         'qa',             4),
  ('admin',         'qa_lead',        4),
  ('admin',         'qa_supervisor',  4),
  ('super_admin',   'qa',             5),
  ('super_admin',   'qa_lead',        5),
  ('super_admin',   'qa_supervisor',  5),
  ('super_admin',   'admin',          5)
ON CONFLICT (role, manages_role) DO NOTHING;


-- ░░░ PERFORMANCE & KPIs ░░░ --

CREATE TABLE IF NOT EXISTS kpi_definitions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  slug          text NOT NULL UNIQUE,
  description   text,
  unit          text DEFAULT '%',
  target_value  numeric,
  min_value     numeric DEFAULT 0,
  max_value     numeric DEFAULT 100,
  weight        numeric NOT NULL DEFAULT 1.0,
  is_active     boolean NOT NULL DEFAULT true,
  sort_order    int DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

INSERT INTO kpi_definitions (name, slug, description, unit, target_value, weight, sort_order) VALUES
  ('Response Time Rate', 'rtr', 'Percentage of responses delivered within SLA', '%', 85, 1.0, 1),
  ('Occupancy',          'occupancy', 'Percentage of available time spent on productive work', '%', 80, 1.0, 2)
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS kpi_targets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_id        uuid NOT NULL REFERENCES kpi_definitions(id) ON DELETE CASCADE,
  team_id       uuid REFERENCES teams(id) ON DELETE CASCADE,
  domain        domain_enum,
  target_value  numeric NOT NULL,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to  date,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- scores: month is a plain column, populated by trigger (NOT a generated column)
CREATE TABLE IF NOT EXISTS scores (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kpi_id        uuid NOT NULL REFERENCES kpi_definitions(id) ON DELETE CASCADE,
  score_value   numeric NOT NULL,
  target_value  numeric,
  week_start    date NOT NULL,
  month         text,
  domain        domain_enum,
  team_id       uuid REFERENCES teams(id) ON DELETE SET NULL,
  entered_by    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  source        text NOT NULL DEFAULT 'manual',
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Trigger to auto-set month from week_start
CREATE OR REPLACE FUNCTION public.set_score_month()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.month := to_char(NEW.week_start, 'YYYY-MM');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_score_month ON scores;
CREATE TRIGGER trg_set_score_month
  BEFORE INSERT OR UPDATE ON scores
  FOR EACH ROW EXECUTE FUNCTION public.set_score_month();

CREATE TABLE IF NOT EXISTS composite_scores (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  week_start      date NOT NULL,
  composite_value numeric NOT NULL,
  rank_in_team    int,
  rank_in_domain  int,
  rank_global     int,
  domain          domain_enum,
  team_id         uuid REFERENCES teams(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, week_start)
);


-- ░░░ DAM ENGINE ░░░ --

CREATE TABLE IF NOT EXISTS dam_rules (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  description         text,
  kpi_id              uuid REFERENCES kpi_definitions(id) ON DELETE SET NULL,
  condition_type      text NOT NULL CHECK (condition_type IN ('below_threshold','above_threshold','consecutive_weeks','rolling_average')),
  threshold_value     numeric NOT NULL,
  consecutive_weeks   int DEFAULT 1,
  severity            dam_severity NOT NULL,
  recommended_action  dam_action NOT NULL,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now()
);

INSERT INTO dam_rules (name, description, kpi_id, condition_type, threshold_value, consecutive_weeks, severity, recommended_action)
SELECT
  'RTR below 70% for 3 consecutive weeks',
  'Flags QAs whose RTR drops below 70% for 3 weeks running',
  kd.id, 'consecutive_weeks', 70, 3, 'warning', 'action_plan'
FROM kpi_definitions kd WHERE kd.slug = 'rtr'
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS dam_flags (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rule_id             uuid NOT NULL REFERENCES dam_rules(id) ON DELETE CASCADE,
  severity            dam_severity NOT NULL,
  recommended_action  dam_action NOT NULL,
  triggered_at        timestamptz NOT NULL DEFAULT now(),
  trigger_data        jsonb,
  status              dam_flag_status NOT NULL DEFAULT 'pending',
  reviewed_by         uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at         timestamptz,
  action_plan_id      uuid,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);


-- ░░░ AP / PIP MANAGEMENT ░░░ --

CREATE TABLE IF NOT EXISTS action_plans (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plan_type     plan_type_enum NOT NULL,
  status        plan_status NOT NULL DEFAULT 'draft',
  created_by    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  dam_flag_id   uuid REFERENCES dam_flags(id) ON DELETE SET NULL,
  title         text NOT NULL,
  description   text,
  kpi_targets   jsonb,
  start_date    date NOT NULL,
  end_date      date NOT NULL,
  outcome       text,
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE dam_flags ADD CONSTRAINT fk_dam_flags_action_plan FOREIGN KEY (action_plan_id) REFERENCES action_plans(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS action_plan_reviews (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_plan_id  uuid NOT NULL REFERENCES action_plans(id) ON DELETE CASCADE,
  week_start      date NOT NULL,
  scores_snapshot jsonb,
  overall_pass    boolean,
  reviewer_id     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  comments        text,
  created_at      timestamptz NOT NULL DEFAULT now()
);


-- ░░░ COACHING & EMAIL ░░░ --

CREATE TABLE IF NOT EXISTS coaching_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  coach_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  meeting_type    meeting_type_enum NOT NULL,
  session_date    date NOT NULL,
  week_start      date,
  scores_data     jsonb,
  action_plan_id  uuid REFERENCES action_plans(id) ON DELETE SET NULL,
  ap_week_pass    boolean,
  conclusion      session_conclusion,
  agenda          text,
  notes           text,
  follow_up_actions text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coaching_emails (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        uuid NOT NULL REFERENCES coaching_sessions(id) ON DELETE CASCADE,
  template_type     email_template_type NOT NULL,
  from_email        text NOT NULL,
  to_email          text NOT NULL,
  cc_emails         text[],
  subject           text NOT NULL,
  body_html         text NOT NULL,
  gmail_message_id  text,
  status            email_status NOT NULL DEFAULT 'draft',
  sent_at           timestamptz,
  error_message     text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_templates (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_type       email_template_type NOT NULL UNIQUE,
  name                text NOT NULL,
  subject_template    text NOT NULL,
  body_template       text NOT NULL,
  available_variables text[],
  is_active           boolean NOT NULL DEFAULT true,
  updated_by          uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

INSERT INTO email_templates (template_type, name, subject_template, body_template, available_variables) VALUES
  ('weekly_feedback',
   'Weekly performance feedback',
   'Weekly Performance Review - {{qa_name}} - Week of {{week_start}}',
   '<h2>Hi {{qa_name}},</h2><p>Here is your performance summary for the week of <strong>{{week_start}}</strong>.</p><table border="1" cellpadding="8"><tr><th>KPI</th><th>Score</th><th>Target</th><th>Status</th></tr>{{scores_table}}</table><p><strong>Overall:</strong> {{conclusion}}</p><p>{{coach_notes}}</p><p>Best regards,<br/>{{coach_name}}</p>',
   ARRAY['qa_name','week_start','scores_table','conclusion','coach_notes','coach_name']),
  ('ap_start',
   'Action plan initiation',
   'Action Plan Initiated - {{qa_name}} - {{plan_title}}',
   '<h2>Hi {{qa_name}},</h2><p>An Action Plan has been created for you effective <strong>{{start_date}}</strong> through <strong>{{end_date}}</strong>.</p><p><strong>Focus areas:</strong></p>{{kpi_targets_table}}<p>{{description}}</p><p>We will review your progress weekly.</p><p>Best regards,<br/>{{coach_name}}</p>',
   ARRAY['qa_name','plan_title','start_date','end_date','kpi_targets_table','description','coach_name']),
  ('pip_start',
   'PIP initiation',
   'Performance Improvement Plan - {{qa_name}} - {{plan_title}}',
   '<h2>Hi {{qa_name}},</h2><p>A Performance Improvement Plan (PIP) has been initiated effective <strong>{{start_date}}</strong> through <strong>{{end_date}}</strong>.</p><p><strong>Required targets:</strong></p>{{kpi_targets_table}}<p>{{description}}</p><p>Weekly check-ins will be scheduled.</p><p>Best regards,<br/>{{coach_name}}</p>',
   ARRAY['qa_name','plan_title','start_date','end_date','kpi_targets_table','description','coach_name']),
  ('pip_outcome',
   'PIP outcome notification',
   'PIP Outcome - {{qa_name}} - {{outcome}}',
   '<h2>Hi {{qa_name}},</h2><p>Your Performance Improvement Plan "{{plan_title}}" has concluded.</p><p><strong>Outcome:</strong> {{outcome}}</p><p>{{summary}}</p><p>Best regards,<br/>{{coach_name}}</p>',
   ARRAY['qa_name','plan_title','outcome','summary','coach_name']),
  ('general',
   'General coaching email',
   '{{subject}}',
   '<h2>Hi {{qa_name}},</h2><p>{{body}}</p><p>Best regards,<br/>{{coach_name}}</p>',
   ARRAY['qa_name','subject','body','coach_name'])
ON CONFLICT (template_type) DO NOTHING;


-- ░░░ HR & DISCIPLINARY ░░░ --

CREATE TABLE IF NOT EXISTS hr_cases (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  case_type       hr_case_type NOT NULL,
  status          hr_case_status NOT NULL DEFAULT 'open',
  opened_by       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_to     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  dam_flag_id     uuid REFERENCES dam_flags(id) ON DELETE SET NULL,
  action_plan_id  uuid REFERENCES action_plans(id) ON DELETE SET NULL,
  title           text NOT NULL,
  description     text,
  resolution      text,
  opened_at       timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hr_case_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id     uuid NOT NULL REFERENCES hr_cases(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content     text NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);


-- ░░░ ESCALATIONS ░░░ --

CREATE TABLE IF NOT EXISTS escalations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_by  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  against_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category      escalation_category NOT NULL,
  subject       text NOT NULL,
  description   text NOT NULL,
  evidence_urls text[],
  status        escalation_status NOT NULL DEFAULT 'submitted',
  assigned_to   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  resolution    text,
  is_anonymous  boolean NOT NULL DEFAULT false,
  submitted_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at   timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now()
);


-- ░░░ SYSTEM CONFIG ░░░ --

CREATE TABLE IF NOT EXISTS app_settings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text NOT NULL UNIQUE,
  value       jsonb NOT NULL,
  description text,
  updated_by  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO app_settings (key, value, description) VALUES
  ('leaderboard_anonymous_below_role', '"qa_lead"'::jsonb, 'QAs below this role see anonymized leaderboard names'),
  ('default_scoring_period', '"weekly"'::jsonb, 'Default period for score entry'),
  ('dam_evaluation_frequency', '"weekly"'::jsonb, 'How often the DAM engine runs'),
  ('composite_score_method', '"weighted_average"'::jsonb, 'Composite score calculation method'),
  ('max_consecutive_weeks_for_dam', '4'::jsonb, 'Max lookback for consecutive-week DAM rules')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action        text NOT NULL,
  target_table  text,
  target_id     uuid,
  old_data      jsonb,
  new_data      jsonb,
  ip_address    inet,
  created_at    timestamptz NOT NULL DEFAULT now()
);


-- ────────────────────────────────────────────────────────────────────────────
-- 3. INDEXES
-- ────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_profiles_team     ON profiles(team_id);
CREATE INDEX IF NOT EXISTS idx_profiles_domain   ON profiles(domain);
CREATE INDEX IF NOT EXISTS idx_profiles_role     ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_email    ON profiles(email);

CREATE INDEX IF NOT EXISTS idx_scores_profile    ON scores(profile_id);
CREATE INDEX IF NOT EXISTS idx_scores_week       ON scores(week_start);
CREATE INDEX IF NOT EXISTS idx_scores_kpi        ON scores(kpi_id);
CREATE INDEX IF NOT EXISTS idx_scores_team       ON scores(team_id);
CREATE INDEX IF NOT EXISTS idx_scores_domain     ON scores(domain);
CREATE INDEX IF NOT EXISTS idx_scores_month      ON scores(month);
CREATE INDEX IF NOT EXISTS idx_scores_lookup     ON scores(profile_id, kpi_id, week_start);

CREATE INDEX IF NOT EXISTS idx_composite_profile ON composite_scores(profile_id);
CREATE INDEX IF NOT EXISTS idx_composite_week    ON composite_scores(week_start);
CREATE INDEX IF NOT EXISTS idx_composite_team    ON composite_scores(team_id);
CREATE INDEX IF NOT EXISTS idx_composite_domain  ON composite_scores(domain);

CREATE INDEX IF NOT EXISTS idx_dam_flags_profile ON dam_flags(profile_id);
CREATE INDEX IF NOT EXISTS idx_dam_flags_status  ON dam_flags(status);

CREATE INDEX IF NOT EXISTS idx_action_plans_profile ON action_plans(profile_id);
CREATE INDEX IF NOT EXISTS idx_action_plans_status  ON action_plans(status);

CREATE INDEX IF NOT EXISTS idx_coaching_profile  ON coaching_sessions(profile_id);
CREATE INDEX IF NOT EXISTS idx_coaching_coach    ON coaching_sessions(coach_id);
CREATE INDEX IF NOT EXISTS idx_coaching_date     ON coaching_sessions(session_date);

CREATE INDEX IF NOT EXISTS idx_hr_cases_profile  ON hr_cases(profile_id);
CREATE INDEX IF NOT EXISTS idx_hr_cases_status   ON hr_cases(status);

CREATE INDEX IF NOT EXISTS idx_escalations_by      ON escalations(submitted_by);
CREATE INDEX IF NOT EXISTS idx_escalations_against ON escalations(against_id);
CREATE INDEX IF NOT EXISTS idx_escalations_status  ON escalations(status);

CREATE INDEX IF NOT EXISTS idx_audit_action      ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_created     ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_actor       ON audit_log(actor_id);


-- ────────────────────────────────────────────────────────────────────────────
-- 4. HELPER FUNCTIONS
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS user_role LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_my_team_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT team_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.role_level(r user_role)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE r
    WHEN 'qa'             THEN 1
    WHEN 'qa_lead'        THEN 2
    WHEN 'qa_supervisor'  THEN 3
    WHEN 'admin'          THEN 4
    WHEN 'super_admin'    THEN 5
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.has_role_or_above(minimum_role user_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT public.role_level(public.get_my_role()) >= public.role_level(minimum_role);
$$;

CREATE OR REPLACE FUNCTION public.is_lead_of_team(t_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.teams WHERE id = t_id AND lead_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_supervisor_of_team(t_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.teams WHERE id = t_id AND supervisor_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.get_supervised_team_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM public.teams
  WHERE lead_id = auth.uid() OR supervisor_id = auth.uid();
$$;

-- Auto-create profile on first Google sign-in
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  user_domain domain_enum;
BEGIN
  IF NEW.email LIKE '%@tabby.sa' THEN
    user_domain := 'tabby.sa';
  ELSE
    user_domain := 'tabby.ai';
  END IF;

  INSERT INTO public.profiles (id, email, display_name, avatar_url, domain)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data ->> 'avatar_url', NEW.raw_user_meta_data ->> 'picture'),
    user_domain
  )
  ON CONFLICT (id) DO UPDATE SET
    display_name = COALESCE(EXCLUDED.display_name, profiles.display_name),
    avatar_url   = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url),
    updated_at   = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Audit logging helper
CREATE OR REPLACE FUNCTION public.log_audit(
  p_action text,
  p_target_table text DEFAULT NULL,
  p_target_id uuid DEFAULT NULL,
  p_old_data jsonb DEFAULT NULL,
  p_new_data jsonb DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.audit_log (actor_id, action, target_table, target_id, old_data, new_data)
  VALUES (auth.uid(), p_action, p_target_table, p_target_id, p_old_data, p_new_data);
END;
$$;

-- Composite score calculator
CREATE OR REPLACE FUNCTION public.calculate_composite_scores(p_week_start date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM public.composite_scores WHERE week_start = p_week_start;

  INSERT INTO public.composite_scores (profile_id, week_start, composite_value, domain, team_id)
  SELECT
    s.profile_id, p_week_start,
    ROUND(SUM(s.score_value * kd.weight) / NULLIF(SUM(kd.weight), 0), 2),
    p.domain, p.team_id
  FROM public.scores s
  JOIN public.kpi_definitions kd ON kd.id = s.kpi_id AND kd.is_active = true
  JOIN public.profiles p ON p.id = s.profile_id
  WHERE s.week_start = p_week_start
  GROUP BY s.profile_id, p.domain, p.team_id;

  UPDATE public.composite_scores cs SET rank_in_team = sub.rnk
  FROM (SELECT id, RANK() OVER (PARTITION BY team_id ORDER BY composite_value DESC) AS rnk
        FROM public.composite_scores WHERE week_start = p_week_start AND team_id IS NOT NULL) sub
  WHERE cs.id = sub.id;

  UPDATE public.composite_scores cs SET rank_in_domain = sub.rnk
  FROM (SELECT id, RANK() OVER (PARTITION BY domain ORDER BY composite_value DESC) AS rnk
        FROM public.composite_scores WHERE week_start = p_week_start) sub
  WHERE cs.id = sub.id;

  UPDATE public.composite_scores cs SET rank_global = sub.rnk
  FROM (SELECT id, RANK() OVER (ORDER BY composite_value DESC) AS rnk
        FROM public.composite_scores WHERE week_start = p_week_start) sub
  WHERE cs.id = sub.id;
END;
$$;


-- ────────────────────────────────────────────────────────────────────────────
-- 5. AUTO-UPDATE TRIGGERS
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE TRIGGER set_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE OR REPLACE TRIGGER set_action_plans_updated_at BEFORE UPDATE ON action_plans FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE OR REPLACE TRIGGER set_hr_cases_updated_at BEFORE UPDATE ON hr_cases FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE OR REPLACE TRIGGER set_escalations_updated_at BEFORE UPDATE ON escalations FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE OR REPLACE TRIGGER set_email_templates_updated_at BEFORE UPDATE ON email_templates FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE OR REPLACE TRIGGER set_app_settings_updated_at BEFORE UPDATE ON app_settings FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);


-- ────────────────────────────────────────────────────────────────────────────
-- 6. ROW LEVEL SECURITY
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams                ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_hierarchy       ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_definitions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_targets          ENABLE ROW LEVEL SECURITY;
ALTER TABLE scores               ENABLE ROW LEVEL SECURITY;
ALTER TABLE composite_scores     ENABLE ROW LEVEL SECURITY;
ALTER TABLE dam_rules            ENABLE ROW LEVEL SECURITY;
ALTER TABLE dam_flags            ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_plans         ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_plan_reviews  ENABLE ROW LEVEL SECURITY;
ALTER TABLE coaching_sessions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE coaching_emails      ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_cases             ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_case_notes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log            ENABLE ROW LEVEL SECURITY;

-- ── PROFILES ──
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (
  id = auth.uid()
  OR team_id IN (SELECT public.get_supervised_team_ids())
  OR public.has_role_or_above('admin')
);
CREATE POLICY "profiles_update_self" ON profiles FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_admin" ON profiles FOR UPDATE USING (public.has_role_or_above('admin')) WITH CHECK (public.has_role_or_above('admin'));

-- ── TEAMS ──
CREATE POLICY "teams_select" ON teams FOR SELECT USING (true);
CREATE POLICY "teams_modify" ON teams FOR ALL USING (public.has_role_or_above('admin')) WITH CHECK (public.has_role_or_above('admin'));

-- ── ROLE_HIERARCHY ──
CREATE POLICY "role_hierarchy_select" ON role_hierarchy FOR SELECT USING (true);
CREATE POLICY "role_hierarchy_modify" ON role_hierarchy FOR ALL USING (public.has_role_or_above('super_admin')) WITH CHECK (public.has_role_or_above('super_admin'));

-- ── KPI_DEFINITIONS ──
CREATE POLICY "kpi_def_select" ON kpi_definitions FOR SELECT USING (true);
CREATE POLICY "kpi_def_modify" ON kpi_definitions FOR ALL USING (public.has_role_or_above('admin')) WITH CHECK (public.has_role_or_above('admin'));

-- ── KPI_TARGETS ──
CREATE POLICY "kpi_targets_select" ON kpi_targets FOR SELECT USING (true);
CREATE POLICY "kpi_targets_modify" ON kpi_targets FOR ALL USING (public.has_role_or_above('admin')) WITH CHECK (public.has_role_or_above('admin'));

-- ── SCORES ──
CREATE POLICY "scores_select" ON scores FOR SELECT USING (
  profile_id = auth.uid()
  OR team_id IN (SELECT public.get_supervised_team_ids())
  OR public.has_role_or_above('admin')
);
CREATE POLICY "scores_insert" ON scores FOR INSERT WITH CHECK (public.has_role_or_above('qa_lead'));
CREATE POLICY "scores_update" ON scores FOR UPDATE USING (public.has_role_or_above('qa_lead')) WITH CHECK (public.has_role_or_above('qa_lead'));
CREATE POLICY "scores_delete" ON scores FOR DELETE USING (public.has_role_or_above('admin'));

-- ── COMPOSITE_SCORES ──
CREATE POLICY "composite_select" ON composite_scores FOR SELECT USING (
  profile_id = auth.uid()
  OR team_id IN (SELECT public.get_supervised_team_ids())
  OR public.has_role_or_above('admin')
);
CREATE POLICY "composite_modify" ON composite_scores FOR ALL USING (public.has_role_or_above('admin')) WITH CHECK (public.has_role_or_above('admin'));

-- ── DAM_RULES ──
CREATE POLICY "dam_rules_select" ON dam_rules FOR SELECT USING (public.has_role_or_above('qa_lead'));
CREATE POLICY "dam_rules_modify" ON dam_rules FOR ALL USING (public.has_role_or_above('admin')) WITH CHECK (public.has_role_or_above('admin'));

-- ── DAM_FLAGS (QAs cannot see) ──
CREATE POLICY "dam_flags_select" ON dam_flags FOR SELECT USING (
  profile_id IN (SELECT p.id FROM profiles p WHERE p.team_id IN (SELECT public.get_supervised_team_ids()))
  OR public.has_role_or_above('admin')
);
CREATE POLICY "dam_flags_update" ON dam_flags FOR UPDATE USING (public.has_role_or_above('qa_lead')) WITH CHECK (public.has_role_or_above('qa_lead'));

-- ── ACTION_PLANS ──
CREATE POLICY "action_plans_select" ON action_plans FOR SELECT USING (
  profile_id = auth.uid()
  OR profile_id IN (SELECT p.id FROM profiles p WHERE p.team_id IN (SELECT public.get_supervised_team_ids()))
  OR public.has_role_or_above('admin')
);
CREATE POLICY "action_plans_insert" ON action_plans FOR INSERT WITH CHECK (public.has_role_or_above('qa_lead'));
CREATE POLICY "action_plans_update" ON action_plans FOR UPDATE USING (created_by = auth.uid() OR public.has_role_or_above('qa_supervisor')) WITH CHECK (created_by = auth.uid() OR public.has_role_or_above('qa_supervisor'));

-- ── ACTION_PLAN_REVIEWS ──
CREATE POLICY "ap_reviews_select" ON action_plan_reviews FOR SELECT USING (action_plan_id IN (SELECT id FROM action_plans));
CREATE POLICY "ap_reviews_insert" ON action_plan_reviews FOR INSERT WITH CHECK (public.has_role_or_above('qa_lead'));
CREATE POLICY "ap_reviews_update" ON action_plan_reviews FOR UPDATE USING (public.has_role_or_above('qa_lead')) WITH CHECK (public.has_role_or_above('qa_lead'));

-- ── COACHING_SESSIONS ──
CREATE POLICY "coaching_select" ON coaching_sessions FOR SELECT USING (
  coach_id = auth.uid()
  OR profile_id = auth.uid()
  OR coach_id IN (SELECT p.id FROM profiles p WHERE p.team_id IN (SELECT public.get_supervised_team_ids()))
  OR public.has_role_or_above('admin')
);
CREATE POLICY "coaching_insert" ON coaching_sessions FOR INSERT WITH CHECK (public.has_role_or_above('qa_lead'));
CREATE POLICY "coaching_update" ON coaching_sessions FOR UPDATE USING (coach_id = auth.uid() OR public.has_role_or_above('qa_supervisor')) WITH CHECK (coach_id = auth.uid() OR public.has_role_or_above('qa_supervisor'));

-- ── COACHING_EMAILS ──
CREATE POLICY "coaching_emails_select" ON coaching_emails FOR SELECT USING (session_id IN (SELECT id FROM coaching_sessions));
CREATE POLICY "coaching_emails_insert" ON coaching_emails FOR INSERT WITH CHECK (public.has_role_or_above('qa_lead'));

-- ── EMAIL_TEMPLATES ──
CREATE POLICY "email_templates_select" ON email_templates FOR SELECT USING (public.has_role_or_above('qa_lead'));
CREATE POLICY "email_templates_modify" ON email_templates FOR ALL USING (public.has_role_or_above('admin')) WITH CHECK (public.has_role_or_above('admin'));

-- ── HR_CASES (QAs cannot see) ──
CREATE POLICY "hr_cases_select" ON hr_cases FOR SELECT USING (
  (profile_id IN (SELECT p.id FROM profiles p WHERE p.team_id IN (SELECT public.get_supervised_team_ids())) AND public.has_role_or_above('qa_supervisor'))
  OR public.has_role_or_above('admin')
  OR opened_by = auth.uid()
);
CREATE POLICY "hr_cases_insert" ON hr_cases FOR INSERT WITH CHECK (public.has_role_or_above('qa_lead'));
CREATE POLICY "hr_cases_update" ON hr_cases FOR UPDATE USING (public.has_role_or_above('qa_supervisor')) WITH CHECK (public.has_role_or_above('qa_supervisor'));

-- ── HR_CASE_NOTES ──
CREATE POLICY "hr_notes_select" ON hr_case_notes FOR SELECT USING (
  case_id IN (SELECT id FROM hr_cases)
  AND (is_internal = false OR public.has_role_or_above('qa_supervisor'))
);
CREATE POLICY "hr_notes_insert" ON hr_case_notes FOR INSERT WITH CHECK (
  case_id IN (SELECT id FROM hr_cases) AND public.has_role_or_above('qa_lead')
);

-- ── ESCALATIONS (target person NEVER sees) ──
CREATE POLICY "escalations_select" ON escalations FOR SELECT USING (
  submitted_by = auth.uid()
  OR (public.has_role_or_above('qa_supervisor') AND against_id != auth.uid())
);
CREATE POLICY "escalations_insert" ON escalations FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "escalations_update" ON escalations FOR UPDATE USING (
  public.has_role_or_above('qa_supervisor') AND against_id != auth.uid()
) WITH CHECK (
  public.has_role_or_above('qa_supervisor') AND against_id != auth.uid()
);

-- ── APP_SETTINGS ──
CREATE POLICY "settings_select" ON app_settings FOR SELECT USING (true);
CREATE POLICY "settings_modify" ON app_settings FOR ALL USING (public.has_role_or_above('super_admin')) WITH CHECK (public.has_role_or_above('super_admin'));

-- ── AUDIT_LOG (immutable — no UPDATE/DELETE) ──
CREATE POLICY "audit_select" ON audit_log FOR SELECT USING (public.has_role_or_above('admin'));
CREATE POLICY "audit_insert" ON audit_log FOR INSERT WITH CHECK (true);


-- ────────────────────────────────────────────────────────────────────────────
-- DONE
-- ────────────────────────────────────────────────────────────────────────────
-- 18 tables, 16 enums, 30+ RLS policies, 8 helper functions,
-- 7 triggers, seed data for KPIs, DAM rules, email templates,
-- app settings, and role hierarchy.
-- ────────────────────────────────────────────────────────────────────────────
