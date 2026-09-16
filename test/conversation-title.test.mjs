import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { conversationTitle } from '../public/conversation-title.js';
import { sanitizeUsageForMesh } from '../src/mesh-privacy.mjs';

test('missing and archived titles retain the exact legacy Mesh identifier', () => {
  for (const id of ['session-1', '01a0a9ae-dace-77f1-abb0-93c24e785301', 'é'.repeat(28), 'x'.repeat(64), 'x'.repeat(256)]) {
    const expected = `Conversation ${createHash('sha256').update(id).digest('hex').slice(0, 8)}`;
    for (const title of [undefined, null, '', '  ', 'Conversation sans titre']) {
      assert.equal(conversationTitle({ id, title }), expected);
      assert.equal(conversationTitle({ id: `node:${id}`, sourceSessionId: id, title }), expected);
    }
  }
});

test('available titles and existing anonymous labels remain unchanged', () => {
  for (const title of ['Archived but still named', 'Conversation abcdef12', '<script>example</script>']) {
    assert.equal(conversationTitle({ id: 'session-1', title }), title);
  }
});

test('title sharing falls back to the same label as title exclusion', () => {
  const data = { sessions: [{id: 'archived', title: 'Conversation sans titre'}] };
  const hidden = sanitizeUsageForMesh(data);
  const shared = sanitizeUsageForMesh(data, { includeTitles: true });
  assert.equal(shared.sessions[0].title, hidden.sessions[0].title);
});
