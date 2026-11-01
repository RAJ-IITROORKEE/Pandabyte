import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conversationRoute } from '../src/retrieval/conversation-route.ts';
const catalog = [{sku:'ESPX8266',title:'PandaByte x8266 WiFi Development Board'}];
test('greetings, capabilities and general explanation do not require a product', () => {
  for (const text of ['hi','what you can do actually','what can you do?','Explain a pull-up resistor','Write a Python loop']) assert.equal(conversationRoute(text,catalog).kind,'conversation',text);
});
test('product facts remain grounded, follow-up scoped, ambiguity asks for board', () => {
  assert.equal(conversationRoute('x8266 microcontroller?',catalog).kind,'resolved');
  assert.equal(conversationRoute('What about its flash?',catalog,'ESPX8266').kind,'resolved');
  assert.equal(conversationRoute('ESP32 board voltage?',catalog).kind,'clarification');
  assert.equal(conversationRoute('PandaByte custom board specs?',catalog).kind,'clarification');
  assert.equal(conversationRoute('Explain what WiFi means',catalog,'ESPX8266').kind,'conversation');
});
test('explicit manufacturer request selects bounded source route',()=>assert.equal(conversationRoute('According to Espressif what Wi-Fi does ESP32-C3 support?',catalog).kind,'manufacturer'));

test('capability wording cannot bypass an explicitly named product', () => {
  const products = [...catalog, { sku: 'ESPXC5', title: 'PandaByte xC5 ESP32-C5 Development Board' }];
  for (const text of [
    'What can you tell me about xC5 pins?',
    'What do you know about PandaByte xC5 supply voltage?',
    'Help me get started with xC5 wiring',
    'Who are you and what does the xC5 listing say?',
    'What are your capabilities for the xC5 board?',
  ]) assert.deepEqual(conversationRoute(text, products), { kind: 'resolved', productSku: 'ESPXC5' }, text);
  for (const text of ['What can you tell me about an ESP32 board?', 'Help me get started with PandaByte custom board specs']) {
    assert.equal(conversationRoute(text, products).kind, 'clarification', text);
  }
});

test('ordinary conversation mentioning a manufacturer does not request document lookup', () => {
  for (const text of ['Tell me a joke about Espressif', 'Who founded Espressif?']) {
    assert.equal(conversationRoute(text, catalog).kind, 'conversation', text);
  }
});
