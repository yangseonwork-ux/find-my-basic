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
    on conflict on constraint payment_attempts_order_pk_key do update
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

revoke all on function public.claim_payment_confirmation(text, text, uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.claim_payment_confirmation(text, text, uuid, bigint)
  to service_role;
