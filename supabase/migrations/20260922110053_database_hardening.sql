-- Database hardening.
--
-- Everything the apps read and write goes through the API, which connects as the database owner. Nothing uses
-- the Data API (PostgREST) directly: no app calls supabase.from(). Every table already has row level security
-- on and no grants to anon or authenticated, so today nothing is reachable that way. These changes make that
-- hold even if somebody later adds a table in the dashboard and forgets, and close two smaller gaps.

-- 1. No grants to the Data API's roles, now or on tables created later. What keeps data unreachable is the
--    absence of table grants (plus RLS); the schema USAGE revoke below is a no-op in practice, because USAGE
--    also comes through the built-in PUBLIC role, which Supabase's own sign-up path relies on and which is
--    left alone. The default privileges are the part that matters for tables added later.
revoke usage on schema public from anon, authenticated;
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;

-- 2. pg_net makes HTTP requests from inside the database. These revokes remove any direct grant to anon and
--    authenticated. Execute also reaches them through PUBLIC, granted by the platform's superuser: postgres
--    cannot revoke that, and the daily job depends on it. It stays unreachable because the net schema is not
--    exposed by the Data API and nothing lets an outside caller run SQL.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'net') then
    execute 'revoke usage on schema net from anon, authenticated';
    execute 'revoke all on all functions in schema net from anon, authenticated';
  end if;
end;
$$;

-- 3. The staff audit log is append-only. It is the record of who opened whose account, changed a flag or
--    approved a tax rule, so it must not be quietly edited or trimmed, including by a bug in the API. The one
--    change allowed is the one Postgres makes itself when a staff member is removed: forgetting their id.
create or replace function public.admin_audit_is_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Nested rather than one condition: for TRUNCATE there is no row, and NEW must not be read.
  if tg_op = 'UPDATE' then
    if new.admin_id is null and (to_jsonb(new) - 'admin_id') = (to_jsonb(old) - 'admin_id') then
      return new;
    end if;
  end if;
  raise exception 'admin_audit is append-only: % is not allowed', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

revoke all on function public.admin_audit_is_append_only() from public, anon, authenticated;

drop trigger if exists admin_audit_append_only on public.admin_audit;
create trigger admin_audit_append_only
  before update or delete on public.admin_audit
  for each row execute function public.admin_audit_is_append_only();

drop trigger if exists admin_audit_no_truncate on public.admin_audit;
create trigger admin_audit_no_truncate
  before truncate on public.admin_audit
  for each statement execute function public.admin_audit_is_append_only();
