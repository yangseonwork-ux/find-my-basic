import assert from "node:assert/strict";
import test from "node:test";
import { products } from "../src/data/products.js";
import { serverProducts } from "../supabase/functions/_shared/catalog.mjs";
import {
  calculateOrder,
  createOrderId,
  OrderValidationError,
  sha256,
  validateConfirmInput,
  validateRecipient,
} from "../supabase/functions/_shared/order.mjs";

test("server catalog matches every browser-visible product price", () => {
  const browserCatalog = products.map(({ id, name, brand, price }) => ({ id, name, brand, price }));
  assert.deepEqual(serverProducts, browserCatalog);
});

test("server calculates member and guest shipping without trusting client price", () => {
  const memberOrder = calculateOrder([
    { productId: "linen-sleeveless-top", quantity: 1, price: 1 },
  ], "member");
  const guestOrder = calculateOrder([
    { productId: "linen-sleeveless-top", quantity: 1, price: 1 },
  ], "guest");

  assert.equal(memberOrder.subtotal, 52000);
  assert.equal(memberOrder.shippingFee, 0);
  assert.equal(memberOrder.amount, 52000);
  assert.equal(guestOrder.shippingFee, 3000);
  assert.equal(guestOrder.amount, 55000);
});

test("server rejects duplicate products and invalid quantities", () => {
  assert.throws(
    () => calculateOrder([
      { productId: "airy-cotton-blouse", quantity: 1 },
      { productId: "airy-cotton-blouse", quantity: 1 },
    ], "guest"),
    (error) => error instanceof OrderValidationError && error.code === "DUPLICATE_ITEM",
  );
  assert.throws(
    () => calculateOrder([{ productId: "airy-cotton-blouse", quantity: 11 }], "guest"),
    (error) => error instanceof OrderValidationError && error.code === "INVALID_ITEMS",
  );
});

test("recipient validation normalizes values and rejects malformed postcodes", () => {
  const recipient = validateRecipient({
    recipientName: " 홍길동 ",
    phone: "010-1234-5678",
    email: "USER@example.com ",
    postcode: "06236",
    address: "서울특별시 강남구 테헤란로",
    detailAddress: " 101호 ",
  });

  assert.equal(recipient.recipientName, "홍길동");
  assert.equal(recipient.email, "user@example.com");
  assert.equal(recipient.detailAddress, "101호");
  assert.throws(
    () => validateRecipient({ ...recipient, postcode: "1234" }),
    (error) => error instanceof OrderValidationError && error.code === "INVALID_RECIPIENT",
  );
});

test("order IDs meet Toss Payments format and include deterministic date", () => {
  const orderId = createOrderId(
    new Date("2026-08-12T00:00:00.000Z"),
    "01234567-89ab-cdef-0123-456789abcdef",
  );
  assert.equal(orderId, "FMB-20260812-0123456789ABCDEF");
  assert.match(orderId, /^[A-Za-z0-9_-]{6,64}$/);
});

test("confirmation input accepts integer query amounts and validates checkout token", () => {
  const input = validateConfirmInput({
    paymentKey: "payment-key",
    orderId: "FMB-20260812-0123456789ABCDEF",
    amount: "52000",
    checkoutToken: "a".repeat(64),
  });
  assert.equal(input.amount, 52000);
  assert.throws(
    () => validateConfirmInput({ ...input, amount: "52000.5" }),
    (error) => error instanceof OrderValidationError && error.code === "INVALID_AMOUNT",
  );
});

test("checkout tokens are stored as deterministic SHA-256 hashes", async () => {
  assert.equal(
    await sha256("checkout-token"),
    "f73b9044d0a39db82876ca2560ec62234efc73e2560689b5b5a3fc92f70904e3",
  );
});
