import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Command } from 'commander';
import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { parseFb2 } from './fb2.js';
import { applyStressDictionary, chunkText } from './text.js';

const program = new Command();
program
  .requiredOption('-i, --input <path>', 'FB2 file')
  .option('-v, --voice <path>', 'Reference WAV file')
  .option('-o, --output <path>', 'Output directory', 'output')
  .option('--chunk-size <number>', 'Maximum chunk length', '350')
  .option('--limit <number>', 'Generate only first N chunks')
  .option('--overwrite', 'Overwrite existing WAV files', false)
  .option('--stress-dictionary <path>', 'JSON dictionary with manual stress overrides', 'config/stress-dictionary.json')
  .option('--exaggeration <number>', 'Chatterbox exaggeration', '0.25')
  .option('--cfg-weight <number>', 'Chatterbox CFG weight', '0.3')
  .option('--temperature <number>', 'Sampling temperature', '0.72')
  .option('--repetition-penalty <number>', 'Sampling repetition penalty', '1.3')
  .option('--min-p <number>', 'Sampling min-p', '0.05')
  .option('--top-p <number>', 'Sampling top-p', '0.95')
  .option('--retries <number>', 'Retries for suspicious audio chunks', '2')
  .option('--bitrate <value>', 'M4B AAC bitrate', '96k')
  .option('--no-m4b', 'Generate WAV chunks only')
  .parse();

const options = program.opts();
const pad = (value, width = 4) => String(value).padStart(width, '0');

function slugify(value) {
  return value.normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'book';
}

async function exists(filePath) {
  try { await fs.access(filePath); return true; } catch { return false; }
}

async function readJsonIfExists(filePath, fallback) {
  if (!(await exists(filePath))) return fallback;
  const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
}

function run(command, args, { capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit' });
    let stdout = '';
    if (capture) child.stdout.setEncoding('utf8').on('data', (data) => { stdout += data; });
    child.once('error', reject);
    child.once('exit', (code) => code === 0
      ? resolve(stdout)
      : reject(new Error(`${path.basename(command)} exited with code ${code}`)));
  });
}

function pythonPath() {
  return process.platform === 'win32'
    ? path.resolve('.venv/Scripts/python.exe')
    : path.resolve('.venv/bin/python');
}

function concatEntry(filePath) {
  return `file '${path.resolve(filePath).replaceAll('\\', '/').replaceAll("'", "'\\''")}'`;
}

function metadataValue(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll('=', '\\=').replaceAll(';', '\\;').replaceAll('#', '\\#').replaceAll('\n', ' ');
}

async function durationSeconds(filePath) {
  const output = await run(ffprobeStatic.path, [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath,
  ], { capture: true });
  const duration = Number.parseFloat(output.trim());
  if (!Number.isFinite(duration) || duration <= 0) throw new Error(`Cannot read audio duration: ${filePath}`);
  return duration;
}

async function buildM4b(book, bookDir, manifest, audioFiles, bitrate) {
  if (!ffmpegPath || !ffprobeStatic?.path) throw new Error('Bundled ffmpeg or ffprobe executable is unavailable. Run npm install again.');
  if (audioFiles.length === 0) throw new Error('No WAV chunks available for M4B assembly.');

  const workDir = path.join(bookDir, '.work');
  await fs.mkdir(workDir, { recursive: true });
  const concatPath = path.join(workDir, 'concat.txt');
  const mergedWav = path.join(workDir, 'merged.wav');
  const metadataPath = path.join(workDir, 'chapters.ffmeta');
  const outputPath = path.join(bookDir, `${slugify(book.title)}.m4b`);

  await fs.writeFile(concatPath, `${audioFiles.map(concatEntry).join('\n')}\n`, 'utf8');
  console.log('Combining WAV chunks...');
  await run(ffmpegPath, ['-y', '-hide_banner', '-loglevel', 'warning', '-f', 'concat', '-safe', '0', '-i', concatPath, '-c', 'copy', mergedWav]);

  const durations = [];
  for (const filePath of audioFiles) durations.push(await durationSeconds(filePath));

  const lines = [';FFMETADATA1', `title=${metadataValue(book.title)}`];
  if (book.authors.length > 0) lines.push(`artist=${metadataValue(book.authors.join(', '))}`);

  let cursor = 0;
  let audioIndex = 0;
  for (const chapter of manifest.chapters) {
    if (chapter.chunks.length === 0) continue;
    const start = cursor;
    for (let index = 0; index < chapter.chunks.length; index += 1) {
      cursor += durations[audioIndex];
      audioIndex += 1;
    }
    lines.push('', '[CHAPTER]', 'TIMEBASE=1/1000', `START=${Math.round(start * 1000)}`, `END=${Math.round(cursor * 1000)}`, `title=${metadataValue(chapter.title)}`);
  }
  await fs.writeFile(metadataPath, `${lines.join('\n')}\n`, 'utf8');

  console.log('Encoding M4B with chapter markers...');
  await run(ffmpegPath, [
    '-y', '-hide_banner', '-loglevel', 'warning',
    '-i', mergedWav, '-i', metadataPath,
    '-map', '0:a', '-map_metadata', '1', '-map_chapters', '1',
    '-c:a', 'aac', '-b:a', bitrate, '-movflags', '+faststart',
    outputPath,
  ]);

  await fs.rm(workDir, { recursive: true, force: true });
  return outputPath;
}

function numberOption(name, value, { min, max, integer = false }) {
  const parsed = integer ? Number.parseInt(value, 10) : Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max || (integer && !Number.isInteger(parsed))) {
    throw new Error(`--${name} must be ${integer ? 'an integer' : 'a number'} between ${min} and ${max}`);
  }
  return parsed;
}

async function main() {
  const inputPath = path.resolve(options.input);
  const voicePath = options.voice ? path.resolve(options.voice) : null;
  const dictionaryPath = path.resolve(options.stressDictionary);
  const chunkSize = numberOption('chunk-size', options.chunkSize, { min: 180, max: 700, integer: true });
  const limit = options.limit ? numberOption('limit', options.limit, { min: 1, max: 1_000_000, integer: true }) : null;
  const retries = numberOption('retries', options.retries, { min: 0, max: 5, integer: true });
  const exaggeration = numberOption('exaggeration', options.exaggeration, { min: 0, max: 2 });
  const cfgWeight = numberOption('cfg-weight', options.cfgWeight, { min: 0, max: 1 });
  const temperature = numberOption('temperature', options.temperature, { min: 0.2, max: 1.5 });
  const repetitionPenalty = numberOption('repetition-penalty', options.repetitionPenalty, { min: 1, max: 2 });
  const minP = numberOption('min-p', options.minP, { min: 0, max: 1 });
  const topP = numberOption('top-p', options.topP, { min: 0.1, max: 1 });

  if (!(await exists(inputPath))) throw new Error(`Input file not found: ${inputPath}`);
  if (voicePath && !(await exists(voicePath))) throw new Error(`Voice file not found: ${voicePath}`);
  if (!(await exists(pythonPath()))) throw new Error('Project Python environment is missing. Run scripts/setup-windows.ps1 first.');

  const stressDictionary = await readJsonIfExists(dictionaryPath, {});
  const book = await parseFb2(inputPath);
  if (book.chapters.length === 0) throw new Error('No readable chapters found in the FB2 file.');
  const bookDir = path.resolve(options.output, slugify(book.title));
  const chunksDir = path.join(bookDir, 'chunks');
  await fs.mkdir(chunksDir, { recursive: true });

  const manifest = {
    version: 2,
    title: book.title,
    authors: book.authors,
    source: inputPath,
    stressDictionary: await exists(dictionaryPath) ? dictionaryPath : null,
    updatedAt: new Date().toISOString(),
    chapters: [],
  };
  const pending = [];
  const audioFiles = [];
  let globalIndex = 1;
  let selected = 0;

  console.log(`Book: ${book.title}`);
  console.log(`Authors: ${book.authors.join(', ') || 'Unknown'}`);
  console.log(`Chapters: ${book.chapters.length}`);
  console.log(`Stress overrides: ${Object.keys(stressDictionary).length}`);

  outer:
  for (let chapterIndex = 0; chapterIndex < book.chapters.length; chapterIndex += 1) {
    const chapter = book.chapters[chapterIndex];
    const chapterManifest = { title: chapter.title, chunks: [] };
    const preparedText = applyStressDictionary(chapter.text, stressDictionary);
    const chunks = chunkText(preparedText, chunkSize);

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
      if (limit !== null && selected >= limit) break outer;
      const basename = `${pad(globalIndex)}-chapter-${pad(chapterIndex + 1, 3)}-part-${pad(chunkIndex + 1, 3)}`;
      const textPath = path.join(chunksDir, `${basename}.txt`);
      const wavPath = path.join(chunksDir, `${basename}.wav`);
      await fs.writeFile(textPath, `${chunks[chunkIndex]}\n`, 'utf8');
      chapterManifest.chunks.push({ text: path.relative(bookDir, textPath), audio: path.relative(bookDir, wavPath) });
      audioFiles.push(wavPath);

      if (!options.overwrite && await exists(wavPath)) console.log(`[skip] ${path.basename(wavPath)}`);
      else pending.push({ textFile: textPath, output: wavPath });

      globalIndex += 1;
      selected += 1;
    }
    if (chapterManifest.chunks.length > 0) manifest.chapters.push(chapterManifest);
  }

  const manifestPath = path.join(bookDir, 'manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  if (pending.length > 0) {
    const jobPath = path.join(bookDir, 'job.json');
    await fs.writeFile(jobPath, JSON.stringify({
      language: 'ru', voice: voicePath, exaggeration, cfgWeight, temperature,
      repetitionPenalty, minP, topP, retries, items: pending,
    }, null, 2), 'utf8');
    console.log(`Generating ${pending.length} chunks. The model will be loaded once.`);
    await run(pythonPath(), ['python/batch_tts.py', '--job', jobPath]);
  } else {
    console.log('Nothing to generate. All selected chunks already exist.');
  }

  for (const wavPath of audioFiles) {
    if (!(await exists(wavPath))) throw new Error(`Expected audio chunk is missing: ${wavPath}`);
  }

  if (options.m4b) {
    const outputPath = await buildM4b(book, bookDir, manifest, audioFiles, options.bitrate);
    console.log(`Audiobook: ${outputPath}`);
  }
  console.log(`Project files: ${bookDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});