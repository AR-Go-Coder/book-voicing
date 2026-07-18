export function normalizeText(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}

export function chunkText(text, maxChars = 850) {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const sentences = normalized
    .split(/(?<=[.!?…])\s+(?=[А-ЯA-ZЁ«"“„])/u)
    .map((item) => item.trim())
    .filter(Boolean);

  const chunks = [];
  let current = '';

  for (const sentence of sentences) {
    if (sentence.length > maxChars) {
      if (current) {
        chunks.push(current);
        current = '';
      }

      const parts = sentence.match(new RegExp(`.{1,${maxChars}}(?:\\s|$)`, 'gu')) ?? [sentence];
      for (const part of parts) {
        const cleaned = part.trim();
        if (cleaned) chunks.push(cleaned);
      }
      continue;
    }

    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current) chunks.push(current);
      current = sentence;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}
