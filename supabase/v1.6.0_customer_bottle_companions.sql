alter table public.customers
add column if not exists bottle_number text;

alter table public.customers
add column if not exists bottle_name text;

alter table public.visit_histories
add column if not exists companions jsonb not null default '[]'::jsonb;

update public.visit_histories
set companions = '[]'::jsonb
where companions is null;
