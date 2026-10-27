import { cartError } from "@/lib/checkout/http";
export async function POST() { return cartError("payment_not_configured", 503); }
