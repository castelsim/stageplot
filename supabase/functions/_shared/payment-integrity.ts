export const PRODUCT_PRICE_EUR_CENTS: Record<string, number> = {
  "pro-review": 2900,
  "production-pack": 14900,
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isCanonicalUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function isStripePaymentIntentId(value: unknown): value is string {
  return typeof value === "string" && /^pi_[A-Za-z0-9_]{3,200}$/.test(value);
}

export function validatePaidConsultation(args: {
  requestId: unknown;
  product: unknown;
  amountTotal: unknown;
  currency: unknown;
  paymentStatus: unknown;
}): { ok: true; requestId: string; product: string } | {
  ok: false;
  reason: string;
} {
  if (!isCanonicalUuid(args.requestId)) {
    return { ok: false, reason: "invalid_request_id" };
  }
  if (
    typeof args.product !== "string" ||
    !(args.product in PRODUCT_PRICE_EUR_CENTS)
  ) {
    return { ok: false, reason: "invalid_product" };
  }
  if (args.paymentStatus !== "paid") {
    return { ok: false, reason: "payment_not_settled" };
  }
  if (String(args.currency ?? "").toLowerCase() !== "eur") {
    return { ok: false, reason: "currency_mismatch" };
  }
  if (args.amountTotal !== PRODUCT_PRICE_EUR_CENTS[args.product]) {
    return { ok: false, reason: "amount_mismatch" };
  }
  return { ok: true, requestId: args.requestId, product: args.product };
}

const CAPTURED_PAYMENT_INTEGRITY_FAILURES = new Set([
  "invalid_product",
  "currency_mismatch",
  "amount_mismatch",
]);

export function paymentIntegrityAlertRequired(
  paymentStatus: unknown,
  reason: unknown,
): boolean {
  return paymentStatus === "paid" &&
    typeof reason === "string" &&
    CAPTURED_PAYMENT_INTEGRITY_FAILURES.has(reason);
}

export function paymentLifecycleAction(
  eventType: unknown,
  object: unknown,
): {
  paymentIntentId: string;
  status:
    | "partially_refunded"
    | "refunded"
    | "refund_failed"
    | "disputed";
  revokesAccess: boolean;
} | null {
  if (
    eventType !== "charge.refunded" &&
    eventType !== "refund.failed" &&
    eventType !== "charge.dispute.created"
  ) return null;
  if (!object || typeof object !== "object" || Array.isArray(object)) {
    return null;
  }
  const raw = (object as Record<string, unknown>).payment_intent;
  const paymentIntentId = typeof raw === "string"
    ? raw
    : raw && typeof raw === "object" && !Array.isArray(raw) &&
        typeof (raw as Record<string, unknown>).id === "string"
    ? String((raw as Record<string, unknown>).id)
    : "";
  if (!isStripePaymentIntentId(paymentIntentId)) return null;
  if (eventType === "charge.dispute.created") {
    return { paymentIntentId, status: "disputed", revokesAccess: true };
  }
  if (eventType === "refund.failed") {
    return { paymentIntentId, status: "refund_failed", revokesAccess: false };
  }
  const record = object as Record<string, unknown>;
  const amount = record.amount;
  const amountRefunded = record.amount_refunded;
  const fullyRefunded = record.refunded === true ||
    (
      typeof amount === "number" && Number.isFinite(amount) && amount > 0 &&
      typeof amountRefunded === "number" &&
      Number.isFinite(amountRefunded) &&
      amountRefunded >= amount
    );
  return fullyRefunded
    ? { paymentIntentId, status: "refunded", revokesAccess: true }
    : {
      paymentIntentId,
      status: "partially_refunded",
      revokesAccess: false,
    };
}
