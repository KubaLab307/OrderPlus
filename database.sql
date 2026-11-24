
-- ==========================================
-- JK RESTAURANT
-- SUPABASE DATABASE
-- ==========================================

-- 1. MENU ITEMS

create table if not exists public.menu_items (
    id bigint generated always as identity primary key,
    name text not null,
    description text default '',
    price numeric(10,2) not null check (price >= 0),
    category text not null,
    is_available boolean not null default true,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);


-- 2. ORDERS

create table if not exists public.orders (
    id bigint generated always as identity primary key,
    customer_name text not null,
    items jsonb not null,
    total numeric(10,2) not null check (total >= 0),
    status text not null default 'new'
        check (status in (
            'new',
            'preparing',
            'ready',
            'completed'
        )),
    created_at timestamptz default now()
);


-- 3. RESTAURANT SETTINGS

create table if not exists public.restaurant_settings (
    id integer primary key check (id = 1),
    restaurant_name text not null default 'JK Restaurant',
    is_open boolean not null default true,
    waiting_time integer not null default 20
        check (waiting_time >= 0),
    updated_at timestamptz default now()
);


-- 4. DEFAULT RESTAURANT SETTINGS

insert into public.restaurant_settings (
    id,
    restaurant_name,
    is_open,
    waiting_time
)
values (
    1,
    'JK Restaurant',
    true,
    20
)
on conflict (id) do nothing;


-- 5. ENABLE ROW LEVEL SECURITY

alter table public.menu_items
enable row level security;

alter table public.orders
enable row level security;

alter table public.restaurant_settings
enable row level security;


-- 6. ADMIN CHECK

-- Only authenticated accounts with the admin role
-- in their app_metadata count as administrators.

create or replace function public.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
    select coalesce(
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
        false
    );
$$;


-- 7. MENU POLICIES

drop policy if exists "Public can view available menu"
on public.menu_items;

create policy "Public can view available menu"
on public.menu_items
for select
to anon, authenticated
using (
    is_available = true
    or (select public.is_admin())
);


drop policy if exists "Admins can manage menu"
on public.menu_items;

create policy "Admins can manage menu"
on public.menu_items
for all
to authenticated
using (
    (select public.is_admin())
)
with check (
    (select public.is_admin())
);


-- 8. ORDER POLICIES

drop policy if exists "Admins can view orders"
on public.orders;

create policy "Admins can view orders"
on public.orders
for select
to authenticated
using (
    (select public.is_admin())
);


drop policy if exists "Admins can update orders"
on public.orders;

create policy "Admins can update orders"
on public.orders
for update
to authenticated
using (
    (select public.is_admin())
)
with check (
    (select public.is_admin())
);


-- 9. RESTAURANT SETTINGS POLICIES

drop policy if exists "Public can view restaurant settings"
on public.restaurant_settings;

create policy "Public can view restaurant settings"
on public.restaurant_settings
for select
to anon, authenticated
using (true);


drop policy if exists "Admins can manage restaurant settings"
on public.restaurant_settings;

create policy "Admins can manage restaurant settings"
on public.restaurant_settings
for all
to authenticated
using (
    (select public.is_admin())
)
with check (
    (select public.is_admin())
);


-- 10. SECURE TABLE PERMISSIONS

revoke all on public.menu_items from anon;
revoke all on public.menu_items from authenticated;

grant select on public.menu_items to anon, authenticated;
grant insert, update, delete on public.menu_items
to authenticated;

revoke all on public.orders from anon;
revoke all on public.orders from authenticated;

grant select, update on public.orders
to authenticated;

revoke all on public.restaurant_settings from anon;
revoke all on public.restaurant_settings from authenticated;

grant select on public.restaurant_settings
to anon, authenticated;

grant update on public.restaurant_settings
to authenticated;


-- 11. SAFE CUSTOMER ORDER SUBMISSION
-- Customers send item IDs and quantities.
-- The database calculates the actual prices.
-- Customers cannot choose their own order total.

create or replace function public.create_order(
    p_customer_name text,
    p_items jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    item_record jsonb;
    menu_record record;

    saved_items jsonb := '[]'::jsonb;
    calculated_total numeric(10,2) := 0;

    item_id bigint;
    item_quantity integer;
    new_order_id bigint;

    restaurant_open boolean;
begin

    if p_customer_name is null
       or length(trim(p_customer_name)) = 0
       or length(trim(p_customer_name)) > 50 then
        raise exception 'Invalid customer name';
    end if;

    if jsonb_typeof(p_items) <> 'array'
       or jsonb_array_length(p_items) = 0
       or jsonb_array_length(p_items) > 30 then
        raise exception 'Invalid order items';
    end if;

    select is_open
    into restaurant_open
    from public.restaurant_settings
    where id = 1;

    if restaurant_open is distinct from true then
        raise exception 'Restaurant is closed';
    end if;

    for item_record in
        select value from jsonb_array_elements(p_items)
    loop

        if item_record->>'id' !~ '^[0-9]+$'
           or item_record->>'quantity' !~ '^[0-9]+$' then
            raise exception 'Invalid item information';
        end if;

        item_id := (item_record->>'id')::bigint;
        item_quantity := (item_record->>'quantity')::integer;

        if item_quantity < 1 or item_quantity > 20 then
            raise exception 'Invalid item quantity';
        end if;

        select id, name, price
        into menu_record
        from public.menu_items
        where id = item_id
          and is_available = true;

        if not found then
            raise exception 'Menu item unavailable';
        end if;

        calculated_total :=
            calculated_total +
            (menu_record.price * item_quantity);

        saved_items := saved_items || jsonb_build_array(
            jsonb_build_object(
                'id', menu_record.id,
                'name', menu_record.name,
                'price', menu_record.price,
                'quantity', item_quantity
            )
        );

    end loop;

    insert into public.orders (
        customer_name,
        items,
        total,
        status
    )
    values (
        trim(p_customer_name),
        saved_items,
        calculated_total,
        'new'
    )
    returning id into new_order_id;

    return new_order_id;

end;
$$;


-- 12. ORDER FUNCTION PERMISSIONS

revoke all on function public.create_order(text, jsonb)
from public, authenticated;

grant execute on function public.create_order(text, jsonb)
to anon, authenticated;


-- ==========================================
-- DATABASE SETUP COMPLETE
-- ==========================================
