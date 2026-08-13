export function getTossPaymentEnvironment(clientKey) {
  if (typeof clientKey !== "string") return "unconfigured";
  if (clientKey.startsWith("live_ck_")) return "live";
  if (clientKey.startsWith("test_ck_")) return "test";
  return "unconfigured";
}
