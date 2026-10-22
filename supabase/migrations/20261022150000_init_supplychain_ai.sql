-- Applied to Supabase project "supplychain-ai" (idmvewikcsvrelguukhq) on 2026-10-22.
-- Helper functions live in a schema the Data API does not expose.
create schema if not exists private;
grant usage on schema private to authenticated;

-- Role comes from app_metadata (settable only with the secret key), never user_metadata.
create or replace function private.app_role()
returns text language sql stable security invoker set search_path = ''
as $$ select coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', ''); $$;

-- Mirror of ACTION_SCOPE in the API (src/auth.ts). Keep the two in sync.
create or replace function private.can_act(category text)
returns boolean language sql stable security invoker set search_path = ''
as $$
  select case private.app_role()
    when 'admin'       then true
    when 'scm'         then true
    when 'inventory'   then category in ('partial', 'backordered')
    when 'procurement' then category in ('backordered')
    when 'logistics'   then category in ('delayed', 'slaRisk')
    when 'oms'         then category in ('partial', 'slaRisk', 'addressPayment')
    when 'finance'     then category in ('addressPayment')
    else false
  end;
$$;

revoke all on function private.app_role() from public;
revoke all on function private.can_act(text) from public;
grant execute on function private.app_role() to authenticated;
grant execute on function private.can_act(text) to authenticated;

create table public.exception_actions (
  order_id    text primary key,
  category    text not null check (category in ('delayed', 'partial', 'slaRisk', 'backordered', 'addressPayment')),
  action      text not null check (action in ('approved', 'assigned')),
  acted_by    uuid default auth.uid() references auth.users (id) on delete set null,
  acted_email text,
  created_at  timestamptz not null default now()
);
alter table public.exception_actions enable row level security;

create policy "Users with a role can read decisions" on public.exception_actions
  for select to authenticated using ((select private.app_role()) <> '');
create policy "Roles can record decisions in their scope" on public.exception_actions
  for insert to authenticated with check ((select private.can_act(category)) and acted_by = (select auth.uid()));
create policy "Roles can change decisions in their scope" on public.exception_actions
  for update to authenticated using ((select private.can_act(category)))
  with check ((select private.can_act(category)) and acted_by = (select auth.uid()));
create policy "Admins can reset decisions" on public.exception_actions
  for delete to authenticated using ((select private.app_role()) = 'admin');

create table public.chat_messages (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sender     text not null check (sender in ('user', 'agent')),
  blocks     jsonb not null,
  source     text,
  created_at timestamptz not null default now()
);
create index chat_messages_user_id_idx on public.chat_messages (user_id, id);
alter table public.chat_messages enable row level security;

create policy "Users read their own chat" on public.chat_messages
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Users with a role add to their own chat" on public.chat_messages
  for insert to authenticated with check (user_id = (select auth.uid()) and (select private.app_role()) <> '');
create policy "Users clear their own chat" on public.chat_messages
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.exception_actions, public.chat_messages from anon;
grant select, insert, update, delete on public.exception_actions to authenticated;
grant select, insert, delete on public.chat_messages to authenticated;

-- Added after the performance advisor run
create index if not exists exception_actions_acted_by_idx on public.exception_actions (acted_by);
