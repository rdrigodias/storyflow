import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const cwd = process.cwd();

function getArgValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

function hasArg(flag) {
  return process.argv.includes(flag);
}

async function listPngFiles(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.png'))
      .map((entry) => path.join(dir, entry.name))
      .sort();
  } catch {
    return [];
  }
}

async function findLatestArchivePngDir() {
  const archiveRoot = path.join(cwd, '_archive');
  let entries = [];
  try {
    entries = await fs.readdir(archiveRoot, { withFileTypes: true });
  } catch {
    return null;
  }

  const candidates = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('original_png_'))
    .map((entry) => entry.name)
    .sort()
    .reverse();

  for (const dirName of candidates) {
    const candidate = path.join(archiveRoot, dirName, 'src', 'assets');
    const files = await listPngFiles(candidate);
    if (files.length > 0) {
      return candidate;
    }
  }

  return null;
}

async function resolveInputDir() {
  const explicitInput = getArgValue('--input');
  if (explicitInput) {
    const resolved = path.resolve(cwd, explicitInput);
    const files = await listPngFiles(resolved);
    if (files.length === 0) {
      throw new Error(`No .png files found in explicit input: ${resolved}`);
    }
    return resolved;
  }

  const preferArchive = hasArg('--from-archive');
  const defaultDir = path.join(cwd, 'src', 'assets');

  if (!preferArchive) {
    const files = await listPngFiles(defaultDir);
    if (files.length > 0) return defaultDir;
  }

  const archiveDir = await findLatestArchivePngDir();
  if (archiveDir) return archiveDir;

  if (preferArchive) {
    throw new Error('No archived original_png_* directory with .png files found.');
  }

  throw new Error('No .png files found in src/assets and no archived original_png_* source found.');
}

async function main() {
  const outputArg = getArgValue('--output');
  const outputDir = outputArg ? path.resolve(cwd, outputArg) : path.join(cwd, 'src', 'assets');
  const width = Number(getArgValue('--width') ?? 640);
  const quality = Number(getArgValue('--quality') ?? 70);

  if (!Number.isFinite(width) || width <= 0) {
    throw new Error(`Invalid --width value: ${width}`);
  }
  if (!Number.isFinite(quality) || quality < 1 || quality > 100) {
    throw new Error(`Invalid --quality value: ${quality}`);
  }

  const inputDir = await resolveInputDir();
  const pngFiles = await listPngFiles(inputDir);

  await fs.mkdir(outputDir, { recursive: true });

  let totalInputBytes = 0;
  let totalOutputBytes = 0;

  for (const pngFile of pngFiles) {
    const base = path.basename(pngFile, path.extname(pngFile));
    const webpPath = path.join(outputDir, `${base}.webp`);

    const inputStat = await fs.stat(pngFile);
    totalInputBytes += inputStat.size;

    await sharp(pngFile)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality })
      .toFile(webpPath);

    const outputStat = await fs.stat(webpPath);
    totalOutputBytes += outputStat.size;
  }

  const percent = totalInputBytes > 0
    ? (((totalInputBytes - totalOutputBytes) / totalInputBytes) * 100).toFixed(1)
    : '0.0';

  console.log(`Input directory: ${path.relative(cwd, inputDir)}`);
  console.log(`Output directory: ${path.relative(cwd, outputDir)}`);
  console.log(`Processed: ${pngFiles.length} file(s)`);
  console.log(`Input bytes: ${totalInputBytes}`);
  console.log(`Output bytes: ${totalOutputBytes}`);
  console.log(`Reduction: ${percent}%`);
}

main().catch((err) => {
  console.error(err.message || String(err));
  process.exit(1);
});
