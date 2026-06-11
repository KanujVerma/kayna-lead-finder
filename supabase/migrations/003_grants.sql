-- Phase 6A prerequisite: grant service_role full access to all existing tables.
-- Root cause: migrations 001 and 002 created tables without any GRANT statements.
-- Supabase PostgREST requires explicit table-level privileges even for service_role
-- (service_role bypasses RLS but still needs object-level GRANTs from the DB owner).
--
-- Confirmed via: HTTP 403 code=42501 with Supabase hint
--   "Grant the required privileges to the current role with:
--    GRANT SELECT ON public.<table> TO service_role;"
--
-- Run with: supabase db push  OR  paste into Supabase SQL editor.
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. All existing tables: full access for service_role
-- ---------------------------------------------------------------------------
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Sequences (uuid_generate_v4 etc.) — needed for INSERT operations
-- ---------------------------------------------------------------------------
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Functions (includes update_updated_at_column trigger helper)
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Default privileges — ensures future tables also get service_role access
--    so migrations 004+ do not need explicit GRANT statements.
-- ---------------------------------------------------------------------------
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL PRIVILEGES ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL PRIVILEGES ON SEQUENCES TO service_role;
