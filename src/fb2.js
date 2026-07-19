import fs from 'node:fs/promises';
import { XMLParser } from 'fast-xml-parser';
import { normalizeText } from './text.js';

const COMMON_YO_FORMS = new Map([
  ['ученый', 'учёный'],
  ['ученого', 'учёного'],
  ['ученому', 'учёному'],
  ['ученым', 'учёным'],
  ['ученом', 'учёном'],
  ['ученые', 'учёные'],
  ['ученых', 'учёных'],
  ['учеными', 'учёными'],
]);

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function preserveCase(source, replacement) {
  if (source === source.toUpperCase()) return replacement.toUpperCase();
  if (source[0] === source[0].toUpperCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function restoreCommonYo(text) {
  return text.replace(/(?<![\p{L}\p{N}])учен(?:ый|ого|ому|ым|ом|ые|ых|ыми)(?![\p{L}\p{N}])/giu, (word) => {
    const replacement = COMMON_YO_FORMS.get(word.toLowerCase());
    return replacement ? preserveCase(word, replacement) : word;
  });
}

function normalizeBookText(value) {
  return restoreCommonYo(normalizeText(value));
}

function ensureBlockEndingPunctuation(xml, tagName) {
  const pattern = new RegExp(`<${tagName}\\b([^>]*)>([\\s\\S]*?)<\\/${tagName}>`, 'giu');
  return xml.replace(pattern, (match, attributes, content) => {
    const visibleText = content.replace(/<[^>]+>/gu, '').trim();
    if (!visibleText || /[.!?…:;”»\)]$/u.test(visibleText)) return match;
    return `<${tagName}${attributes}>${content}.</${tagName}>`;
  });
}

function prepareFb2Xml(xml) {
  let prepared = xml
    .replace(/<a\b(?=[^>]*\btype\s*=\s*["']note["'])[^>]*>[\s\S]*?<\/a>/giu, ' ')
    .replace(/<a\b(?=[^>]*\bl:href\s*=\s*["']#n_[^"']+["'])[^>]*>[\s\S]*?<\/a>/giu, ' ');

  // Attribution lines and epigraphs are separate semantic blocks. Without
  // punctuation fast-xml-parser flattens them into the following paragraph.
  prepared = ensureBlockEndingPunctuation(prepared, 'text-author');
  return prepared;
}

function flattenText(node) {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join(' ');
  if (typeof node === 'object') {
    return Object.entries(node)
      .filter(([key]) => !key.startsWith('@_') && key !== 'binary' && key !== 'section' && key !== 'title')
      .map(([, value]) => flattenText(value))
      .join(' ');
  }
  return '';
}

function titleText(node) {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(titleText).join(' ');
  if (typeof node === 'object') {
    return Object.entries(node)
      .filter(([key]) => !key.startsWith('@_') && key !== 'binary')
      .map(([, value]) => titleText(value))
      .join(' ');
  }
  return '';
}

function sectionTitle(section, fallback) {
  const title = normalizeBookText(titleText(section?.title));
  return title || fallback;
}

function collectLeafSections(section, chapters, counter) {
  const nested = asArray(section?.section);
  const ownText = normalizeBookText(flattenText(section));

  if (ownText) {
    chapters.push({
      title: sectionTitle(section, `Глава ${counter.value}`),
      text: ownText,
    });
    counter.value += 1;
  }

  for (const child of nested) collectLeafSections(child, chapters, counter);
}

export async function parseFb2(filePath) {
  const sourceXml = await fs.readFile(filePath, 'utf8');
  const xml = prepareFb2Xml(sourceXml);
  const parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    trimValues: true,
    parseTagValue: false,
    preserveOrder: false,
  });

  const parsed = parser.parse(xml);
  const fictionBook = parsed.FictionBook ?? parsed;
  const description = fictionBook.description ?? {};
  const titleInfo = description['title-info'] ?? {};
  const bookTitle = normalizeBookText(titleText(titleInfo['book-title'])) || 'Untitled book';

  const authors = asArray(titleInfo.author)
    .map((author) => normalizeBookText([
      titleText(author['first-name']),
      titleText(author['middle-name']),
      titleText(author['last-name']),
    ].filter(Boolean).join(' ')))
    .filter(Boolean);

  const bodies = asArray(fictionBook.body).filter((body) => body?.['@_name'] !== 'notes');
  const chapters = [];
  const counter = { value: 1 };

  for (const body of bodies) {
    const sections = asArray(body.section);
    if (sections.length === 0) {
      const text = normalizeBookText(flattenText(body));
      if (text) {
        chapters.push({ title: `Глава ${counter.value}`, text });
        counter.value += 1;
      }
      continue;
    }
    for (const section of sections) collectLeafSections(section, chapters, counter);
  }

  return {
    title: bookTitle,
    authors,
    chapters,
  };
}
