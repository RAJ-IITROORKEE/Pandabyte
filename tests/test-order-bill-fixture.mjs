export const reference = "TST-11111111-1111-4111-8111-111111111111";
export function orderFixture() {
  const address = { recipientName: "Saved Customer", phone: "+919999999999", line1: "Saved address", line2: "", city: "Kolkata", state: "West Bengal", postalCode: "700001", country: "India" };
  return { reference, environment: "razorpay_test", paymentState: "paid", status: "processing", currency: "INR", createdAt: "2026-10-30T10:00:00Z", totalPaise: 12345,
    snapshot: { shipping: { ...address }, billing: { ...address }, chargesAreFictional: true, fictionalShippingPaise: 100, fictionalTaxPaise: 245, quote: { subtotalPaise: 12000, lines: [{ title: "Purchased sensor", quantity: 2, lineTotalPaise: 12000, variant: { sku: "SAVED-SKU", label: "Saved variant", effectivePricePaise: 6000 } }] } } };
}
