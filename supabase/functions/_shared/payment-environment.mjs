export function isTossSecretKeyForEnvironment(paymentEnvironment, secretKey) {
  if (typeof secretKey !== "string") return false;
  if (paymentEnvironment === "live") return secretKey.startsWith("live_sk_");
  if (paymentEnvironment === "test") return secretKey.startsWith("test_sk_");
  return false;
}
