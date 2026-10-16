-- Read-only role for AI-generated SQL.
--
-- The database enforces the guardrails itself, so a bug or a prompt
-- injection in the app layer still cannot write data or run away:
--   * every transaction is read-only
--   * every statement is killed after 5 seconds
--   * it can SELECT the demo tables and nothing else
-- The 500-row cap is applied by foundation/db/readonly.ts, because Postgres
-- has no per-role row limit.
--
-- Roles are cluster-wide, so creation is idempotent. The password is set by
-- the reset script from READONLY_DATABASE_URL, never stored in git.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'ecosystem_readonly') then
    create role ecosystem_readonly login noinherit;
  end if;
end
$$;

alter role ecosystem_readonly set default_transaction_read_only = on;
alter role ecosystem_readonly set statement_timeout = '5s';
alter role ecosystem_readonly set idle_in_transaction_session_timeout = '10s';
alter role ecosystem_readonly set search_path = ecosystem, extensions;
alter role ecosystem_readonly connection limit 10;

-- Start from nothing, then grant only what generated SQL needs.
revoke all on schema public from ecosystem_readonly;
revoke all on schema eval from ecosystem_readonly;
revoke all on all tables in schema eval from ecosystem_readonly;

grant usage on schema ecosystem to ecosystem_readonly;
grant usage on schema extensions to ecosystem_readonly;  -- vector operators for Build 4, the Answer Engine
grant select on all tables in schema ecosystem to ecosystem_readonly;

-- Agent run logs hold model inputs and reviewer names. Not for querying.
revoke all on ecosystem.agent_runs from ecosystem_readonly;
