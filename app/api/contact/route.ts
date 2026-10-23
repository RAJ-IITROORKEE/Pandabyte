import { createInsforgePublicClient } from "@/lib/insforge/public";
import { editorialBody, editorialDatabaseError, editorialError, editorialJson } from "@/lib/editorial/http";
import { parseInquiryInput } from "@/lib/editorial/validation";

export async function POST(request: Request) {
  const body = await editorialBody(request, 32768);
  if (body instanceof Response) return body;
  const inquiry = parseInquiryInput(body.value);
  if (!inquiry) return editorialError("invalid_inquiry", 400);
  try {
    const client = createInsforgePublicClient();
    const { data, error } = await client.database.schema("public").rpc("submit_inquiry", {
      p_name: inquiry.name, p_email: inquiry.email, p_phone: inquiry.phone,
      p_subject: inquiry.subject, p_message: inquiry.message, p_request_id: inquiry.idempotencyKey,
    });
    return error ? editorialDatabaseError(error) : editorialJson(data, 201);
  } catch { return editorialError("inquiry_unavailable", 503); }
}
