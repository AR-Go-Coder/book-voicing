function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const ONES = [
  'ноль', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять',
  'десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать',
  'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать',
];
const TENS = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
const HUNDREDS = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];
const ORDINAL_ENDINGS = {
  nominative: {
    1: 'первый', 2: 'второй', 3: 'третий', 4: 'четвёртый', 5: 'пятый', 6: 'шестой', 7: 'седьмой', 8: 'восьмой', 9: 'девятый',
    10: 'десятый', 11: 'одиннадцатый', 12: 'двенадцатый', 13: 'тринадцатый', 14: 'четырнадцатый', 15: 'пятнадцатый',
    16: 'шестнадцатый', 17: 'семнадцатый', 18: 'восемнадцатый', 19: 'девятнадцатый', 20: 'двадцатый', 30: 'тридцатый',
    40: 'сороковой', 50: 'пятидесятый', 60: 'шестидесятый', 70: 'семидесятый', 80: 'восьмидесятый', 90: 'девяностый',
    100: 'сотый', 200: 'двухсотый', 300: 'трёхсотый', 400: 'четырёхсотый', 500: 'пятисотый', 600: 'шестисотый',
    700: 'семисотый', 800: 'восьмисотый', 900: 'девятисотый', 1000: 'тысячный', 2000: 'двухтысячный',
  },
};

function declineOrdinal(word, grammaticalCase) {
  if (grammaticalCase === 'nominative') return word;
  if (word === 'третий') return grammaticalCase === 'genitive' ? 'третьего' : 'третьем';
  if (word.endsWith('ий')) return grammaticalCase === 'genitive' ? `${word.slice(0, -2)}его` : `${word.slice(0, -2)}ем`;
  if (word.endsWith('ый') || word.endsWith('ой')) return grammaticalCase === 'genitive' ? `${word.slice(0, -2)}ого` : `${word.slice(0, -2)}ом`;
  return word;
}

function underThousandToWords(value) {
  const parts = [];
  const hundreds = Math.floor(value / 100);
  const remainder = value % 100;
  if (hundreds) parts.push(HUNDREDS[hundreds]);
  if (remainder < 20) {
    if (remainder) parts.push(ONES[remainder]);
  } else {
    parts.push(TENS[Math.floor(remainder / 10)]);
    if (remainder % 10) parts.push(ONES[remainder % 10]);
  }
  return parts.join(' ');
}

function numberToWords(value) {
  if (!Number.isInteger(value) || value < 0 || value > 999999) return String(value);
  if (value < 1000) return underThousandToWords(value) || ONES[0];

  const thousands = Math.floor(value / 1000);
  const remainder = value % 1000;
  const parts = [];
  if (thousands === 1) parts.push('одна тысяча');
  else if (thousands === 2) parts.push('две тысячи');
  else {
    const tail = thousands % 100;
    const last = thousands % 10;
    const form = tail >= 11 && tail <= 19 ? 'тысяч' : last === 1 ? 'тысяча' : [2, 3, 4].includes(last) ? 'тысячи' : 'тысяч';
    parts.push(`${underThousandToWords(thousands)} ${form}`);
  }
  if (remainder) parts.push(underThousandToWords(remainder));
  return parts.join(' ');
}

function yearToWords(year, grammaticalCase = 'nominative') {
  if (!Number.isInteger(year) || year < 1000 || year > 2999) return numberToWords(year);
  if (ORDINAL_ENDINGS.nominative[year]) return declineOrdinal(ORDINAL_ENDINGS.nominative[year], grammaticalCase);

  const components = [];
  const thousands = Math.floor(year / 1000) * 1000;
  let remainder = year % 1000;
  components.push(thousands === 1000 ? 'тысяча' : thousands === 2000 ? 'две тысячи' : numberToWords(thousands));

  const hundreds = Math.floor(remainder / 100) * 100;
  remainder %= 100;
  if (hundreds) components.push(HUNDREDS[hundreds / 100]);

  let ordinalValue;
  if (remainder === 0) ordinalValue = hundreds;
  else if (remainder < 20 || remainder % 10 === 0) ordinalValue = remainder;
  else {
    components.push(TENS[Math.floor(remainder / 10)]);
    ordinalValue = remainder % 10;
  }

  const ordinal = ORDINAL_ENDINGS.nominative[ordinalValue];
  if (!ordinal) return numberToWords(year);
  if (remainder === 0 && hundreds) components.pop();
  components.push(declineOrdinal(ordinal, grammaticalCase));
  return components.join(' ');
}

export function normalizeNumbers(text) {
  return text
    .replace(/\bв\s+(\d{4})\s+году\b/giu, (_, year) => `в ${yearToWords(Number(year), 'prepositional')} году`)
    .replace(/\b(\d{4})\s+года\b/giu, (_, year) => `${yearToWords(Number(year), 'genitive')} года`)
    .replace(/\b(\d{4})\s+год\b/giu, (_, year) => `${yearToWords(Number(year), 'nominative')} год`)
    .replace(/\b(1\d{3}|2\d{3})\b/gu, (_, year) => yearToWords(Number(year), 'nominative'))
    .replace(/\b\d{1,6}\b/gu, (number) => numberToWords(Number(number)));
}

function cleanServiceSymbols(text) {
  return text
    .replace(/[©®™℠]/gu, ' ')
    .replace(/[•·▪▫◦‣⁃◆◇■□●○★☆]/gu, ' ')
    .replace(/[†‡※§¶]/gu, ' ')
    .replace(/[*_~^|\\/]+/gu, ' ')
    .replace(/[<>={}]+/gu, ' ')
    .replace(/-{3,}/gu, ' - ')
    .replace(/\.{4,}/gu, '…')
    .replace(/([!?]){2,}/gu, '$1')
    .replace(/[,;:]{2,}/gu, (marks) => marks[0])
    .replace(/[\u200B-\u200D\u2060\uFEFF]/gu, ' ');
}

export function normalizeText(value) {
  const cleaned = cleanServiceSymbols(String(value ?? '')
    .normalize('NFC')
    .replace(/\[\s*\d+\s*\]/g, ' ')
    .replace(/\u00a0/g, ' '))
    .replace(/[ \t]+/g, ' ')
    .replace(/[–—]/g, ' - ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s+([,.;:!?…])/g, '$1')
    .replace(/([,.;:!?…])(?=[А-ЯA-ZЁ«"“„])/gu, '$1 ')
    .trim();
  return normalizeNumbers(cleaned);
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
