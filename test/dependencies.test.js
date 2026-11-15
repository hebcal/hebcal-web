import {describe, it, expect} from 'vitest';
import {readFileSync, readdirSync} from 'node:fs';
import {builtinModules} from 'node:module';

// package.json's dependencies must match what src/ actually imports, in both
// directions. Two ways this goes wrong without a test:
//
// - A package that src/ imports is dropped from package.json. Nothing fails
//   locally or in CI as long as another dependency still pulls it in
//   (@hebcal/murmurhash3 arrives via @hebcal/icalendar), so the breakage
//   waits for that upstream package to drop it.
// - A dependency stays listed after its last import is deleted.

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const dependencies = new Set(Object.keys(pkg.dependencies));
const devDependencies = new Set(Object.keys(pkg.devDependencies));

// Listed dependencies that no JavaScript in src/ imports, and why they stay.
const NOT_IMPORTED = new Map([
  ['simpledotcss', 'deploy.sh copies simple.min.css into static/'],
  ['ejs', 'koa-error renders error.ejs through consolidate, which require()s it'],
]);

const builtins = new Set(builtinModules);

const IMPORT_PATTERNS = [
  // import x from 'pkg'; import {a, b} from 'pkg' (may span several lines)
  /^\s*import\s[^;'"]*?\sfrom\s*['"]([^'"]+)['"]/gm,
  // export {x} from 'pkg'; export * from 'pkg'
  /^\s*export\s*(?:\*|\{)[^;'"]*?\sfrom\s*['"]([^'"]+)['"]/gm,
  // import 'pkg';
  /^\s*import\s*['"]([^'"]+)['"]/gm,
  // await import('pkg')
  /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  // require('pkg')
  /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
];

/**
 * @param {string} specifier
 * @return {string} the npm package name, or '' for relative paths and builtins
 */
function packageName(specifier) {
  if (specifier.startsWith('.') || specifier.startsWith('/') ||
      specifier.startsWith('node:') || builtins.has(specifier)) {
    return '';
  }
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/**
 * @return {Map<string, Set<string>>} package name -> files in src/ importing it
 */
function collectImports() {
  const imports = new Map();
  const files = readdirSync('src').filter((f) => /\.[cm]?js$/.test(f));
  for (const file of files) {
    const text = readFileSync(`src/${file}`, 'utf8');
    for (const re of IMPORT_PATTERNS) {
      for (const m of text.matchAll(re)) {
        const name = packageName(m[1]);
        if (name) {
          if (!imports.has(name)) imports.set(name, new Set());
          imports.get(name).add(file);
        }
      }
    }
  }
  return imports;
}

/**
 * Browser code (src/client*.js) is bundled by rollup at build time, so its
 * packages are devDependencies. Everything else runs on the server.
 * @param {string} file
 * @return {boolean}
 */
function isClientBundle(file) {
  return file.startsWith('client');
}

describe('package.json dependencies', () => {
  const imports = collectImports();

  it('finds the imports it is checking', () => {
    // Guards against the scan silently matching nothing.
    expect(imports.get('@hebcal/core')?.size).toBeGreaterThan(5);
    expect(imports.get('@hebcal/murmurhash3')).toContain('etag.js');
    expect(imports.get('google-protobuf')).toContain('download_pb.cjs');
  });

  it('declares every package that server code imports', () => {
    const missing = [];
    for (const [name, files] of imports) {
      for (const file of files) {
        if (!isClientBundle(file) && !dependencies.has(name)) {
          missing.push(`${name} (imported by src/${file})`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('declares every package that client bundles import', () => {
    const missing = [];
    for (const [name, files] of imports) {
      for (const file of files) {
        if (isClientBundle(file) && !dependencies.has(name) && !devDependencies.has(name)) {
          missing.push(`${name} (imported by src/${file})`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('imports every listed dependency', () => {
    const unused = [...dependencies]
        .filter((name) => !imports.has(name) && !NOT_IMPORTED.has(name));
    expect(unused).toEqual([]);
  });

  it('keeps the NOT_IMPORTED allowlist current', () => {
    for (const name of NOT_IMPORTED.keys()) {
      expect(dependencies.has(name), `${name} is no longer a dependency`).toBe(true);
      expect(imports.has(name), `${name} is imported now; drop it from NOT_IMPORTED`).toBe(false);
    }
  });
});
