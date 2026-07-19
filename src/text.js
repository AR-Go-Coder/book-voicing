function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFC')
    .replace(/\[\s*\d+\s*\]/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/[–—]/g, ' - ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s+([,.;:!?…])/g, '$1')
    .replace(/([,.;:!?…])(?=[А-ЯA-ZЁ«"“„])/gu, '$1 ')
    .trim();
}

export function applyStressDictionary(text, dictionary = {}) {
  let result = text;
  const entries = Object.entries(dictionary)
    .filter(([source, replacement]) => source && replacement)
    .sort(([left], [right]) => right.length - left.length);

  for (const [source, replacement] of entries) {
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(source)}(?![\\p{L}\\p{N}])`, 'giu');
    result = result.replace(pattern, replacement);
  }
  return result;
}

function splitLongSentence(sentence, maxChars) {
  const parts = [];
  let remaining = sentence.trim();

  while (remaining.length > maxChars) {
    const window = remaining.slice(0, maxChars + 1);
    const candidates = [
      window.lastIndexOf('; '),
      window.lastIndexOf(': '),
      window.lastIndexOf(', '),
      window.lastIndexOf(' - '),
      window.lastIndexOf(' '),
    ];
    const splitAt = Math.max(...candidates);
    const cut = splitAt >= Math.floor(maxChars * 0.55) ? splitAt + 1 : maxChars;
    parts.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }

  if (remaining) parts.push(remaining);
  return parts;
}

function splitParagraph(paragraph, maxChars) {
  const sentences = paragraph
    .split(/(?<=[.!?…])\s+(?=[А-ЯA-ZЁ«"“„-])/u)
    .map((item) => item.trim())
    .filter(Boolean);

  const result = [];
  for (const sentence of sentences) {
    if (sentence.length <= maxChars) result.push(sentence);
    else result.push(...splitLongSentence(sentence, maxChars));
  }
  return result;
}

export function chunkText(text, maxChars = 350) {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const paragraphs = normalized
    .split(/\n+/u)
    .map((item) => item.trim())
    .filter(Boolean);

  const chunks = [];
  let current = '';

  const flush = () => {
    if (current) chunks.push(current.trim());
    current = '';
  };

  for (const paragraph of paragraphs) {
    const units = splitParagraph(paragraph, maxChars);
    const isDialogue = /^[«"“„-]/u.test(paragraph);

    if (isDialogue) flush();

    for (const unit of units) {
      const candidate = current ? `${current} ${unit}` : unit;
      if (candidate.length <= maxChars) {
        current = candidate;
      } else {
        flush();
        current = unit;
      }
    }

    if (isDialogue || current.length >= Math.floor(maxChars * 0.72)) flush();
  }

  flush();
  return chunks;
}
