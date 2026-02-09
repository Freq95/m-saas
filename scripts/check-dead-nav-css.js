const fs = require('fs');
const path = require('path');

const ROOT = path.join(process.cwd(), 'app');
const TARGET_FILE = 'page.module.css';
const FORBIDDEN_SELECTORS = [/^\s*\.nav\s*\{/m, /^\s*\.logo\s*\{/m, /^\s*\.navLinks\s*\{/m];

function walk(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, out);
      continue;
    }
    if (entry.isFile() && entry.name === TARGET_FILE) {
      out.push(fullPath);
    }
  }
  return out;
}

function hasForbiddenSelectors(content) {
  return FORBIDDEN_SELECTORS.some((pattern) => pattern.test(content));
}

const files = walk(ROOT);
const offenders = [];

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  if (hasForbiddenSelectors(content)) {
    offenders.push(path.relative(process.cwd(), file));
  }
}

if (offenders.length > 0) {
  console.error('Dead legacy navbar selectors found in CSS modules:');
  for (const file of offenders) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

console.log('No legacy page-level navbar selectors found.');
