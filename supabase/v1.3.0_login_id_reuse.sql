-- Night CRM v1.3.0
-- 非表示キャストのログインIDを、新規キャストで再利用できるようにする

alter table public.profiles
drop constraint if exists profiles_login_id_key;

drop index if exists public.profiles_login_id_key;

create unique index if not exists profiles_active_login_id_unique
on public.profiles (login_id)
where is_active = true;
