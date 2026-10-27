// Source: product-images classificationReview/visualQA and catalog import ledger, 26 October 2026.
// Only reviewed front/rear views or single standalone views are listed; keep other galleries.
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
  "b0dfb1fa-6fb1-4a37-ab59-7c00c991f2a1": ["fba8413f-30d7-4c00-9bf0-2b52f025a05c"], // USB cable
  "f0ea8f21-b4cf-487b-94ec-af33d47747e3": ["10cad069-30c4-42ff-b9dc-34c4639a90b9", "49652e5c-94af-4935-b364-338fb51cad2c"], // right-angle header
  "f2e9019f-60f5-45c1-9872-69ae4d1149e8": ["3184b225-e6d4-41b2-a549-a5c998927c11", "5f5e42ec-4ddb-4e23-86c9-25e3ed5b6f80"], // regular header
  "7102c032-7155-451b-bbb6-c5f871d2a6d3": ["b2ceb62d-599f-465a-9572-9f969cf79d3a"], // Grove cable pack
  "f13f8dff-dde9-4b22-9fa1-b26700ac3f46": ["08ce24de-95e3-4963-9005-282a667865e8", "ceb6ee55-1356-41ee-94e6-eb65403585b6"], // x32
  "9f96ea8d-9f1c-4aa3-ac11-5bf7e49f36ad": ["e558e4b9-d43b-4166-a715-749e225ddab6", "428f95ab-f110-46f6-8eb6-fcef93f91cb4"], // Maker UNO
  "087d03ec-8d40-4095-9335-610f696a2ff2": ["151869a4-a204-4caf-b1b0-1c8136de49a2", "8d832387-7e4f-4ae6-a3a0-46e77662d7c0"], // xC3m
  "6733eae2-9480-4b1c-b6b6-840dfda7c1b8": ["13714648-9a07-487d-ba71-bc0548ade48c", "b2af9184-ea6a-467d-90c0-188b32f0265a"], // xLoRa
  "bb9fd736-3225-4a78-9051-358a6f8147d8": ["015a651d-53d6-4627-9831-d10294643f99", "949c3ef6-653c-4a6d-a953-605208d2a0a5"], // xS3
  "fa347e83-9a62-4f75-bc09-f12ba85fab41": ["7dbf24f0-e07a-4e55-9f68-c0865ed3a7c2", "72765257-078a-44fb-adc0-c10a0007363c"], // BMP580
  "ea1be322-ec53-4313-9727-8f8492896a69": ["79088a0d-a925-43f5-a8ad-73f58e0559d5", "a900ca47-dacd-4f0e-81a2-f086e31f0fa8"], // NEO-6M
  "f5592d03-53fb-4c67-b04f-101a93e53179": ["30655573-27be-4bc0-afcf-6a7f88f313d2"], // MPU6050
  "46ff0698-9c48-4ce4-ac26-652a748cc8b2": ["e44ec427-6bc0-4007-a8ec-9f900e840522", "8fa20345-6f05-4321-ace4-3f3b0141d53a"], // BMV080
  "43dd32fe-f280-4f01-b580-2c4ba744fd3b": ["38e5bf5c-f08d-4c96-93fe-ba35a5ae1622"], // GP-02
  "b4c15c4a-1ccd-4755-84dc-1eef4598041d": ["8a7f4a82-a2e8-456f-bf1c-05c372a514e2", "edce1f1a-1b1b-4fc7-9b98-6e7ff38ff375"], // MAX485
  "d6733474-819a-4ef4-9eb2-ffb641ff7505": ["f305a1df-f422-41a9-89ac-3474a2477b3d", "7a9d5d32-aa2a-43f8-8a99-1464b8bcab20"], // OLED
  "45981350-ad01-440e-a045-b7616cab8767": ["f943ec2d-ae0a-4732-9c20-1d1a8c1508e0", "7e1e4710-39cc-45ec-ab4b-fcfd3a8cfc07"], // potentiometer
  "2d508705-430f-4568-9990-14549b46106e": ["da9bae2a-0aa2-4f84-9b0d-6452a332bbfa", "edeaa602-dc4b-4956-89e4-67837dc64338"], // RGB strip
  "98dfa249-b129-4bd6-b54d-6eae0b59d080": ["4ec1d832-7807-4d4b-864f-d85f1dc3ba35", "40ee67dd-a16a-403e-a184-ae54e5ae5b80"], // LCD backlight
  "8b4745c0-5e5d-42e0-a9f8-8c24583e8a50": ["8afafe5d-ec3f-4613-901f-ace112b2eff5", "1cba07ae-0950-4adf-9e49-37a641401ec0"], // XPM
  "99490cb9-0ccc-4a4d-bc23-35d544f925c6": ["c2d4cf9e-8df9-46a3-af6e-3c5bf9b33ebf", "3cfd9542-4866-4d81-a146-0dc238025dbf"], // push button
  "8c8547f1-858e-4684-8960-a1e0622a5a08": ["75b24e39-768b-48b3-aa9e-70af5251d8f5", "66d8fe8f-f67d-4f4d-ae36-425e81e95e06"], // RGB ring
  "ba359422-aaee-4be7-9e84-a3169bbc1d84": ["507bf0f8-83fc-4025-b3ef-c9b968756c91", "630e9a31-bbe5-42a6-b6a7-b92ca62dc87a"], // RGB matrix
  "29fcca61-dc9a-4725-9977-b123ca93196e": ["2be0f6b9-21f0-471a-8ea9-9cbf2b544884", "cce1c52a-cece-4161-8b22-37ff6cc82600"], // single LED
  "e41c82d3-00fd-4ceb-baa1-0447df8d3e12": ["05fdad2e-92bd-47a5-9974-f2a47780f162"], // NodeMCU shield
  "cc11f284-91e6-4400-97b7-8a7161ab55af": ["11ba2bc5-57c3-40dd-aa37-0c0c79ff4c7d"], // x32/xLoRa shield
  "3a37bde2-e55b-4131-a283-d57e13cd7046": ["210e8afc-de25-453a-9b17-adef93cccaa0"], // xC3m shield
};

export function cardImageIds(productId: string, publishedIds: string[]): string[] {
  const pair = reviewedPairs[productId];
  if (!pair) return publishedIds;
  const available = pair.filter((id) => publishedIds.includes(id));
  return available.length ? available : publishedIds;
}

