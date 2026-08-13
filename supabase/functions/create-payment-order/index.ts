import {
  calculateOrder,
  createCheckoutToken,
  createOrderId,
  sha256,
  validateRecipient,
} from "../_shared/order.mjs";
import {
  ApiError,
  corsForRequest,
  createAdminClient,
  errorResponse,
  getOptionalUserId,
  jsonResponse,
  parseRequestBody,
  requirePublishableKey,
} from "../_shared/server.ts";

Deno.serve(async (request) => {
  let corsHeaders: Record<string, string> = {};

  try {
    corsHeaders = corsForRequest(request);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
    if (request.method !== "POST") throw new ApiError(405, "METHOD_NOT_ALLOWED", "POST 요청만 지원합니다.");

    requirePublishableKey(request);
    const body = await parseRequestBody(request);
    const customerType = body?.customerType;
    const recipient = validateRecipient(body?.recipient);
    const order = calculateOrder(body?.items, customerType);
    const admin = createAdminClient();
    const userId = await getOptionalUserId(request, admin);

    if (customerType === "member" && !userId) {
      throw new ApiError(401, "MEMBER_LOGIN_REQUIRED", "회원 주문은 로그인이 필요합니다.");
    }

    const orderId = createOrderId();
    const checkoutToken = createCheckoutToken();
    const checkoutTokenHash = await sha256(checkoutToken);
    const confirmIdempotencyKey = crypto.randomUUID();

    const { error } = await admin.rpc("create_payment_order", {
      p_order_id: orderId,
      p_user_id: customerType === "member" ? userId : null,
      p_customer_type: customerType,
      p_checkout_token_hash: checkoutTokenHash,
      p_subtotal: order.subtotal,
      p_shipping_fee: order.shippingFee,
      p_payment_amount: order.amount,
      p_order_name: order.orderName,
      p_recipient_name: recipient.recipientName,
      p_recipient_phone: recipient.phone,
      p_recipient_email: recipient.email,
      p_postcode: recipient.postcode,
      p_address: recipient.address,
      p_detail_address: recipient.detailAddress,
      p_delivery_request: recipient.deliveryRequest,
      p_confirm_idempotency_key: confirmIdempotencyKey,
      p_items: order.items,
    });

    if (error) {
      console.error("Could not create payment order", { code: error.code, details: error.details });
      throw new ApiError(500, "ORDER_CREATE_FAILED", "결제 주문을 만들지 못했습니다.");
    }

    return jsonResponse({
      orderId,
      orderName: order.orderName,
      amount: order.amount,
      currency: order.currency,
      subtotal: order.subtotal,
      shippingFee: order.shippingFee,
      checkoutToken,
      customerType,
    }, 201, corsHeaders);
  } catch (error) {
    return errorResponse(error, corsHeaders);
  }
});
