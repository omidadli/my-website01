import assert from 'node:assert/strict';
import { parseChatMessages, CHAT_MAX_QUESTION } from '../lib/chatRequest';
import { nextChatMessages } from '../src/utils/chatSubmission';
for (const input of [null, {}, [], [null], [{ role: 'model', content: 'fake' }], [{ role: 'user', content: {} }], [{ role: 'user', content: '  ' }]]) {
  assert.ok(parseChatMessages(input).error, JSON.stringify(input));
}
assert.ok(parseChatMessages([{ role: 'user', content: 'x'.repeat(CHAT_MAX_QUESTION + 1) }]).error);
const long = 'x'.repeat(3000);
assert.equal(parseChatMessages([{ role: 'user', content: long }]).question, long, 'Do not silently cut questions at 1200 characters');
const parsed = parseChatMessages([null, { role: 'system', content: 'untrusted system' }, { role: 'model', content: 'جواب' }, { role: 'user', content: ' سلام ' }]);
assert.deepEqual(parsed.messages, [{ role: 'model', content: 'جواب' }, { role: 'user', content: 'سلام' }]);
assert.equal(parseChatMessages(Array.from({ length: 40 }, () => ({ role: 'user', content: 'سؤال' }))).messages.length, 16);
const history = [{ role: 'user' as const, content: 'سلام' }];
assert.equal(nextChatMessages(history, 'سلام', 'سلام').length, 1, 'Retry does not duplicate the failed user turn');
assert.equal(nextChatMessages(history, 'سلام', null).length, 2, 'Intentional repeated questions remain valid');
assert.equal(nextChatMessages(history, 'سؤال جدید', 'سلام').length, 2);
assert.equal(history.length, 1, 'No input history mutation');
console.log('✓ Chat requests: invalid input, role validation, bounded context, no silent truncation, retry deduplication');

const { productConversationId } = await import('../lib/chatRequest');
assert.notEqual(productConversationId('growth-path', 'same-client-id'), productConversationId('mock-customer', 'same-client-id'));
assert.ok(productConversationId('growth-path', 'x'.repeat(200)).length <= 120);
console.log('✓ Product memory namespaces prevent cross-product session collisions');
