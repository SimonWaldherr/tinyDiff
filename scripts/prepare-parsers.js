import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  renameSync,
  rmSync,
  existsSync
} from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const manifest = JSON.parse(readFileSync(new URL('./parser-manifest.json', import.meta.url)));
const parent = fileURLToPath(new URL('../site/vendor/', import.meta.url));
const destination = fileURLToPath(new URL('../site/vendor/tree-sitter/', import.meta.url));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const packages = new Set();
for (const [file, info] of Object.entries(manifest)) {
  if (
    file !== basename(file) ||
    !/^[a-z-]+$/.test(info.package) ||
    !/^\d+\.\d+\.\d+$/.test(info.version) ||
    !/^[a-f0-9]{64}$/.test(info.sha256) ||
    !/^package\/[\w.-]+$/.test(info.member)
  )
    throw new Error('Invalid parser manifest');
  packages.add(`${info.package}@${info.version}`);
}
function matches() {
  try {
    const expected = new Set([...Object.keys(manifest), 'manifest.json', 'README.md']);
    if (readdirSync(destination).some((file) => !expected.has(file))) return false;
    return Object.entries(manifest).every(
      ([file, info]) => digest(readFileSync(join(destination, file))) === info.sha256
    );
  } catch {
    return false;
  }
}
function writeNotices(directory) {
  writeFileSync(join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  writeFileSync(
    join(directory, 'README.md'),
    readFileSync(new URL('./PARSERS.md', import.meta.url))
  );
}
if (matches()) {
  writeNotices(destination);
  console.log('Parser files verified; no download needed.');
} else {
  // Stage beside the destination so the final rename also works across mounts.
  mkdirSync(parent, { recursive: true });
  const temporary = mkdtempSync(join(parent, '.prepare-'));
  try {
    // Fetch archives only. Never install packages or execute their lifecycle scripts.
    console.log('Downloading pinned parser packages from registry.npmjs.org …');
    execFileSync(
      'npm',
      [
        'pack',
        ...packages,
        '--ignore-scripts',
        '--json',
        '--registry=https://registry.npmjs.org',
        '--pack-destination',
        temporary
      ],
      {
        cwd: temporary,
        timeout: 120000,
        maxBuffer: 8 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );
    const prepared = join(temporary, 'prepared');
    mkdirSync(prepared);
    for (const [file, info] of Object.entries(manifest)) {
      // Read a single known member to stdout; never unpack archive paths onto disk.
      const archive = join(temporary, `${info.package}-${info.version}.tgz`);
      const bytes = execFileSync('tar', ['-xzOf', archive, info.member], {
        timeout: 10000,
        maxBuffer: 8 * 1024 * 1024
      });
      if (digest(bytes) !== info.sha256) throw new Error(`Parser checksum mismatch: ${file}`);
      writeFileSync(join(prepared, file), bytes);
    }
    writeNotices(prepared);
    const backup = join(temporary, 'previous');
    if (existsSync(destination)) renameSync(destination, backup);
    try {
      renameSync(prepared, destination);
    } catch (error) {
      if (existsSync(backup)) renameSync(backup, destination);
      throw error;
    }
    console.log(
      `Prepared ${Object.keys(manifest).length} verified parser files and license notices.`
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
