import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLunaRagCompletion, lunaRagModel, lunaRagReportedModel } from '../src/server/luna-rag-openrouter.ts';

const input = { question: 'What does the listing say?', passages: [{ rank: 1, text: 'It lists a sensor.' }] };
function fixture({ hosted = true, mutateReceipt, mutateEndpoint, sourceCurrent = true } = {}) {
  const events = [];
  const endpoint = {
    tag: 'azure/us', model_id: lunaRagModel, name: 'Azure | ' + lunaRagReportedModel, provider_name: 'Azure', status: 0,
    pricing: { prompt: '0.00000011', completion: '0.00000055', input_cache_read: '0.000000011', input_cache_write: '0.0000001375', discount: 0 },
    context_length: 1050000, max_completion_tokens: 128000, max_prompt_tokens: null, supports_implicit_caching: false,
    supports_tool_choice: { none: true }, supported_parameters: ['max_completion_tokens','response_format','reasoning','include_reasoning','tool_choice'],
  };
  const receipt = { model: lunaRagReportedModel, provider: 'Azure', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({
    answer: 'It lists a sensor.', evidence: [{rank:1,quote:'a sensor',reason:'Listing description'}],
  }) } }], usage: { prompt_tokens: 9200, completion_tokens: 700, cost: 0.00164747,
    prompt_tokens_details: { cached_tokens: 20, cache_write_tokens: 9180, audio_tokens: 0, video_tokens: 0 } } };
  mutateEndpoint?.(endpoint); mutateReceipt?.(receipt);
  const fetcher = async (url, options) => {
    if (url.endsWith('/endpoints/zdr') && options.method === 'GET') return Response.json({ data: [{model_id:lunaRagModel,tag:'azure/us',safety_retention:false}] });
    if (url.endsWith('/endpoints') && options.method === 'GET') return Response.json({ data: {id:lunaRagModel,architecture:{tokenizer:'GPT'},endpoints:[endpoint]} });
    assert.equal(url,'https://openrouter.ai/api/v1/chat/completions'); assert.equal(options.method,'POST');
    events.push('post'); return Response.json(receipt);
  };
  const complete = createLunaRagCompletion({ apiKey: 'fixture', fetcher,
    ...(hosted ? {receiptPolicy:'hosted'} : {}), policyCurrent: async()=>true,
    dispatchCurrent:()=>true, claim:async()=>{events.push('claim');return true;} });
  const run = () => complete(input, async()=>{events.push('source');return sourceCurrent;}, new AbortController().signal);
  return {run,events};
}

test('hosted Azure cache-write/read usage above the old reservation is validated and never dispatched twice', async()=>{
  const f=fixture(); const result=await f.run();
  assert.deepEqual(result.usage,{inputTokens:9200,outputTokens:700,costNanoUsd:1647470});
  assert.deepEqual(f.events,['claim','source','post']); await assert.rejects(f.run(),{code:'not_admitted'});
  assert.deepEqual(f.events,['claim','source','post']);
});

test('local RAG still withholds a low-cost cached receipt and hosted RAG accepts the same receipt', async()=>{
  const mutateReceipt=r=>Object.assign(r.usage,{prompt_tokens:50,completion_tokens:12,cost:0.000008,
    prompt_tokens_details:{cached_tokens:30,cache_write_tokens:5}});
  const local=fixture({hosted:false,mutateReceipt});await assert.rejects(local.run(),{code:'outcome_unknown'});
  const hosted=fixture({mutateReceipt}); assert.equal((await hosted.run()).usage.costNanoUsd,8000);
});

test('unsafe prompt details, price, model, or tools withhold the receipt and cannot redispatch',async()=>{
  for(const mutateReceipt of [
    r=>{r.usage.prompt_tokens_details.cache_write_tokens=9181;},
    r=>{r.usage.prompt_tokens_details.cached_tokens=-1;},
    r=>{r.usage.prompt_tokens_details.cache_write_tokens=0.5;},
    r=>{r.usage.prompt_tokens_details.cached_tokens=Number.MAX_SAFE_INTEGER+1;},
    r=>{r.usage.prompt_tokens_details.audio_tokens=1;},
    r=>{r.usage.prompt_tokens_details.video_tokens=1;},
    r=>{r.usage.prompt_tokens_details.other=0;},
    r=>{r.usage.cost=(9200*138+700*550+1)/1e9;},
    r=>{r.model='other/model';},
    r=>{r.choices[0].message.tool_calls=[];},
  ]) {
    const f=fixture({mutateReceipt});await assert.rejects(f.run(),{code:'outcome_unknown'});
    await assert.rejects(f.run(),{code:'not_admitted'}); assert.deepEqual(f.events,['claim','source','post']);
  }
});

test('hosted dispatch requires verified bounded cache prices and a current source after the claim',async()=>{
  for(const key of ['input_cache_read','input_cache_write']){
    for(const rate of [undefined,'0.000000139','0.000000138000000000000000001','-0.1','not a price']){
      const f=fixture({mutateEndpoint:e=>{if(rate===undefined)delete e.pricing[key];else e.pricing[key]=rate;}});
      await assert.rejects(f.run(),{code:'not_admitted'});assert.deepEqual(f.events,[]);
    }
  }
  const f=fixture({sourceCurrent:false}); await assert.rejects(f.run(),{code:'not_admitted'});
  assert.deepEqual(f.events,['claim','source']);
});
