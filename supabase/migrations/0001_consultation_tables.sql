-- supabase/migrations/0001_consultation_tables.sql
create table if not exists public.consultation_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  email text not null,
  event_type text,
  date_place text,
  lineup text,
  materials text,
  notes text,
  attachments jsonb not null default '[]'::jsonb,
  stripe_session_id text,
  paid boolean not null default false,
  paid_at timestamptz,
  amount integer,
  product text,
  status text not null default 'new'
);

create table if not exists public.consultation_payments (
  stripe_session_id text primary key,
  email text,
  amount integer,
  product text,
  paid_at timestamptz not null default now()
);

alter table public.consultation_requests enable row level security;
alter table public.consultation_payments enable row level security;
-- Nessuna policy: tabelle accessibili solo via service role (Edge Functions).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('consultation-uploads', 'consultation-uploads', false, 10485760,
        array['image/png','image/jpeg','image/webp','image/heic','application/pdf'])
on conflict (id) do nothing;
