-- Editable runtime settings (AI service address and key). RLS is on with NO policies,
-- so the browser can never read this table; only the server (service role) can.
create table if not exists public.app_settings (
  key text primary key,
  value text not null default '',
  updated_at timestamptz default now(),
  updated_by text
);
alter table public.app_settings enable row level security;
