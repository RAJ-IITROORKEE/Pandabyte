import { activeCustomerSession, addressError, addressJson, customerAddressRpc, readAddressBody } from "../http";
import {
  isCustomerAddressId,
  parseCustomerAddressDelete,
  parseCustomerAddressUpdate,
} from "@/lib/account/addresses";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await activeCustomerSession();
    if (!session) return addressError("unauthorized", 401);

    const { id } = await context.params;
    if (!isCustomerAddressId(id)) return addressError("not_found", 404);
    const body = await readAddressBody(request);
    if (body instanceof Response) return body;
    const address = parseCustomerAddressUpdate(body.value);
    if (!address) return addressError("invalid_address", 400);

    const result = await customerAddressRpc("customer_update_address", {
      p_id: id,
      p_expected_version: address.expectedVersion,
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
    return result.data ? addressJson({ address: result.data }) : addressError("backend_unavailable", 503);
  } catch {
    return addressError("backend_unavailable", 503);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const session = await activeCustomerSession();
    if (!session) return addressError("unauthorized", 401);

    const { id } = await context.params;
    if (!isCustomerAddressId(id)) return addressError("not_found", 404);
    const body = await readAddressBody(request);
    if (body instanceof Response) return body;
    const input = parseCustomerAddressDelete(body.value);
    if (!input) return addressError("invalid_address", 400);

    const result = await customerAddressRpc("customer_delete_address", {
      p_id: id,
      p_expected_version: input.expectedVersion,
    });
    if ("response" in result) return result.response;
    return result.data && typeof result.data === "object" && !Array.isArray(result.data) &&
      (result.data as { deleted?: unknown }).deleted === true
      ? addressJson({ deleted: true })
      : addressError("backend_unavailable", 503);
  } catch {
    return addressError("backend_unavailable", 503);
  }
}
