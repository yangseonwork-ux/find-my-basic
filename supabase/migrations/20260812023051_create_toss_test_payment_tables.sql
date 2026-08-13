create table public.payment_orders (
  id bigint generated always as identity primary key,
  order_id text not null unique,
  user_id uuid references auth.users(id) on delete set null,
  customer_type text not null,
  checkout_token_hash text not null unique,
  status text not null default 'pending_payment',
  subtotal bigint not null,
  shipping_fee bigint not null,
  payment_amount bigint not null,
  currency text not null default 'KRW',
  order_name text not null,
  recipient_name text not null,
  recipient_phone text not null,
  recipient_email text not null,
  postcode text not null,
  address text not null,
  detail_address text not null default '',
  delivery_request text not null default '',
  confirm_idempotency_key uuid not null unique,
  payment_key text unique,
  payment_method text,
  confirming_at timestamptz,
  approved_at timestamptz,
  failure_code text,
  failure_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_orders_order_id_format check (order_id ~ '^[A-Za-z0-9_-]{6,64}$'),
  constraint payment_orders_customer_type_check check (customer_type in ('member', 'guest')),
  constraint payment_orders_member_owner_check check (
    (customer_type = 'member' and user_id is not null)
    or (customer_type = 'guest' and user_id is null)
  ),
  constraint payment_orders_status_check check (
    status in ('pending_payment', 'confirming', 'confirmation_unknown', 'paid', 'failed', 'canceled')
  ),
  constraint payment_orders_amounts_check check (
    subtotal > 0
    and shipping_fee >= 0
    and payment_amount = subtotal + shipping_fee
    and payment_amount >= 100
  ),
  constraint payment_orders_currency_check check (currency = 'KRW'),
  constraint payment_orders_order_name_check check (char_length(order_name) between 1 and 100),
  constraint payment_orders_postcode_check check (postcode ~ '^[0-9]{5}$')
);

create index payment_orders_user_id_idx on public.payment_orders (user_id) where user_id is not null;
create index payment_orders_status_created_at_idx on public.payment_orders (status, created_at);

create table public.payment_order_items (
  id bigint generated always as identity primary key,
  order_pk bigint not null references public.payment_orders(id) on delete cascade,
  product_id text not null,
  product_name text not null,
  brand text not null,
  unit_price bigint not null,
  quantity smallint not null,
  created_at timestamptz not null default now(),
  constraint payment_order_items_order_product_unique unique (order_pk, product_id),
  constraint payment_order_items_unit_price_check check (unit_price > 0),
  constraint payment_order_items_quantity_check check (quantity between 1 and 10)
);

create table public.payment_attempts (
  id bigint generated always as identity primary key,
  order_pk bigint not null unique references public.payment_orders(id) on delete cascade,
  payment_key text unique,
  idempotency_key uuid not null unique,
  status text not null,
  toss_response jsonb,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_attempts_status_check check (status in ('confirming', 'confirmation_unknown', 'paid', 'failed'))
);

alter table public.payment_orders enable row level security;
alter table public.payment_order_items enable row level security;
alter table public.payment_attempts enable row level security;

revoke all on table public.payment_orders from public, anon, authenticated;
revoke all on table public.payment_order_items from public, anon, authenticated;
revoke all on table public.payment_attempts from public, anon, authenticated;

grant select, insert, update on table public.payment_orders to service_role;
grant select, insert, update on table public.payment_order_items to service_role;
grant select, insert, update on table public.payment_attempts to service_role;
grant usage, select on sequence public.payment_orders_id_seq to service_role;
grant usage, select on sequence public.payment_order_items_id_seq to service_role;
grant usage, select on sequence public.payment_attempts_id_seq to service_role;

create or replace function public.create_payment_order(
  p_order_id text,
  p_user_id uuid,
  p_customer_type text,
  p_checkout_token_hash text,
  p_subtotal bigint,
  p_shipping_fee bigint,
  p_payment_amount bigint,
  p_order_name text,
  p_recipient_name text,
  p_recipient_phone text,
  p_recipient_email text,
  p_postcode text,
  p_address text,
  p_detail_address text,
  p_delivery_request text,
  p_confirm_idempotency_key uuid,
  p_items jsonb
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_order_pk bigint;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'payment order items are required';
  end if;

  insert into public.payment_orders (
    order_id,
    user_id,
    customer_type,
    checkout_token_hash,
    subtotal,
    shipping_fee,
    payment_amount,
    order_name,
    recipient_name,
    recipient_phone,
    recipient_email,
    postcode,
    address,
    detail_address,
    delivery_request,
    confirm_idempotency_key
  )
  values (
    p_order_id,
    p_user_id,
    p_customer_type,
    p_checkout_token_hash,
    p_subtotal,
    p_shipping_fee,
    p_payment_amount,
    p_order_name,
    p_recipient_name,
    p_recipient_phone,
    p_recipient_email,
    p_postcode,
    p_address,
    coalesce(p_detail_address, ''),
    coalesce(p_delivery_request, ''),
    p_confirm_idempotency_key
  )
  returning id into new_order_pk;

  insert into public.payment_order_items (
    order_pk,
    product_id,
    product_name,
    brand,
    unit_price,
    quantity
  )
  select
    new_order_pk,
    item.product_id,
    item.product_name,
    item.brand,
    item.unit_price,
    item.quantity
  from jsonb_to_recordset(p_items) as item(
    product_id text,
    product_name text,
    brand text,
    unit_price bigint,
    quantity smallint
  );

  return new_order_pk;
end;
$$;

revoke all on function public.create_payment_order(
  text, uuid, text, text, bigint, bigint, bigint, text, text, text, text, text,
  text, text, text, uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.create_payment_order(
  text, uuid, text, text, bigint, bigint, bigint, text, text, text, text, text,
  text, text, text, uuid, jsonb
) to service_role;

create or replace function public.claim_payment_confirmation(
  p_order_id text,
  p_checkout_token_hash text,
  p_user_id uuid,
  p_payment_amount bigint
)
returns table (
  order_pk bigint,
  order_id text,
  payment_amount bigint,
  currency text,
  confirm_idempotency_key uuid,
  current_status text,
  claimed boolean,
  customer_type text,
  payment_key text,
  payment_method text,
  approved_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.payment_orders%rowtype;
begin
  select *
  into target
  from public.payment_orders as payment_order
  where payment_order.order_id = p_order_id
    and payment_order.payment_amount = p_payment_amount
    and (
      (
        payment_order.customer_type = 'guest'
        and payment_order.user_id is null
        and payment_order.checkout_token_hash = p_checkout_token_hash
      )
      or (
        payment_order.customer_type = 'member'
        and payment_order.user_id = p_user_id
        and (p_checkout_token_hash is null or payment_order.checkout_token_hash = p_checkout_token_hash)
      )
    )
  for update;

  if not found then
    return;
  end if;

  if target.status in ('pending_payment', 'confirmation_unknown')
    or (
      target.status = 'confirming'
      and target.confirming_at < now() - interval '45 seconds'
    )
  then
    update public.payment_orders
    set
      status = 'confirming',
      confirming_at = now(),
      failure_code = null,
      failure_message = null,
      updated_at = now()
    where id = target.id
    returning * into target;

    insert into public.payment_attempts (order_pk, idempotency_key, status)
    values (target.id, target.confirm_idempotency_key, 'confirming')
    on conflict (order_pk) do update
      set status = 'confirming', updated_at = now();

    return query
    select
      target.id,
      target.order_id,
      target.payment_amount,
      target.currency,
      target.confirm_idempotency_key,
      target.status,
      true,
      target.customer_type,
      target.payment_key,
      target.payment_method,
      target.approved_at;
    return;
  end if;

  return query
  select
    target.id,
    target.order_id,
    target.payment_amount,
    target.currency,
    target.confirm_idempotency_key,
    target.status,
    false,
    target.customer_type,
    target.payment_key,
    target.payment_method,
    target.approved_at;
end;
$$;

revoke all on function public.claim_payment_confirmation(text, text, uuid, bigint) from public, anon, authenticated;
grant execute on function public.claim_payment_confirmation(text, text, uuid, bigint) to service_role;

create or replace function public.complete_payment_confirmation(
  p_order_pk bigint,
  p_payment_key text,
  p_payment_method text,
  p_approved_at timestamptz,
  p_toss_response jsonb
)
returns table (
  order_id text,
  customer_type text,
  status text,
  payment_amount bigint,
  payment_method text,
  approved_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.payment_attempts as attempt (
    order_pk,
    payment_key,
    idempotency_key,
    status,
    toss_response,
    error_code,
    error_message
  )
  select
    payment_order.id,
    p_payment_key,
    payment_order.confirm_idempotency_key,
    'paid',
    p_toss_response,
    null,
    null
  from public.payment_orders as payment_order
  where payment_order.id = p_order_pk
  on conflict (order_pk) do update
    set
      payment_key = excluded.payment_key,
      status = 'paid',
      toss_response = excluded.toss_response,
      error_code = null,
      error_message = null,
      updated_at = now();

  return query
  update public.payment_orders as payment_order
  set
    status = 'paid',
    payment_key = p_payment_key,
    payment_method = p_payment_method,
    approved_at = p_approved_at,
    failure_code = null,
    failure_message = null,
    updated_at = now()
  where payment_order.id = p_order_pk
    and payment_order.status in ('confirming', 'confirmation_unknown', 'paid')
  returning
    payment_order.order_id,
    payment_order.customer_type,
    payment_order.status,
    payment_order.payment_amount,
    payment_order.payment_method,
    payment_order.approved_at;
end;
$$;

revoke all on function public.complete_payment_confirmation(bigint, text, text, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.complete_payment_confirmation(bigint, text, text, timestamptz, jsonb)
  to service_role;

create or replace function public.record_payment_confirmation_error(
  p_order_pk bigint,
  p_status text,
  p_payment_key text,
  p_error_code text,
  p_error_message text,
  p_toss_response jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_status not in ('confirmation_unknown', 'failed') then
    raise exception 'invalid payment confirmation error status';
  end if;

  insert into public.payment_attempts as attempt (
    order_pk,
    payment_key,
    idempotency_key,
    status,
    toss_response,
    error_code,
    error_message
  )
  select
    payment_order.id,
    p_payment_key,
    payment_order.confirm_idempotency_key,
    p_status,
    p_toss_response,
    p_error_code,
    p_error_message
  from public.payment_orders as payment_order
  where payment_order.id = p_order_pk
  on conflict (order_pk) do update
    set
      payment_key = coalesce(excluded.payment_key, attempt.payment_key),
      status = excluded.status,
      toss_response = excluded.toss_response,
      error_code = excluded.error_code,
      error_message = excluded.error_message,
      updated_at = now();

  update public.payment_orders
  set
    status = p_status,
    payment_key = coalesce(p_payment_key, payment_key),
    failure_code = p_error_code,
    failure_message = p_error_message,
    updated_at = now()
  where id = p_order_pk and status <> 'paid';
end;
$$;

revoke all on function public.record_payment_confirmation_error(bigint, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_payment_confirmation_error(bigint, text, text, text, text, jsonb)
  to service_role;
