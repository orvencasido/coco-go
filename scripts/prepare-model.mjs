import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, stat, unlink } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const model = JSON.parse(await readFile(new URL('./bundled-model.json', import.meta.url), 'utf8'));
const directory = new URL('../src/assets/models/', import.meta.url);
const path = fileURLToPath(new URL(model.filename, directory));
const partialPath = `${path}.part`;

async function verified(candidate) {
  try {
    if ((await stat(candidate)).size !== model.sizeBytes) {
      return false;
    }
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(candidate)) {
      hash.update(chunk);
    }
    return hash.digest('hex') === model.checksumSha256;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

await mkdir(directory, { recursive: true });
if (await verified(path)) {
  console.log('Bundled Qwen 2.5 1.5B is already present and verified.');
} else if (process.argv.includes('--check')) {
  throw new Error('Bundled model missing or invalid. Run npm run prepare:model.');
} else {
  // A completed transfer from another tool can be verified without downloading again.
  if (!(await verified(partialPath))) {
    console.log('Fetching Qwen 2.5 1.5B for the app build (1.12 GB). End users do not download it.');
    const response = await fetch(model.downloadUrl);
    if (!response.ok || !response.body) {
      throw new Error(`Model download failed: HTTP ${response.status}`);
    }
    await pipeline(Readable.fromWeb(response.body), createWriteStream(partialPath));
    if (!(await verified(partialPath))) {
      await unlink(partialPath);
      throw new Error('Bundled model failed size / SHA-256 verification.');
    }
  }
  await rename(partialPath, path);
  console.log('Bundled Qwen 2.5 1.5B prepared and verified.');
}
