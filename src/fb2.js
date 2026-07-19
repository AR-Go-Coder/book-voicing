import fs from 'node:fs/promises';
import { XMLParser } from 'fast-xml-parser';
import { normalizeText } from './text.js';

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function removeInlineNotes(xml) {
  return xml
    .replace(/<a\b(?=[^>]*\btype\s*=\s*["']note["'])[^>]*>[\s\S]*?<\/a>/giu, ' ')
    .replace(/<a\b(?=[^>]*\bl:href\s*=\s*["']#n_[^"']+["'])[^>]*>[\s\S]*?<\/a>/giu, ' ');
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
  const title = normalizeText(titleText(section?.title));
  return title || fallback;
}

function collectLeafSections(section, chapters, counter) {
  const nested = asArray(section?.section);
  const ownText = normalizeText(flattenText(section));

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
  const xml = removeInlineNotes(sourceXml);
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
  const bookTitle = normalizeText(titleText(titleInfo['book-title'])) || 'Untitled book';

  const authors = asArray(titleInfo.author)
    .map((author) => normalizeText([
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
      const text = normalizeText(flattenText(body));
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
