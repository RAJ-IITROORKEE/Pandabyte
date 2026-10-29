import { activeCustomerSession, addressError, addressJson, customerAddressRpc, readAddressBody } from "./http";
import { parseCustomerAddressCreate } from "@/lib/account/addresses";

export async function GET() {
  try {
    const session = await activeCustomerSession();
    if (!session) return addressError("unauthorized", 401);

    const result = await customerAddressRpc("customer_list_addresses");
    if ("response" in result) return result.response;
    return Array.isArray(result.data)
      ? addressJson({ addresses: result.data })
      : addressError("backend_unavailable", 503);
  } catch {
    return addressError("backend_unavailable", 503);
  }
}

export async function POST(request: Request) {
  try {
    const session = await activeCustomerSession();
    if (!session) return addressError("unauthorized", 401);
    if (request.headers.get("x-account-owner") !== session.userId) return addressError("account_changed", 409);

    const body = await readAddressBody(request);
    if (body instanceof Response) return body;
    const address = parseCustomerAddressCreate(body.value);
    if (!address) return addressError("invalid_address", 400);

    const result = await customerAddressRpc("customer_create_address", {
      p_label: address.label,
      p_recipient_name: address.recipientName,
      p_phone: address.phone,
      p_line1: address.line1,
      p_line2: address.line2,
      p_city: address.city,
      p_state: address.state,
      p_postal_code: address.postalCode,
      p_country: address.country,
      p_is_default_shipping: address.isDefaultShipping,
      p_is_default_billing: address.isDefaultBilling,
    });
    if ("response" in result) return result.response;
    return result.data ? addressJson({ address: result.data }, 201) : addressError("backend_unavailable", 503);
  } catch {
    return addressError("backend_unavailable", 503);
  }
}
