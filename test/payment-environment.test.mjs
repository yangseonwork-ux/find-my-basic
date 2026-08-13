import assert from "node:assert/strict";
import test from "node:test";

import { getTossPaymentEnvironment } from "../src/lib/payment-environment.mjs";
import { isTossSecretKeyForEnvironment } from "../supabase/functions/_shared/payment-environment.mjs";

test("client payment environment only accepts explicit test and live key prefixes", () => {
  assert.equal(getTossPaymentEnvironment("test_ck_example"), "test");
  assert.equal(getTossPaymentEnvironment("live_ck_example"), "live");
  assert.equal(getTossPaymentEnvironment("test_sk_wrong_key_type"), "unconfigured");
  assert.equal(getTossPaymentEnvironment(""), "unconfigured");
});

test("server rejects mismatched Toss secret key environments", () => {
  assert.equal(isTossSecretKeyForEnvironment("test", "test_sk_example"), true);
  assert.equal(isTossSecretKeyForEnvironment("live", "live_sk_example"), true);
  assert.equal(isTossSecretKeyForEnvironment("test", "live_sk_example"), false);
  assert.equal(isTossSecretKeyForEnvironment("live", "test_sk_example"), false);
  assert.equal(isTossSecretKeyForEnvironment("staging", "live_sk_example"), false);
});
