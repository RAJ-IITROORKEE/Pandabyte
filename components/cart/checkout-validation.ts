export type Address = { recipientName: string; phone: string; line1: string; line2: string; city: string; state: string; postalCode: string; country: string };
export type CheckoutDraft = { email: string; firstName: string; lastName: string; phone: string; news: boolean; shipping: Address; billing: Address; sameBilling: boolean; business: string; gstin: string };
export const emptyAddress = (): Address => ({ recipientName: "", phone: "", line1: "", line2: "", city: "", state: "", postalCode: "", country: "India" });
export function isValidGstin(value: string): boolean { return value === "" || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/.test(value.toUpperCase()); }
function validPhone(value: string) { return /^[+0-9 ()-]{7,30}$/.test(value) && /^[0-9]{7,15}$/.test(value.replace(/\D/g, "")); }
export function isValidContact(name: string, email: string, phone: string): boolean { return !!name.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && validPhone(phone); }
export function validateStep(d: CheckoutDraft, step: number): Record<string, string> {
  const errors: Record<string, string> = {};
  const required = (key: string, value: string) => { if (!value.trim()) errors[key] = "This field is required."; };
  const phone = (key: string, value: string) => { if (!validPhone(value)) errors[key] = "Enter a phone number with 7 to 15 digits."; };
  if (step === 0) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) errors.email = "Enter a valid email address.";
    required("firstName", d.firstName); required("lastName", d.lastName); phone("phone", d.phone);
  }
  if (step === 1) {
    const address = (prefix: string, a: Address) => {
      required(`${prefix}.recipientName`, a.recipientName);
      phone(`${prefix}.phone`, a.phone);
      for (const key of ["line1", "city", "state"] as const) required(`${prefix}.${key}`, a[key]);
      if (!/^[0-9]{6}$/.test(a.postalCode)) errors[`${prefix}.postalCode`] = "Enter a six-digit PIN code.";
      required(`${prefix}.country`, a.country);
    };
    address("shipping", d.shipping); if (!d.sameBilling) address("billing", d.billing);
    if (!isValidGstin(d.gstin)) errors.gstin = "Enter a valid 15-character GSTIN format.";
  }
  return errors;
}
