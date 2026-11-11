// Fixed texts the product-RAG path saves when it cannot answer. Shared so the chat UI can show them as a notice with next steps instead of as an answer.
export const needsProductText = 'Please include one exact PandaByte product name or model.';
export const noEvidenceText = 'The available approved sources do not establish an answer to this question.';
export const answerKind = (text: string): 'needs_product' | 'no_evidence' | 'answer' => text === needsProductText ? 'needs_product' : text === noEvidenceText ? 'no_evidence' : 'answer';
