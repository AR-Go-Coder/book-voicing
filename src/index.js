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
const pad = (value, width = 4) => String(value).padStart(width, '0');

function slugify(value) {
  return value.normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'book';
}

async function exists(filePath) {
  try { await fs.access(filePath); return true; } catch { return false; }
}

function runPython(args) {
  const python = process.platform === 'win32' ? path.resolve('.venv/Scripts/python.exe') : path.resolve('.venv/bin/python');
  return new Promise((resolve, reject) => {
    const child = spawn(python, args, { stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`Python process exited with code ${code}`)));
  });
}

async function main() {
  const inputPath = path.resolve(options.input);
  const voicePath = options.voice ? path.resolve(options.voice) : null;
  const chunkSize = Number.parseInt(options.chunkSize, 10);
  const limit = options.limit ? Number.parseInt(options.limit, 10) : null;
  if (!Number.isInteger(chunkSize) || chunkSize < 200) throw new Error('--chunk-size must be an integer of at least 200');
  if (!(await exists(inputPath))) throw new Error(`Input file not found: ${inputPath}`);
  if (voicePath && !(await exists(voicePath))) throw new Error(`Voice file not found: ${voicePath}`);

  const book = await parseFb2(inputPath);
  const bookDir = path.resolve(options.output, slugify(book.title));
  const chunksDir = path.join(bookDir, 'chunks');
  await fs.mkdir(chunksDir, { recursive: true });

  const manifest = { title: book.title, authors: book.authors, source: inputPath, createdAt: new Date().toISOString(), chapters: [] };
  const pending = [];
  let globalIndex = 1;
  let selected = 0;

  console.log(`Book: ${book.title}`);
  console.log(`Chapters: ${book.chapters.length}`);

  outer:
  for (let chapterIndex = 0; chapterIndex < book.chapters.length; chapterIndex += 1) {
    const chapter = book.chapters[chapterIndex];
    const chapterManifest = { title: chapter.title, chunks: [] };
    manifest.chapters.push(chapterManifest);

    const chunks = chunkText(chapter.text, chunkSize);
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
      if (limit !== null && selected >= limit) break outer;
      const basename = `${pad(globalIndex)}-chapter-${pad(chapterIndex + 1, 3)}-part-${pad(chunkIndex + 1, 3)}`;
      const textPath = path.join(chunksDir, `${basename}.txt`);
      const wavPath = path.join(chunksDir, `${basename}.wav`);
      await fs.writeFile(textPath, `${chunks[chunkIndex]}\n`, 'utf8');
      chapterManifest.chunks.push({ text: path.relative(bookDir, textPath), audio: path.relative(bookDir, wavPath) });

      if (!options.overwrite && await exists(wavPath)) console.log(`[skip] ${path.basename(wavPath)}`);
      else pending.push({ textFile: textPath, output: wavPath });

      globalIndex += 1;
      selected += 1;
    }
  }

  const manifestPath = path.join(bookDir, 'manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  if (pending.length > 0) {
    const jobPath = path.join(bookDir, 'job.json');
    await fs.writeFile(jobPath, JSON.stringify({
      language: 'ru', voice: voicePath, exaggeration: Number(options.exaggeration), cfgWeight: Number(options.cfgWeight), items: pending,
    }, null, 2), 'utf8');
    console.log(`Generating ${pending.length} chunks. The model will be loaded once.`);
    await runPython(['python/batch_tts.py', '--job', jobPath]);
  } else {
    console.log('Nothing to generate. All selected chunks already exist.');
  }

  console.log(`Done. Output: ${bookDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
