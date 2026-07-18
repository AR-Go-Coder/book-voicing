import fs from 'node:fs/promises';
import { XMLParser } from 'fast-xml-parser';
import { normalizeText } from './text.js';

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function flattenText(node) {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join(' ');
  if (typeof node === 'object') {
    return Object.entries(node)
      .filter(([key]) => !key.startsWith('@_') && key !== 'binary')
      .map(([, value]) => flattenText(value))
      .join(' ');
  }
  return '';
}

function sectionTitle(section, fallback) {
  const title = normalizeText(flattenText(section?.title));
  return title || fallback;
}

export async function parseFb2(filePath) {
  const xml = await fs.readFile(filePath, 'utf8');
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
  const bookTitle = normalizeText(flattenText(titleInfo['book-title'])) || 'Untitled book';

  const authors = asArray(titleInfo.author)
    .map((author) => normalizeText([
      flattenText(author['first-name']),
      flattenText(author['middle-name']),
      flattenText(author['last-name']),
    ].filter(Boolean).join(' ')))
    .filter(Boolean);

  const bodies = asArray(fictionBook.body);
  const chapters = [];
  let chapterNumber = 1;

  for (const body of bodies) {
    for (const section of asArray(body.section)) {
      const nested = asArray(section.section);
      if (nested.length > 0) {
        for (const child of nested) {
          const text = normalizeText(flattenText(child));
          if (!text) continue;
          chapters.push({
            title: sectionTitle(child, `Глава ${chapterNumber}`),
            text,
          });
          chapterNumber += 1;
        }
      } else {
        const text = normalizeText(flattenText(section));
        if (!text) continue;
        chapters.push({
          title: sectionTitle(section, `Глава ${chapterNumber}`),
          text,
        });
        chapterNumber += 1;
      }
    }
  }

  if (chapters.length === 0) {
    const text = normalizeText(flattenText(bodies));
    if (text) chapters.push({ title: 'Книга', text });
  }

  return {
    title: bookTitle,
    authors,
    chapters,
  };
}
