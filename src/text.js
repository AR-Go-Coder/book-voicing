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

const LETTER_NAMES = {
  А: 'а', Б: 'бэ', В: 'вэ', Г: 'гэ', Д: 'дэ', Е: 'е', Ё: 'ё', Ж: 'жэ', З: 'зэ', И: 'и', Й: 'и краткое',
  К: 'ка', Л: 'эл', М: 'эм', Н: 'эн', О: 'о', П: 'пэ', Р: 'эр', С: 'эс', Т: 'тэ', У: 'у', Ф: 'эф',
  Х: 'ха', Ц: 'цэ', Ч: 'че', Ш: 'ша', Щ: 'ща', Ъ: 'твёрдый знак', Ы: 'ы', Ь: 'мягкий знак', Э: 'э', Ю: 'ю', Я: 'я',
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

const GENITIVE_ONES = [
  'нуля', 'одного', 'двух', 'трёх', 'четырёх', 'пяти', 'шести', 'семи', 'восьми', 'девяти',
  'десяти', 'одиннадцати', 'двенадцати', 'тринадцати', 'четырнадцати', 'пятнадцати',
  'шестнадцати', 'семнадцати', 'восемнадцати', 'девятнадцати',
];
const GENITIVE_TENS = ['', '', 'двадцати', 'тридцати', 'сорока', 'пятидесяти', 'шестидесяти', 'семидесяти', 'восьмидесяти', 'девяноста'];

function numberToGenitiveWords(value) {
  if (!Number.isInteger(value) || value < 0 || value > 99) return numberToWords(value);
  if (value < 20) return GENITIVE_ONES[value];
  const parts = [GENITIVE_TENS[Math.floor(value / 10)]];
  if (value % 10) parts.push(GENITIVE_ONES[value % 10]);
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

function romanToInteger(roman) {
  const values = { I: 1, V: 5, X: 10, L: 50, C: 100 };
  let total = 0;
  let previous = 0;
  for (const symbol of roman.toUpperCase().split('').reverse()) {
    const current = values[symbol] ?? 0;
    total += current < previous ? -current : current;
    previous = Math.max(previous, current);
  }
  return total;
}

function ordinalToWords(value, grammaticalCase = 'nominative') {
  if (!Number.isInteger(value) || value < 1 || value > 99) return numberToWords(value);
  const direct = ORDINAL_ENDINGS.nominative[value];
  if (direct) return declineOrdinal(direct, grammaticalCase);
  const tens = Math.floor(value / 10) * 10;
  const ones = value % 10;
  const last = ORDINAL_ENDINGS.nominative[ones];
  return `${TENS[tens / 10]} ${declineOrdinal(last, grammaticalCase)}`;
}

function spellAbbreviation(value) {
  return value
    .replace(/[.-]/gu, '')
    .split('')
    .map((letter) => LETTER_NAMES[letter.toUpperCase()] ?? letter)
    .join(' ');
}

function normalizeLatin(text, mode) {
  if (mode === 'remove') return text.replace(/\b[A-Za-z][A-Za-z.-]*\b/gu, ' ');
  if (mode === 'spell') {
    return text.replace(/\b[A-Z]{2,}\b/g, (word) => word.toLowerCase().split('').join('-'));
  }
  return text;
}

export function normalizeNumbers(text) {
  return text
    .replace(/(?<![\p{L}\p{N}])(\d{4})\s*[-–—]\s*(\d{4})(?![\p{L}\p{N}])/gu, (_, from, to) => `с ${yearToWords(Number(from), 'genitive')} по ${yearToWords(Number(to), 'nominative')}`)
    .replace(/(?<![\p{L}\p{N}])(\d{1,2})\s*[-–—]\s*(\d{1,2})(?![\p{L}\p{N}])/gu, (_, from, to) => `от ${numberToGenitiveWords(Number(from))} до ${numberToGenitiveWords(Number(to))}`)
    .replace(/(?<![\p{L}\p{N}])(\d{1,6})[,.](\d+)\s*%/gu, (_, whole, fraction) => `${numberToWords(Number(whole))} и ${numberToWords(Number(fraction))} десятых процента`)
    .replace(/(?<![\p{L}\p{N}])(\d{1,6})\s*%/gu, (_, number) => `${numberToWords(Number(number))} процентов`)
    .replace(/(?<![\p{L}\p{N}])в\s+(\d{4})\s+году(?![\p{L}\p{N}])/giu, (_, year) => `в ${yearToWords(Number(year), 'prepositional')} году`)
    .replace(/(?<![\p{L}\p{N}])(\d{4})\s+года(?![\p{L}\p{N}])/giu, (_, year) => `${yearToWords(Number(year), 'genitive')} года`)
    .replace(/(?<![\p{L}\p{N}])(\d{4})\s+год(?![\p{L}\p{N}])/giu, (_, year) => `${yearToWords(Number(year), 'nominative')} год`)
    .replace(/(?<![\p{L}\p{N}])(1\d{3}|2\d{3})(?![\p{L}\p{N}])/gu, (_, year) => yearToWords(Number(year), 'nominative'))
    .replace(/(?<![\p{L}\p{N}])\d{1,6}(?![\p{L}\p{N}])/gu, (number) => numberToWords(Number(number)));
}

function normalizeRomanNumerals(text) {
  return text
    .replace(/(?<![A-Za-zА-Яа-яЁё])([IVXL]{1,7})\s+(век(?:а|е|ов)?|столет(?:ие|ия|ии|ий))(?![A-Za-zА-Яа-яЁё])/giu, (_, roman, noun) => {
      const grammaticalCase = /(?:е|ии)$/iu.test(noun) ? 'prepositional' : /(?:а|ов|ий)$/iu.test(noun) ? 'genitive' : 'nominative';
      return `${ordinalToWords(romanToInteger(roman), grammaticalCase)} ${noun}`;
    })
    .replace(/(?<![\p{L}\p{N}])(глава|том|часть|книга)\s+([IVXL]{1,7})(?![\p{L}\p{N}])/giu, (_, noun, roman) => `${noun} ${ordinalToWords(romanToInteger(roman))}`);
}

function normalizeAbbreviations(text) {
  return text
    .replace(/(?<![\p{L}\p{N}])[А-ЯЁ](?:\s*[-.]\s*[А-ЯЁ])+(?![\p{L}\p{N}])/gu, (value) => spellAbbreviation(value))
    .replace(/(?<![\p{L}\p{N}])[А-ЯЁ]{2,6}(?![\p{L}\p{N}])/gu, (value) => spellAbbreviation(value));
}

function cleanServiceSymbols(text) {
  return text
    .replace(/[©®™℠]/gu, ' ')
    .replace(/[•·▪▫◦‣⁃◆◇■□●○★☆]/gu, ' ')
    .replace(/[†‡※§¶]/gu, ' ')
    .replace(/[*_~^|\\/]+/gu, ' ')
    .replace(/[<>{}=]+/gu, ' ')
    .replace(/-{3,}/gu, ' - ')
    .replace(/\.{4,}/gu, '…')
    .replace(/([!?]){2,}/gu, '$1')
    .replace(/[,;:]{2,}/gu, (marks) => marks[0])
    .replace(/[\u200B-\u200D\u2060\uFEFF]/gu, ' ');
}

function normalizeBookPunctuation(text) {
  return text
    .replace(/\s+([,.;:!?…])/gu, '$1')
    .replace(/([,.;:!?…])(?=[А-ЯA-ZЁ«"“„])/gu, '$1 ')
    .replace(/\s*[-–—]\s*/gu, ' - ')
    .replace(/(^|\n)\s*-\s*/gu, '$1- ')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function bookCleanup(value, { latinMode = 'keep' } = {}) {
  let text = String(value ?? '').normalize('NFC');
  text = text
    .replace(/\[\s*\d+\s*\]/gu, ' ')
    .replace(/\u00a0/gu, ' ');
  text = cleanServiceSymbols(text);
  text = normalizeRomanNumerals(text);
  text = normalizeAbbreviations(text);
  text = normalizeLatin(text, latinMode);
  text = normalizeNumbers(text);
  return normalizeBookPunctuation(text);
}

export function normalizeText(value, options = {}) {
  return bookCleanup(value, options);
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
  const dialogueAware = paragraph.replace(/([.!?…])\s+-\s+(?=[А-ЯЁ])/gu, '$1\n');
  const sentences = dialogueAware
    .split(/\n|(?<=[.!?…])\s+(?=[А-ЯA-ZЁ«"“„-])/u)
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
