import assert from 'node:assert/strict';
import test from 'node:test';

import { readJsonWithLimit, redactSensitiveText } from './security-utils.js';

test('redacts credential, email, delivery ID, and local path patterns', () => {
  const email = ['alice', 'example.com'].join('@');
  const token = `ghp_${'a'.repeat(32)}`;
  const deliveryId = ['111111', '2222'].join('');
  const localPath = ['', 'Users', 'sample-user', 'project', '.env'].join('/');
  const input = [
    `email ${email}`,
    `token ${token}`,
    `Telegram chat_id: ${deliveryId}`,
    `path ${localPath}`
  ].join(' | ');
  const output = redactSensitiveText(input);

  assert.equal(output.includes(email), false);
  assert.equal(output.includes(token), false);
  assert.equal(output.includes(deliveryId), false);
  assert.equal(output.includes(localPath), false);
  assert.match(output, /\[redacted-email\]/);
  assert.match(output, /\[redacted-secret\]/);
  assert.match(output, /\[redacted-delivery-id\]/);
  assert.match(output, /\[redacted-local-path\]/);
});

test('preserves ordinary crypto builder content', () => {
  const input = 'Ethereum Pectra shipped. Read EIP-7702 and follow the source link.';

  assert.equal(redactSensitiveText(input), input);
});

test('rejects oversized API JSON responses', async () => {
  const response = new Response(JSON.stringify({ text: 'x'.repeat(128) }));

  await assert.rejects(readJsonWithLimit(response, 64), /exceeds 64 byte limit/);
});
