-- Supabase SQL Editor에서 전체 실행하세요.
create table if not exists public.content_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  status text not null default 'draft' check (status in ('draft','approved')),
  project jsonb not null default '{}'::jsonb,
  content jsonb not null default '{}'::jsonb,
  image_urls text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.content_items enable row level security;
drop policy if exists "Users manage own content" on public.content_items;
create policy "Users manage own content" on public.content_items
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-photos', 'site-photos', true, 12582912, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "Authenticated upload own site photos" on storage.objects;
create policy "Authenticated upload own site photos" on storage.objects
for insert to authenticated with check (bucket_id = 'site-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Authenticated read own site photos" on storage.objects;
create policy "Authenticated read own site photos" on storage.objects
for select to authenticated using (bucket_id = 'site-photos' and (storage.foldername(name))[1] = auth.uid()::text);