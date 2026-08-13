import { ANONYMOUS, loadTossPayments } from "@tosspayments/tosspayments-sdk";
import { getTossPaymentEnvironment } from "./payment-environment.mjs";
import { supabase } from "./supabase";

const tossClientKey = import.meta.env.VITE_TOSS_CLIENT_KEY || "";

export const paymentEnvironment = getTossPaymentEnvironment(tossClientKey);
export const isPaymentConfigured = Boolean(supabase && paymentEnvironment !== "unconfigured");
export const isLivePayment = paymentEnvironment === "live";

async function invokePaymentFunction(name, body) {
  if (!supabase) throw new Error("Supabase 연결 설정을 확인해주세요.");

  const { data, error } = await supabase.functions.invoke(name, { body });
  if (!error) return data;

  let message = "결제 서버에 연결하지 못했습니다.";
  try {
    const payload = await error.context?.json();
    if (payload?.message) message = payload.message;
  } catch {
    if (error.message) message = error.message;
  }
  throw new Error(message);
}

export function createPaymentOrder(payload) {
  return invokePaymentFunction("create-payment-order", payload);
}

export function confirmPayment(payload) {
  return invokePaymentFunction("confirm-payment", payload);
}

export async function requestTossPayment({ order, customerName, customerEmail, userId }) {
  if (paymentEnvironment === "unconfigured") {
    throw new Error("토스페이먼츠 클라이언트 키를 설정해주세요.");
  }

  const tossPayments = await loadTossPayments(tossClientKey);
  const payment = tossPayments.payment({ customerKey: userId || ANONYMOUS });
  const successUrl = new URL(import.meta.env.BASE_URL, window.location.origin);
  const failUrl = new URL(import.meta.env.BASE_URL, window.location.origin);
  successUrl.searchParams.set("paymentResult", "success");
  failUrl.searchParams.set("paymentResult", "fail");

  await payment.requestPayment({
    method: "CARD",
    amount: { currency: order.currency, value: order.amount },
    orderId: order.orderId,
    orderName: order.orderName,
    successUrl: successUrl.toString(),
    failUrl: failUrl.toString(),
    customerName,
    customerEmail,
    card: {
      useEscrow: false,
      flowMode: "DEFAULT",
      useCardPoint: false,
      useAppCardOnly: false,
    },
  });
}
