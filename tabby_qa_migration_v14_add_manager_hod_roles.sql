-- ── v14_add_manager_hod_roles ──────────────────────────────────────
-- Adds two new role labels for org-chart clarity:
--   manager — admin-tier (level 4 in role_level). Amanda Souza.
--   hod     — super-admin-tier (level 5). Imad Moussa, Head of QA.
-- They share numeric levels with admin/super_admin so every existing
-- has_role_or_above check that lets admin/super_admin through also
-- lets the new roles through, with no other RLS changes required.

-- Postgres enum changes can't share a transaction with consumers that
-- reference the new value, so this runs first as its own migration.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'manager';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'hod';
