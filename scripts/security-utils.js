const REDACTIONS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gi, '[redacted-secret]'],
  [/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, '[redacted-secret]'],
  [/\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g, '[redacted-secret]'],
  [/\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g, '[redacted-secret]'],
  [/\b\d{6,12}:[A-Za-z0-9_-]{20,}\b/g, '[redacted-secret]'],
  [/\bBearer\s+[A-Za-z0-9._~+/-]{12,}=*\b/gi, 'Bearer [redacted-secret]'],
  [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]'],
  [/(?:\/Users|\/home|\/root)\/[^\s"'<>]+/g, '[redacted-local-path]'],
  [/\b[A-Z]:\\Users\\[^\s"'<>]+/gi, '[redacted-local-path]'],
  [/\b(?:telegram\s+)?chat[_ -]?id\s*[:=]?\s*-?\d{6,16}\b/gi, '[redacted-delivery-id]']
];

function sizeError(maxBytes) {
  return new Error(`response exceeds ${maxBytes} byte limit`);
}

export function redactSensitiveText(value) {
  let output = String(value ?? '');
  for (const [pattern, replacement] of REDACTIONS) {
    output = output.replace(pattern, replacement);
  }
  return output;
}

export async function readTextWithLimit(response, maxBytes) {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    await response.body?.cancel().catch(() => {});
    throw sizeError(maxBytes);
  }

  if (!response.body) return '';

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => {});
        throw sizeError(maxBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

export async function readJsonWithLimit(response, maxBytes) {
  return JSON.parse(await readTextWithLimit(response, maxBytes));
}
