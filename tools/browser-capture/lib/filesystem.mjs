import { createHash } from 'node:crypto';
import { lstat, mkdir, open, readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

export const sha256 = (content) => createHash('sha256').update(content).digest('hex');

export const isPathContained = (root, candidate, pathApi = Object.freeze({ relative, isAbsolute, sep })) => {
  const fromRoot = pathApi.relative(root, candidate);
  return fromRoot === ''
    || (!fromRoot.startsWith(`..${pathApi.sep}`)
      && fromRoot !== '..'
      && !pathApi.isAbsolute(fromRoot));
};

export const resolveWithin = (root, requestedPath) => {
  const rootPath = resolve(root);
  if (typeof requestedPath !== 'string' || !requestedPath.trim()) {
    return Object.freeze({ ok: false, error: 'Path is required.' });
  }
  if (isAbsolute(requestedPath)) {
    return Object.freeze({ ok: false, error: 'Absolute paths are not allowed.' });
  }
  const candidate = resolve(rootPath, requestedPath);
  if (!isPathContained(rootPath, candidate)) {
    return Object.freeze({ ok: false, error: 'Path escapes the project root.' });
  }
  return Object.freeze({ ok: true, value: candidate });
};

export const assertSafeDirectoryPath = async (root, requested) => {
  const lexical = resolveWithin(root, requested);
  if (!lexical.ok) throw new Error(lexical.error);
  const fromRoot = relative(root, lexical.value);
  let current = root;
  for (const segment of fromRoot.split(sep).filter(Boolean)) {
    const next = join(current, segment);
    let metadata;
    try {
      metadata = await lstat(next);
    } catch (error) {
      if (error.code === 'ENOENT') return lexical.value;
      throw error;
    }
    if (metadata.isSymbolicLink()) throw new Error(`Unsafe symbolic link in output path: ${relative(root, next)}`);
    if (!metadata.isDirectory()) throw new Error(`Output parent is not a directory: ${relative(root, next)}`);
    const physical = await realpath(next);
    if (!isPathContained(root, physical)) throw new Error(`Output directory escapes the project root: ${relative(root, next)}`);
    current = physical;
  }
  return lexical.value;
};

export const ensureSafeDirectory = async (root, requested) => {
  await assertSafeDirectoryPath(root, requested);
  const lexical = resolveWithin(root, requested);
  let current = root;
  for (const segment of relative(root, lexical.value).split(sep).filter(Boolean)) {
    const next = join(current, segment);
    let metadata;
    try {
      metadata = await lstat(next);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      try {
        await mkdir(next, { mode: 0o700 });
      } catch (mkdirError) {
        if (mkdirError.code !== 'EEXIST') throw mkdirError;
      }
      metadata = await lstat(next);
    }
    if (metadata.isSymbolicLink()) throw new Error(`Unsafe symbolic link in output path: ${relative(root, next)}`);
    if (!metadata.isDirectory()) throw new Error(`Output parent is not a directory: ${relative(root, next)}`);
    const physical = await realpath(next);
    if (!isPathContained(root, physical)) throw new Error(`Output directory escapes the project root: ${relative(root, next)}`);
    current = physical;
  }
  return current;
};

export const resolveExistingFile = async (root, requested) => {
  const lexical = resolveWithin(root, requested);
  if (!lexical.ok) throw new Error(lexical.error);
  const physical = await realpath(lexical.value);
  if (!isPathContained(root, physical)) throw new Error('Entry escapes the project root.');
  const metadata = await stat(physical);
  if (!metadata.isFile()) throw new Error('Entry must be a file.');
  return physical;
};

export const writeExclusive = async (path, content) => {
  const handle = await open(path, 'wx', 0o600);
  try {
    await handle.writeFile(content);
    await handle.sync();
  } finally {
    await handle.close();
  }
};

const PNG_SIGNATURE = '89504e470d0a1a0a';
const CRC_TABLE = Object.freeze(Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  }
  return value >>> 0;
}));

const crc32 = (bytes) => {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
};

export const inspectPng = (bytes) => {
  if (!Buffer.isBuffer(bytes) || bytes.length < 45 || bytes.subarray(0, 8).toString('hex') !== PNG_SIGNATURE) {
    throw new Error('PNG signature or length is invalid.');
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let sawHeader = false;
  let sawData = false;
  let sawEnd = false;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) throw new Error('PNG chunk is truncated.');
    const length = bytes.readUInt32BE(offset);
    const typeStart = offset + 4;
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const chunkEnd = dataEnd + 4;
    if (chunkEnd > bytes.length) throw new Error('PNG chunk exceeds the file boundary.');
    const type = bytes.subarray(typeStart, dataStart).toString('ascii');
    if (crc32(bytes.subarray(typeStart, dataEnd)) !== bytes.readUInt32BE(dataEnd)) {
      throw new Error(`PNG ${type} checksum is invalid.`);
    }
    if (!sawHeader) {
      if (type !== 'IHDR' || length !== 13) throw new Error('PNG must begin with a 13-byte IHDR chunk.');
      width = bytes.readUInt32BE(dataStart);
      height = bytes.readUInt32BE(dataStart + 4);
      if (width < 1 || height < 1) throw new Error('PNG dimensions are invalid.');
      sawHeader = true;
    } else if (type === 'IHDR') {
      throw new Error('PNG has more than one IHDR chunk.');
    }
    if (type === 'IDAT') sawData = true;
    if (type === 'IEND') {
      if (length !== 0 || !sawData || chunkEnd !== bytes.length) throw new Error('PNG IEND structure is invalid.');
      sawEnd = true;
      break;
    }
    offset = chunkEnd;
  }
  if (!sawHeader || !sawData || !sawEnd) throw new Error('PNG is missing required chunks.');
  return Object.freeze({ width, height, sha256: sha256(bytes) });
};

export const readAndInspectPng = async (path) => {
  const metadata = await stat(path);
  if (metadata.size < 100) throw new Error(`Capture is unexpectedly small: ${path}`);
  return inspectPng(await readFile(path));
};
