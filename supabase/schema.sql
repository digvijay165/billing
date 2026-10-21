-- ForgeFlow cloud database.
-- Run this once in Supabase: Dashboard → SQL Editor → New query → paste everything → Run.
-- Safe to run again; it only creates what is missing.

-- A shop (your business). One owner, any number of staff.
create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.members (
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  role text not null check (role in ('owner', 'staff')),
  created_at timestamptz not null default now(),
  primary key (shop_id, user_id)
);

-- The owner invites staff by email; the invite is claimed when that person signs in.
create table if not exists public.invites (
  shop_id uuid not null references public.shops(id) on delete cascade,
  email text not null,
  role text not null default 'staff' check (role in ('staff')),
  created_at timestamptz not null default now(),
  primary key (shop_id, email)
);

-- Every record (bill, purchase, expense, stock item, saved item, settings) is one row.
-- Rows are never hard-deleted by the app; "deleted" marks them so other devices hear about it.
create table if not exists public.docs (
  shop_id uuid not null references public.shops(id) on delete cascade,
  id text not null,
  collection text not null check (collection in ('settings', 'catalog', 'invoices', 'stock', 'purchases', 'expenses')),
  data jsonb not null default '{}'::jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (shop_id, id)
);
create index if not exists docs_shop_updated on public.docs (shop_id, updated_at);

-- The server sets the time, so devices with wrong clocks still sync in the right order.
create or replace function public.docs_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists docs_touch on public.docs;
create trigger docs_touch before insert or update on public.docs
  for each row execute function public.docs_touch();

-- Role of the signed-in user in a shop ('owner', 'staff' or null).
create or replace function public.my_role(p_shop uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from public.members where shop_id = p_shop and user_id = auth.uid()
$$;

-- First sign-in of an owner: create the shop and make them its owner.
create or replace function public.create_shop(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_shop uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select shop_id into v_shop from public.members where user_id = auth.uid() limit 1;
  if v_shop is not null then return v_shop; end if;
  insert into public.shops (name) values (coalesce(nullif(trim(p_name), ''), 'My workshop')) returning id into v_shop;
  insert into public.members (shop_id, user_id, email, role)
    values (v_shop, auth.uid(), auth.jwt() ->> 'email', 'owner');
  return v_shop;
end $$;

-- Staff sign-in: if the owner invited this email, join that shop.
create or replace function public.accept_invite() returns uuid
language plpgsql security definer set search_path = public as $$
declare v_inv public.invites;
begin
  if auth.uid() is null then return null; end if;
  select * into v_inv from public.invites
    where lower(email) = lower(auth.jwt() ->> 'email') order by created_at limit 1;
  if v_inv.shop_id is null then return null; end if;
  if not exists (select 1 from public.members where user_id = auth.uid()) then
    insert into public.members (shop_id, user_id, email, role)
      values (v_inv.shop_id, auth.uid(), auth.jwt() ->> 'email', v_inv.role);
  end if;
  delete from public.invites where shop_id = v_inv.shop_id and lower(email) = lower(v_inv.email);
  return v_inv.shop_id;
end $$;

alter table public.shops enable row level security;
alter table public.members enable row level security;
alter table public.invites enable row level security;
alter table public.docs enable row level security;

drop policy if exists shops_read on public.shops;
create policy shops_read on public.shops for select using (public.my_role(id) is not null);
drop policy if exists shops_update on public.shops;
create policy shops_update on public.shops for update using (public.my_role(id) = 'owner');

drop policy if exists members_read on public.members;
create policy members_read on public.members for select using (public.my_role(shop_id) is not null);
-- The owner can remove staff, but not themselves.
drop policy if exists members_delete on public.members;
create policy members_delete on public.members for delete
  using (public.my_role(shop_id) = 'owner' and user_id <> auth.uid());

drop policy if exists invites_owner on public.invites;
create policy invites_owner on public.invites for all
  using (public.my_role(shop_id) = 'owner') with check (public.my_role(shop_id) = 'owner');

-- Everyone in the shop can read. Owners can change anything.
-- Staff can add and edit bills, purchases, stock and saved items, but not delete them,
-- and cannot touch settings or expenses.
drop policy if exists docs_read on public.docs;
create policy docs_read on public.docs for select using (public.my_role(shop_id) is not null);
drop policy if exists docs_insert on public.docs;
create policy docs_insert on public.docs for insert with check (
  public.my_role(shop_id) = 'owner'
  or (public.my_role(shop_id) = 'staff' and collection in ('catalog', 'invoices', 'stock', 'purchases') and not deleted)
);
drop policy if exists docs_update on public.docs;
create policy docs_update on public.docs for update
  using (public.my_role(shop_id) is not null)
  with check (
    public.my_role(shop_id) = 'owner'
    or (public.my_role(shop_id) = 'staff' and collection in ('catalog', 'invoices', 'stock', 'purchases') and not deleted)
  );

-- Each shop's uploaded MRP price lists (a shop can keep several, e.g. one per company).
-- Private to that shop: other shops can never read them.
-- A list is large (60,000+ parts), so it is stored in chunks. A new upload writes its chunks
-- under a new version, then points price_lists at it, so devices never read a half-written list.
create table if not exists public.price_lists (
  shop_id uuid not null references public.shops(id) on delete cascade,
  list_id text not null default 'main',
  version text not null,
  name text not null,
  parts integer not null,
  chunks integer not null,
  updated_at timestamptz not null default now(),
  primary key (shop_id, list_id)
);
create table if not exists public.price_list_chunks (
  shop_id uuid not null references public.shops(id) on delete cascade,
  list_id text not null default 'main',
  version text not null,
  n integer not null,
  rows jsonb not null,
  primary key (shop_id, version, n)
);
-- Projects made before shops could have several lists: add list_id and key lists by (shop_id, list_id).
alter table public.price_lists add column if not exists list_id text not null default 'main';
alter table public.price_list_chunks add column if not exists list_id text not null default 'main';
do $$ begin
  if (select array_length(conkey, 1) from pg_constraint where conname = 'price_lists_pkey') = 1 then
    alter table public.price_lists drop constraint price_lists_pkey;
    alter table public.price_lists add primary key (shop_id, list_id);
  end if;
end $$;

alter table public.price_lists enable row level security;
alter table public.price_list_chunks enable row level security;

-- Everyone in the shop can read its lists. Only the owner can upload, rename or remove them.
drop policy if exists price_lists_read on public.price_lists;
create policy price_lists_read on public.price_lists for select using (public.my_role(shop_id) is not null);
drop policy if exists price_lists_owner on public.price_lists;
create policy price_lists_owner on public.price_lists for all
  using (public.my_role(shop_id) = 'owner') with check (public.my_role(shop_id) = 'owner');
drop policy if exists price_list_chunks_read on public.price_list_chunks;
create policy price_list_chunks_read on public.price_list_chunks for select using (public.my_role(shop_id) is not null);
drop policy if exists price_list_chunks_owner on public.price_list_chunks;
create policy price_list_chunks_owner on public.price_list_chunks for all
  using (public.my_role(shop_id) = 'owner') with check (public.my_role(shop_id) = 'owner');

-- Live updates between devices.
do $$ begin
  alter publication supabase_realtime add table public.docs;
exception when duplicate_object then null; end $$;
