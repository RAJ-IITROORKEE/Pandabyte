export function validInquiryPhone(phone: string): boolean {
  if (!phone) return true;
  const match = /^\+([1-9]\d{0,2}) ([\d ]+)$/.exec(phone);
  if (!match) return false;
  const digits = match[2].replaceAll(" ", "");
  return digits.length >= 6 && digits.length + match[1].length <= 15 && (match[1] !== "91" || digits.length === 10);
}
