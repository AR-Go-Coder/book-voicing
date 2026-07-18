import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Command } from 'commander';
import { parseFb2 } from './fb2.js';
import { chunkText } from './text.js';

const program = new Command();
program
  .requiredOption('-i, --input <path>', 'FB2 file')
  .option('-v, --voice <path>', 'Reference WAV file')
  .option('-o, --output <path>', 'Output directory', 'output')
  .option('--chunk-size <number>', 'Maximum chunk length', '850')
  .option('--limit <number>', 'Generate only first N chunks')
  .option('--overwrite', 'Overwrite existing WAV files', false)
  .option('--exaggeration <number>', 'Chatterbox exaggeration', '0.5')
  .option('--cfg-weight <number>', 'Chatterbox CFG weight', '0.5')
  .parse();

const options = program.opts();

function slugify(value) {
  return value
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'book';
}

function pad(value, width = 4) {
  return String(value).padStart(width, '0');
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function runPython(args) {
  const python = process.platform === 'win32'
    ? path.resolve('.venv/Scripts/python.exe')
    : path.resolve('.venv/bin/python');

  return new Promise((resolve, reject) => {
    const child = spawn(python, args, { stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Python process exited with code ${code}`));
    });
  });
}

async function main() {
  const inputPath = path.resolve(options.input);
  const voicePath = options.voice ? path.resolve(options.voice) : null;
  const chunkSize = Number.parseInt(options.chunkSize, 10);
  const limit = options.limit ? Number.parseInt(options.limit, 10) : null;

  if (!Number.isInteger(chunkSize) || chunkSize < 200) {
    throw new Error('--chunk-size must be an integer of at least 200');
  }
  if (!(await exists(inputPath))) throw new Error(`Input file not found: ${inputPath}`);
  if (voicePath && !(await exists(voicePath))) throw new Error(`Voice file not found: ${voicePath}`);

  const book = await parseFb2(inputPath);
  const bookDir = path.resolve(options.output, slugify(book.title));
  const chunksDir = path.join(bookDir, 'chunks');
  await fs.mkdir(chunksDir, { recursive: true });

  const manifest = {
    title: book.title,
    authors: book.authors,
    source: inputPath,
    createdAt: new Date().toISOString(),
    chapters: [],
  };

  let globalIndex = 1;
  let generated = 0;

  console.log(`Book: ${book.title}`);
  console.log(`Chapters: ${book.chapters.length}`);

  outer:
  for (let chapterIndex = 0; chapterIndex < book.chapters.length; chapterIndex += 1) {
    const chapter = book.chapters[chapterIndex];
    const chunks = chunkText(chapter.text, chunkSize);
    const chapterManifest = { title: chapter.title, chunks: [] };
    manifest.chapters.push(chapterManifest);

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
      if (limit !== null && generated >= limit) break outer;

      const basename = `${pad(globalIndex)}-chapter-${pad(chapterIndex + 1, 3)}-part-${pad(chunkIndex + 1, 3)}`;
      const textPath = path.join(chunksDir, `${basename}.txt`);
      const wavPath = path.join(chunksDir, `${basename}.wav`);
      const text = chunks[chunkIndex];

      await fs.writeFile(textPath, `${text}\n`, 'utf8');
      chapterManifest.chunks.push({ text: path.relative(bookDir, textPath), audio: path.relative(bookDir, wavPath) });

      if (!options.overwrite && await exists(wavPath)) {
        console.log(`[skip] ${path.basename(wavPath)}`);
      } else {
        console.log(`[voice] ${globalIndex}: ${chapter.title}`);
        const args = [
          'python/tts.py',
          '--text-file', textPath,
          '--output', wavPath,
          '--language', 'ru',
          '--exaggeration', String(options.exaggeration),
          '--cfg-weight', String(options.cfgWeight),
        ];
        if (voicePath) args.push('--voice', voicePath);
        await runPython(args);
      }

      globalIndex += 1;
      generated += 1;
      await fs.writeFile(path.join(bookDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    }
  }

  await fs.writeFile(path.join(bookDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`Done. Output: ${bookDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
