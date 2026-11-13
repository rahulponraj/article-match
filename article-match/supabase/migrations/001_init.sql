create extension if not exists vector;

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  email text, role text not null default 'staff' check (role in ('admin','staff')),
  created_at timestamptz default now());
create function handle_new_user() returns trigger language plpgsql security definer as $$
begin insert into profiles(id,email) values (new.id,new.email); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();
create function is_admin() returns boolean language sql security definer stable as $$
  select exists(select 1 from profiles where id=auth.uid() and role='admin') $$;

create table products (
  id text primary key, article text not null, colour text, category text,
  category_slug text, photo_url text, indexed_photo_url text, indexed_at timestamptz,
  updated_at timestamptz default now());
create index on products(article, colour);
create index on products(category_slug);
create index on products(colour);

create table product_embeddings (
  id bigserial primary key,
  product_id text references products(id) on delete cascade,
  region int default 0,            -- one row per shoe found in the image
  embedding vector(1536) not null, -- DINOv2 CLS + mean patch, L2-normalised
  grid real[], hist real[]);       -- 2x2 pooled patch features + colour histogram (re-ranking)
create index on product_embeddings using hnsw (embedding vector_cosine_ops);
create index on product_embeddings(product_id);

create function match_embeddings(q vector(1536), k int, cat text default null, col text default null)
returns table(product_id text, region int, sim float, grid real[], hist real[])
language sql stable as $$
  select pe.product_id, pe.region, 1 - (pe.embedding <=> q) as sim, pe.grid, pe.hist
  from product_embeddings pe join products p on p.id = pe.product_id
  where (cat is null or p.category_slug = cat) and (col is null or p.colour = col)
  order by pe.embedding <=> q limit k $$;

create table match_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users, created_at timestamptz default now(),
  image_path text, category text, colour text,
  band text, top_score float, duration_ms int, widened boolean default false,
  results jsonb);
create table feedback (
  id uuid primary key default gen_random_uuid(),
  history_id uuid references match_history on delete cascade,
  product_id text, correct boolean not null, user_id uuid references auth.users,
  created_at timestamptz default now());
create table sync_jobs (
  id bigserial primary key, status text, started_at timestamptz default now(),
  finished_at timestamptz, total int default 0, done int default 0, failed int default 0, log text default '');

alter table profiles enable row level security;
alter table products enable row level security;
alter table product_embeddings enable row level security;
alter table match_history enable row level security;
alter table feedback enable row level security;
alter table sync_jobs enable row level security;
create policy "own profile" on profiles for select using (id = auth.uid() or is_admin());
create policy "admin manages profiles" on profiles for update using (is_admin());
create policy "staff read products" on products for select to authenticated using (true);
create policy "own history" on match_history for select using (user_id = auth.uid() or is_admin());
create policy "insert history" on match_history for insert with check (user_id = auth.uid());
create policy "own feedback" on feedback for select using (user_id = auth.uid() or is_admin());
create policy "insert feedback" on feedback for insert with check (user_id = auth.uid());
create policy "admin sync jobs" on sync_jobs for select using (is_admin());

-- private bucket for uploaded query images, one folder per user
insert into storage.buckets (id, name, public) values ('uploads','uploads',false) on conflict do nothing;
create policy "upload own" on storage.objects for insert to authenticated
  with check (bucket_id='uploads' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "read own or admin" on storage.objects for select to authenticated
  using (bucket_id='uploads' and ((storage.foldername(name))[1]=auth.uid()::text or is_admin()));
-- After your first sign-up, promote yourself:
--   update profiles set role='admin' where email='you@company.com';
