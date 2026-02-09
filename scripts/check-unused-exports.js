const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const TARGETS = [
  path.join(ROOT, 'lib', 'constants.ts'),
  path.join(ROOT, 'lib', 'validation.ts'),
];

const SEARCH_DIRS = [
  path.join(ROOT, 'app'),
  path.join(ROOT, 'components'),
  path.join(ROOT, 'lib'),
  path.join(ROOT, 'scripts'),
];

const SEARCH_FILES = [path.join(ROOT, 'middleware.ts')];
const EXTENSIONS = new Set(['.ts', '.tsx', '.js']);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.next')) continue;
      walk(full, out);
      continue;
    }
    if (entry.isFile() && EXTENSIONS.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

function getExports(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const matches = [...source.matchAll(/^\s*export const ([A-Za-z0-9_]+)/gm)];
  return matches.map((m) => m[1]);
}

function hasReference(symbol, targetPath, files) {
  const referenceRegex = new RegExp(`\\b${symbol}\\b`);
  for (const file of files) {
    if (path.resolve(file) === path.resolve(targetPath)) continue;
    const source = fs.readFileSync(file, 'utf8');
    if (referenceRegex.test(source)) {
      return true;
    }
  }
  return false;
}

const files = SEARCH_DIRS.flatMap((dir) => walk(dir)).concat(SEARCH_FILES.filter((f) => fs.existsSync(f)));
const offenders = [];

for (const target of TARGETS) {
  if (!fs.existsSync(target)) continue;
  const exports = getExports(target);
  for (const symbol of exports) {
    if (!hasReference(symbol, target, files)) {
      offenders.push(`${path.relative(ROOT, target)} -> ${symbol}`);
    }
  }
}

if (offenders.length > 0) {
  console.error('Unused exports detected in guarded files:');
  offenders.forEach((line) => console.error(`- ${line}`));
  process.exit(1);
}

console.log('No unused exports detected in guarded files.');
