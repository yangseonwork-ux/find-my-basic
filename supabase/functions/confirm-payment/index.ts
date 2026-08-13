import { sha256, validateConfirmInput } from "../_shared/order.mjs";
import { isTossSecretKeyForEnvironment } from "../_shared/payment-environment.mjs";
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

const tossConfirmUrl = "https://api.tosspayments.com/v1/payments/confirm";

function tossSecretKey() {
  const paymentEnvironment = Deno.env.get("PAYMENT_ENV");
  const key = Deno.env.get("TOSS_SECRET_KEY") || "";

  if (!isTossSecretKeyForEnvironment(paymentEnvironment, key)) {
    throw new ApiError(500, "PAYMENT_NOT_CONFIGURED", "결제 서버 환경 설정을 확인해주세요.");
  }
  return key;
}

function tossHeaders(secretKey: string, idempotencyKey?: string) {
  const headers: Record<string, string> = {
    Authorization: `Basic ${btoa(`${secretKey}:`)}`,
    "Content-Type": "application/json",
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  return headers;
}

async function readJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isApprovedPayment(payment: unknown, expected: { paymentKey: string; orderId: string; amount: number }) {
  if (!payment || typeof payment !== "object") return false;
  const value = payment as Record<string, unknown>;
  return value.paymentKey === expected.paymentKey
    && value.orderId === expected.orderId
    && value.totalAmount === expected.amount
    && value.status === "DONE";
}

async function queryPaymentByOrderId(secretKey: string, orderId: string) {
  try {
    const response = await fetch(
      `https://api.tosspayments.com/v1/payments/orders/${encodeURIComponent(orderId)}`,
      { method: "GET", headers: tossHeaders(secretKey) },
    );
    return { ok: response.ok, body: await readJson(response) };
  } catch {
    return { ok: false, body: null };
  }
}

function paidOrderResponse(claim: Record<string, unknown>) {
  return {
    orderNumber: claim.order_id,
    customerType: claim.customer_type,
    status: "결제 완료",
    total: claim.payment_amount,
    paymentMethod: claim.payment_method,
    approvedAt: claim.approved_at,
  };
}

Deno.serve(async (request) => {
  let corsHeaders: Record<string, string> = {};

  try {
    corsHeaders = corsForRequest(request);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
    if (request.method !== "POST") throw new ApiError(405, "METHOD_NOT_ALLOWED", "POST 요청만 지원합니다.");

    requirePublishableKey(request);
    const input = validateConfirmInput(await parseRequestBody(request));
    const admin = createAdminClient();
    const userId = await getOptionalUserId(request, admin);
    if (!input.checkoutToken && !userId) {
      throw new ApiError(401, "CHECKOUT_TOKEN_REQUIRED", "비회원 결제 세션을 확인해주세요.");
    }
    const checkoutTokenHash = input.checkoutToken ? await sha256(input.checkoutToken) : null;

    const { data: claims, error: claimError } = await admin.rpc("claim_payment_confirmation", {
      p_order_id: input.orderId,
      p_checkout_token_hash: checkoutTokenHash,
      p_user_id: userId,
      p_payment_amount: input.amount,
    });

    if (claimError) {
      console.error("Could not claim payment confirmation", { code: claimError.code, details: claimError.details });
      throw new ApiError(500, "PAYMENT_CLAIM_FAILED", "결제 승인 상태를 확인하지 못했습니다.");
    }

    const claim = claims?.[0] as Record<string, unknown> | undefined;
    if (!claim) {
      throw new ApiError(400, "ORDER_VERIFICATION_FAILED", "주문번호, 금액 또는 결제 세션이 일치하지 않습니다.");
    }
    if (claim.current_status === "paid") {
      return jsonResponse({ pending: false, order: paidOrderResponse(claim) }, 200, corsHeaders);
    }
    if (!claim.claimed) {
      if (claim.current_status === "confirming") {
        return jsonResponse({ pending: true }, 202, corsHeaders);
      }
      throw new ApiError(409, "ORDER_NOT_CONFIRMABLE", "현재 상태에서는 이 주문을 승인할 수 없습니다.");
    }

    const secretKey = tossSecretKey();
    const expected = { paymentKey: input.paymentKey, orderId: input.orderId, amount: input.amount };
    let tossResponse: Response | null = null;
    let tossBody: Record<string, unknown> | null = null;

    try {
      tossResponse = await fetch(tossConfirmUrl, {
        method: "POST",
        headers: tossHeaders(secretKey, String(claim.confirm_idempotency_key)),
        body: JSON.stringify({
          paymentKey: input.paymentKey,
          orderId: input.orderId,
          amount: input.amount,
        }),
      });
      tossBody = await readJson(tossResponse);
    } catch {
      const queried = await queryPaymentByOrderId(secretKey, input.orderId);
      if (queried.ok && isApprovedPayment(queried.body, expected)) {
        tossBody = queried.body as Record<string, unknown>;
      }
    }

    if ((!tossResponse || tossResponse.status >= 500) && !isApprovedPayment(tossBody, expected)) {
      const queried = await queryPaymentByOrderId(secretKey, input.orderId);
      if (queried.ok && isApprovedPayment(queried.body, expected)) {
        tossBody = queried.body as Record<string, unknown>;
      }
    }

    if (!isApprovedPayment(tossBody, expected)) {
      const isUnknown = !tossResponse || tossResponse.status >= 500;
      const errorCode = typeof tossBody?.code === "string" ? tossBody.code : isUnknown ? "CONFIRMATION_UNKNOWN" : "PAYMENT_CONFIRM_FAILED";
      const errorMessage = typeof tossBody?.message === "string"
        ? tossBody.message
        : isUnknown
          ? "승인 결과를 확인 중입니다. 잠시 후 다시 시도해주세요."
          : "결제 승인이 완료되지 않았습니다.";

      const { error: recordError } = await admin.rpc("record_payment_confirmation_error", {
        p_order_pk: claim.order_pk,
        p_status: isUnknown ? "confirmation_unknown" : "failed",
        p_payment_key: input.paymentKey,
        p_error_code: errorCode,
        p_error_message: errorMessage,
        p_toss_response: tossBody,
      });
      if (recordError) console.error("Could not record payment failure", { code: recordError.code });

      throw new ApiError(isUnknown ? 503 : 400, errorCode, errorMessage);
    }

    const { data: completed, error: completeError } = await admin.rpc("complete_payment_confirmation", {
      p_order_pk: claim.order_pk,
      p_payment_key: input.paymentKey,
      p_payment_method: typeof tossBody?.method === "string" ? tossBody.method : null,
      p_approved_at: typeof tossBody?.approvedAt === "string" ? tossBody.approvedAt : new Date().toISOString(),
      p_toss_response: tossBody,
    });

    if (completeError || !completed?.[0]) {
      console.error("Could not persist approved payment", { code: completeError?.code, details: completeError?.details });
      throw new ApiError(503, "PAYMENT_SAVE_PENDING", "결제는 승인되었지만 주문 반영을 확인 중입니다. 다시 확인해주세요.");
    }

    const order = completed[0];
    return jsonResponse({
      pending: false,
      order: {
        orderNumber: order.order_id,
        customerType: order.customer_type,
        status: "결제 완료",
        total: order.payment_amount,
        paymentMethod: order.payment_method,
        approvedAt: order.approved_at,
      },
    }, 200, corsHeaders);
  } catch (error) {
    return errorResponse(error, corsHeaders);
  }
});
