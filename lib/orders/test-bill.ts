const MAX_PAISE = 49_500_000_000_000;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
const REFERENCE = /^TST-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const money = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= MAX_PAISE;
const text = (value: unknown, max: number, required = true): value is string => typeof value === "string" && (!required || !!value.trim()) && Array.from(value).length <= max && !CONTROL.test(value);

export type TestBillAddress = { recipientName: string; phone: string; line1: string; line2: string; city: string; state: string; postalCode: string; country: string };
export type TestBill = {
  reference: string; createdAt: string; status: string; totalPaise: number;
  shipping: TestBillAddress; billing: TestBillAddress;
  subtotalPaise: number; shippingPaise: number; taxPaise: number;
  lines: { title: string; sku: string; variant: string; quantity: number; unitPaise: number; totalPaise: number }[];
};

export function hasPaidTestBill(value: { environment: string; paymentState: string }): boolean {
  return value.environment === "razorpay_test" && value.paymentState === "paid";
}

function address(value: unknown): TestBillAddress | null {
  if (!object(value) || !text(value.recipientName, 120) || !text(value.phone, 30) || !text(value.line1, 200) || !text(value.line2, 200, false) || !text(value.city, 100) || !text(value.state, 100) || !text(value.postalCode, 6) || !/^[0-9]{6}$/.test(value.postalCode) || value.country !== "India") return null;
  return { recipientName: value.recipientName, phone: value.phone, line1: value.line1, line2: value.line2, city: value.city, state: value.state, postalCode: value.postalCode, country: value.country };
}

// Project only purchase-time fields. Current catalog and customer profiles never enter a bill.
export function parseTestBill(value: unknown, reference: string): TestBill | null {
  if (!REFERENCE.test(reference) || !object(value) || value.reference !== reference || value.environment !== "razorpay_test" || value.paymentState !== "paid" || value.currency !== "INR" || !text(value.createdAt, 40) || !Number.isFinite(Date.parse(value.createdAt)) || !["pending", "processing", "fulfilled", "cancelled"].includes(String(value.status)) || !money(value.totalPaise) || !object(value.snapshot)) return null;
  const snapshot = value.snapshot;
  if (snapshot.chargesAreFictional !== true || !money(snapshot.fictionalShippingPaise) || !money(snapshot.fictionalTaxPaise) || !object(snapshot.quote) || !money(snapshot.quote.subtotalPaise) || !Array.isArray(snapshot.quote.lines) || snapshot.quote.lines.length < 1 || snapshot.quote.lines.length > 50) return null;
  const shipping = address(snapshot.shipping), billing = address(snapshot.billing);
  if (!shipping || !billing) return null;
  const lines: TestBill["lines"] = [];
  let subtotal = 0;
  for (const line of snapshot.quote.lines) {
    if (!object(line) || !text(line.title, 300) || !Number.isInteger(line.quantity) || Number(line.quantity) < 1 || Number(line.quantity) > 99 || !money(line.lineTotalPaise) || !object(line.variant) || !text(line.variant.sku, 120) || !text(line.variant.label, 160, false) || !money(line.variant.effectivePricePaise)) return null;
    const quantity = Number(line.quantity), expected = line.variant.effectivePricePaise * quantity;
    if (!money(expected) || expected !== line.lineTotalPaise) return null;
    subtotal += expected;
    if (!money(subtotal)) return null;
    lines.push({ title: line.title, sku: line.variant.sku, variant: line.variant.label, quantity, unitPaise: line.variant.effectivePricePaise, totalPaise: line.lineTotalPaise });
  }
  const total = subtotal + snapshot.fictionalShippingPaise + snapshot.fictionalTaxPaise;
  if (subtotal !== snapshot.quote.subtotalPaise || !money(total) || total !== value.totalPaise) return null;
  return { reference, createdAt: value.createdAt, status: String(value.status), totalPaise: value.totalPaise, shipping, billing, subtotalPaise: subtotal, shippingPaise: snapshot.fictionalShippingPaise, taxPaise: snapshot.fictionalTaxPaise, lines };
}
