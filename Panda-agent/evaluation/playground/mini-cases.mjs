// Frozen source-visible cases and offline objective checks. This module never calls a provider.
export const cases = Object.freeze([
  Object.freeze({ id: 'mini-01', productSku: 'ESPX8266', question: 'According to the x8266 listing, what is its flash memory?', expected: '4 MB' }),
  Object.freeze({ id: 'mini-02', productSku: 'ESPX8266', question: 'According to the x8266 listing, how many years is the warranty for its flash memory?', expected: 'abstain' }),
]);
const source = 'https://www.pandabyte.in/product-page/pandabyte-x8266-wifi-development-board';
const fact = /\b4\s*MB\b/i;
const flash = /\bflash\s+memory\b/i;
const exactKeys = (v, keys) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).sort().join(',') === keys;

// Shared frozen answer/evidence expectations. No claim about provider wire format.
function checkEvaluation(id, response, model) {
  const failures = [];
  const test = (ok, message) => { if (!ok) failures.push(message); };
  const item = cases.find(c => c.id === id);
  if (!item) throw Error('Unknown case');
  if (!exactKeys(model, 'answer,evidence') || typeof model.answer !== 'string' || !Array.isArray(model.evidence) || model.evidence.length > 4) return { pass: false, failures: ['Invalid model shape'] };
  const passages = response?.passages;
  test(response?.model?.status === 'evaluated', 'No evaluated model response');
  if (!Array.isArray(passages) || !passages.length || passages.length > 8) return { pass: false, failures: [...failures, 'Missing retrieved context'] };
  test(passages.every((p, i) => p.rank === i + 1 && p.sourceUrl === source && typeof p.text === 'string' && p.text.length > 0), 'Context rank or product source mismatch');
  const ranks = new Set();
  for (const e of model.evidence) {
    const valid = exactKeys(e, 'quote,rank,reason') && Number.isSafeInteger(e.rank) && e.rank >= 1 && e.rank <= passages.length && typeof e.quote === 'string' && e.quote.trim().length > 0 && e.quote.length <= 600 && typeof e.reason === 'string' && e.reason.trim().length > 0 && e.reason.length <= 500;
    test(valid, 'Malformed evidence');
    if (!valid) continue;
    test(!ranks.has(e.rank), 'Duplicate evidence rank'); ranks.add(e.rank);
    test(passages[e.rank - 1].text.includes(e.quote), 'Quote is not literal in retrieved passage');
  }
  if (item.expected === 'abstain') {
    test(response.outcome === 'insufficient' && model.answer === '' && model.evidence.length === 0, 'Expected model abstention');
    test(!passages.some(p => /\bwarrant(?:y|ies)\b/i.test(p.text)), 'Context contains warranty information; case is inconclusive');
  } else {
    test(response.outcome === 'retrieved', 'Expected retrieved outcome');
    test(flash.test(model.answer) && fact.test(model.answer) && !/\b(?:not|isn.t|unknown|unclear|unsupported)\b/i.test(model.answer) && !/\b(?:[0-35-9]|[1-9]\d+)\s*(?:MB|GB)\b/i.test(model.answer), 'Answer must affirm flash memory and 4 MB');
    test(model.evidence.some(e => typeof e.quote === 'string' && flash.test(e.quote) && fact.test(e.quote) && passages[e.rank - 1]?.text.includes(e.quote)), 'A literal quote must contain both flash memory and 4 MB');
  }
  return { pass: failures.length === 0, failures };
}


// Use only with the guarded model's actual unmodified JSON text, if it is available.
export function checkCase(id, response, rawModel) {
  let model;
  try { model = JSON.parse(rawModel); } catch { return { pass:false, failures:['Model response is not strict JSON'] }; }
  const checked = checkEvaluation(id, response, model);
  if (response?.model?.answer !== model?.answer || JSON.stringify(response?.model?.evidence) !== JSON.stringify(model?.evidence)) checked.failures.push('Model output differs from returned evaluation');
  return { pass:checked.failures.length === 0, failures:checked.failures };
}

// Browser-visible response only. Never manufacture rawModel text to claim wire verification.
export function checkResponseCase(id, response) {
  if (!exactKeys(response?.model, 'answer,evidence,status')) return { pass:false, failures:['Invalid evaluated response shape'], modelWireVerified:false, rawModelAvailable:false };
  const checked = checkEvaluation(id, response, {answer:response.model.answer,evidence:response.model.evidence});
  return { ...checked, modelWireVerified:false, rawModelAvailable:false };
}
