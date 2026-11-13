-- Supabase SQL Editor에서 한 번만 실행하세요.
-- OAuth 토큰은 서버에서 AES-256-GCM으로 암호화한 값만 저장합니다.
create table if not exists public.social_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('instagram','threads')),
  account_id text not null,
  username text,
  access_token_encrypted text not null,
  token_expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  unique(user_id, platform)
);
alter table public.social_connections enable row level security;
-- 브라우저 클라이언트에는 토큰 테이블 권한을 주지 않습니다.
revoke all on public.social_connections from anon, authenticated;

create table if not exists public.content_publications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  platform text not null,
  status text not null check (status in ('published','failed')),
  remote_id text,
  permalink text,
  error_message text,
  published_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.content_publications enable row level security;
drop policy if exists "Users read own publication history" on public.content_publications;
create policy "Users read own publication history" on public.content_publications
for select to authenticated using (auth.uid() = user_id);
grant select on public.content_publications to authenticated;
