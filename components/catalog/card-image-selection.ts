// Source: product-images classificationReview/visualQA and catalog import ledger, 26 October 2026.
// Only reviewed front/rear pairs are listed; keep the published gallery for other products.
const reviewedPairs: Record<string, readonly string[]> = {
  "25ddc701-7d9a-4802-b480-032a7e580a57": ["1136d7b1-367d-4fd3-9338-09783a117cc4", "4d0f39e1-811f-4fad-aa92-c855bf6b1a11"], // 18650 holder
  "19b48c34-3668-4fc1-a25d-5635226103c4": ["e4d414aa-fa8c-4b9d-9fff-1d9da239cd79", "88ed6ab3-be88-4bcf-8001-072c32b84bd5"], // x8266
  "5638c86c-6817-433a-abf3-1abee8d3eff6": ["70c0ed93-db61-4940-8b98-ced68816337f", "fd13e21b-9d2d-491a-9af7-70b124530dec"], // xC3
  "f642bf30-2a72-42c0-b268-00c610252328": ["286f2dc9-ca13-4856-a93b-fc8d366d8d41", "28ee23e7-0d01-4e94-a4f6-f5bd5e37f51a"], // xC5
  "833b6026-d946-4379-a070-a07ca17f3cbc": ["228f9e39-dace-4321-8d79-1f6f4d02deff", "9c9e9480-315f-4cdd-8d6a-30355c9b0529"], // xC6
  "8223f569-77ec-4390-b347-aea1d9cc46a1": ["b365bf43-7f62-4357-beb8-885f61c74082", "79d1c86b-7226-4cae-88bd-12f8e68c9cfe"], // ADXL345
  "a5c3a0d1-cc50-4691-b1da-ee1aca241345": ["87307b21-9205-4b09-89c4-585afd1369a7", "7f76051b-1d1e-47a3-a734-e1e417554d8a"], // active buzzer
  "b071990f-37bf-4293-982d-471ae90a0c2a": ["3911eabf-15ea-4237-af27-946e0e43ab70", "bf474d93-d6b8-4461-981c-172c75dfdfaa"], // LED switch
  "6dfc38d7-ee55-402e-9f82-5145208102f5": ["9102a783-9e1d-4e5f-a194-0cf795b3089a", "b439d635-cdc4-4a79-80e7-8d7a8e4a3609"], // TEMT6000
  "93452237-8bcf-4c15-b435-f27510cca6b2": ["0e1912a4-a16d-4ff4-a9d0-f1541e5118e2", "ce84ffdd-c554-4265-8e44-eb5d495fbb59"], // DHT11
  "3ce93aa6-4a67-462d-8f01-d36d908faae5": ["cfc6a18f-80d1-400c-8b1a-5e88da9d65e7", "d73bc172-0b7a-478c-959a-a6b267a79365"], // RGB LED
};

export function cardImageIds(productId: string, publishedIds: string[]): string[] {
  const pair = reviewedPairs[productId];
  if (!pair) return publishedIds;
  const available = pair.filter((id) => publishedIds.includes(id));
  return available.length ? available : publishedIds;
}

