import { assertEquals } from "jsr:@std/assert@1.0.19";
import {
  isCanonicalUuid,
  isStripePaymentIntentId,
  paymentIntegrityAlertRequired,
  paymentLifecycleAction,
  validatePaidConsultation,
} from "./payment-integrity.ts";

const REQUEST_ID = "6f790d2b-10d7-4b30-8bd3-1c2fb0c6fe32";

Deno.test("payment integrity accetta soltanto UUID canonici", () => {
  assertEquals(isCanonicalUuid(REQUEST_ID), true);
  assertEquals(isCanonicalUuid("------------------------------------"), false);
  assertEquals(isCanonicalUuid("6f790d2b10d74b308bd31c2fb0c6fe32"), false);
});

Deno.test("payment integrity richiede un PaymentIntent Stripe riconoscibile", () => {
  assertEquals(isStripePaymentIntentId("pi_paid_123"), true);
  assertEquals(isStripePaymentIntentId("cs_test_123"), false);
  assertEquals(isStripePaymentIntentId(null), false);
});

Deno.test("payment integrity lega prodotto, importo, valuta e stato", () => {
  assertEquals(
    validatePaidConsultation({
      requestId: REQUEST_ID,
      product: "pro-review",
      amountTotal: 2900,
      currency: "eur",
      paymentStatus: "paid",
    }).ok,
    true,
  );
  assertEquals(
    validatePaidConsultation({
      requestId: REQUEST_ID,
      product: "production-pack",
      amountTotal: 2900,
      currency: "eur",
      paymentStatus: "paid",
    }),
    { ok: false, reason: "amount_mismatch" },
  );
  assertEquals(
    validatePaidConsultation({
      requestId: REQUEST_ID,
      product: "pro-review",
      amountTotal: 2900,
      currency: "usd",
      paymentStatus: "paid",
    }),
    { ok: false, reason: "currency_mismatch" },
  );
  assertEquals(
    validatePaidConsultation({
      requestId: REQUEST_ID,
      product: "pro-review",
      amountTotal: 2900,
      currency: "eur",
      paymentStatus: "unpaid",
    }),
    { ok: false, reason: "payment_not_settled" },
  );
  assertEquals(
    validatePaidConsultation({
      requestId: REQUEST_ID,
      product: "future-product",
      amountTotal: 2900,
      currency: "eur",
      paymentStatus: "paid",
    }),
    { ok: false, reason: "invalid_product" },
  );
});

Deno.test("payment integrity accoda alert solo per un addebito non conforme", () => {
  assertEquals(
    paymentIntegrityAlertRequired("paid", "amount_mismatch"),
    true,
  );
  assertEquals(
    paymentIntegrityAlertRequired("paid", "currency_mismatch"),
    true,
  );
  assertEquals(
    paymentIntegrityAlertRequired("paid", "invalid_product"),
    true,
  );
  assertEquals(
    paymentIntegrityAlertRequired("unpaid", "amount_mismatch"),
    false,
  );
  assertEquals(
    paymentIntegrityAlertRequired("unpaid", "payment_not_settled"),
    false,
  );
});

Deno.test("payment lifecycle distingue rimborso totale, parziale e dispute", () => {
  assertEquals(
    paymentLifecycleAction("charge.refunded", {
      payment_intent: "pi_paid_123",
      amount: 2900,
      amount_refunded: 2900,
      refunded: true,
    }),
    {
      paymentIntentId: "pi_paid_123",
      status: "refunded",
      revokesAccess: true,
    },
  );
  assertEquals(
    paymentLifecycleAction("charge.refunded", {
      payment_intent: "pi_partial_123",
      amount: 2900,
      amount_refunded: 100,
      refunded: false,
    }),
    {
      paymentIntentId: "pi_partial_123",
      status: "partially_refunded",
      revokesAccess: false,
    },
  );
  assertEquals(
    paymentLifecycleAction("charge.dispute.created", {
      payment_intent: { id: "pi_disputed_456" },
    }),
    {
      paymentIntentId: "pi_disputed_456",
      status: "disputed",
      revokesAccess: true,
    },
  );
  assertEquals(
    paymentLifecycleAction("refund.failed", {
      payment_intent: "pi_refund_failed_789",
      status: "failed",
    }),
    {
      paymentIntentId: "pi_refund_failed_789",
      status: "refund_failed",
      revokesAccess: false,
    },
  );
  assertEquals(
    paymentLifecycleAction("checkout.session.completed", {
      payment_intent: "pi_xxx",
    }),
    null,
  );
  assertEquals(
    paymentLifecycleAction("charge.refunded", { payment_intent: "bad" }),
    null,
  );
});
