import { serverProductById } from "./catalog.mjs";

export const BASE_SHIPPING_FEE = 3000;
export const FREE_SHIPPING_THRESHOLD = 50000;

export class OrderValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "OrderValidationError";
    this.code = code;
  }
}

function requiredText(value, fieldName, maxLength) {
  if (typeof value !== "string") {
    throw new OrderValidationError("INVALID_RECIPIENT", `${fieldName} 형식이 올바르지 않습니다.`);
  }

  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new OrderValidationError("INVALID_RECIPIENT", `${fieldName}을(를) 확인해주세요.`);
  }
  return normalized;
}

function optionalText(value, maxLength) {
  if (value == null || value === "") return "";
  if (typeof value !== "string") {
    throw new OrderValidationError("INVALID_RECIPIENT", "배송 정보 형식이 올바르지 않습니다.");
  }
  return value.trim().slice(0, maxLength);
}

export function validateRecipient(recipient) {
  if (!recipient || typeof recipient !== "object" || Array.isArray(recipient)) {
    throw new OrderValidationError("INVALID_RECIPIENT", "배송 정보를 확인해주세요.");
  }

  const recipientName = requiredText(recipient.recipientName, "수령인", 80);
  const phone = requiredText(recipient.phone, "연락처", 20);
  const email = requiredText(recipient.email, "이메일", 254).toLowerCase();
  const postcode = requiredText(recipient.postcode, "우편번호", 5);
  const address = requiredText(recipient.address, "기본주소", 300);

  if (!/^[0-9+ -]{9,20}$/.test(phone)) {
    throw new OrderValidationError("INVALID_RECIPIENT", "연락처 형식을 확인해주세요.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new OrderValidationError("INVALID_RECIPIENT", "이메일 형식을 확인해주세요.");
  }
  if (!/^\d{5}$/.test(postcode)) {
    throw new OrderValidationError("INVALID_RECIPIENT", "우편번호 형식을 확인해주세요.");
  }

  return {
    recipientName,
    phone,
    email,
    postcode,
    address,
    detailAddress: optionalText(recipient.detailAddress, 300),
    deliveryRequest: optionalText(recipient.deliveryRequest, 300),
  };
}

export function calculateOrder(rawItems, customerType) {
  if (customerType !== "member" && customerType !== "guest") {
    throw new OrderValidationError("INVALID_CUSTOMER_TYPE", "주문 유형을 확인해주세요.");
  }
  if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > 20) {
    throw new OrderValidationError("INVALID_ITEMS", "주문 상품을 확인해주세요.");
  }

  const seen = new Set();
  const items = rawItems.map((rawItem) => {
    const product = serverProductById.get(rawItem?.productId);
    const quantity = Number(rawItem?.quantity);

    if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
      throw new OrderValidationError("INVALID_ITEMS", "주문 상품 또는 수량을 확인해주세요.");
    }
    if (seen.has(product.id)) {
      throw new OrderValidationError("DUPLICATE_ITEM", "같은 상품이 중복으로 포함되어 있습니다.");
    }
    seen.add(product.id);

    return {
      product_id: product.id,
      product_name: product.name,
      brand: product.brand,
      unit_price: product.price,
      quantity,
    };
  });

  const subtotal = items.reduce((total, item) => total + item.unit_price * item.quantity, 0);
  const shippingFee = customerType === "member" && subtotal >= FREE_SHIPPING_THRESHOLD
    ? 0
    : BASE_SHIPPING_FEE;
  const firstProduct = items[0];
  const orderName = items.length === 1
    ? firstProduct.product_name
    : `${firstProduct.product_name} 외 ${items.length - 1}건`;

  return {
    items,
    subtotal,
    shippingFee,
    amount: subtotal + shippingFee,
    currency: "KRW",
    orderName,
  };
}

export function createOrderId(now = new Date(), uuid = crypto.randomUUID()) {
  const datePart = [now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate()]
    .map((value) => String(value).padStart(2, "0"))
    .join("");
  const randomPart = uuid.replaceAll("-", "").slice(0, 16).toUpperCase();
  return `FMB-${datePart}-${randomPart}`;
}

export function createCheckoutToken() {
  return `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
}

export async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function validateConfirmInput(input) {
  const paymentKey = typeof input?.paymentKey === "string" ? input.paymentKey.trim() : "";
  const orderId = typeof input?.orderId === "string" ? input.orderId.trim() : "";
  const checkoutToken = typeof input?.checkoutToken === "string" ? input.checkoutToken.trim() : "";
  const amount = Number(input?.amount);

  if (!paymentKey || paymentKey.length > 200) {
    throw new OrderValidationError("INVALID_PAYMENT_KEY", "결제 키를 확인해주세요.");
  }
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(orderId)) {
    throw new OrderValidationError("INVALID_ORDER_ID", "주문번호를 확인해주세요.");
  }
  if (!Number.isSafeInteger(amount) || amount < 100) {
    throw new OrderValidationError("INVALID_AMOUNT", "결제 금액을 확인해주세요.");
  }
  if (checkoutToken && !/^[a-f0-9]{64}$/i.test(checkoutToken)) {
    throw new OrderValidationError("INVALID_CHECKOUT_TOKEN", "결제 세션을 확인해주세요.");
  }

  return { paymentKey, orderId, amount, checkoutToken };
}
