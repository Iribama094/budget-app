// Fails if an em dash has crept back into the project. Run it from the repo root:
//   node scripts/check-writing.mjs
// Every tracked file is checked, code comments included, because the rule is the whole project.
import { execSync } from 'node:child_process';
import fs from 'node:fs';

// En dashes are left alone on purpose: they are only used in date ranges here, where they read correctly.
const BANNED = [{ char: '—', name: 'em dash', use: 'a comma, a colon or a full stop' }];

const files = execSync('git ls-files', { encoding: 'utf8' })
  .split('\n')
  .map((f) => f.trim())
  .filter(Boolean)
  .filter((f) => f !== 'scripts/check-writing.mjs');

const hits = [];
for (const file of files) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  if (text.includes('\u0000')) continue; // binary
  text.split('\n').forEach((line, i) => {
    for (const b of BANNED) {
      if (line.includes(b.char)) hits.push({ file, line: i + 1, name: b.name, use: b.use, text: line.trim().slice(0, 120) });
    }
  });
}

if (!hits.length) {
  console.log(`No em dashes in ${files.length} files.`);
  process.exit(0);
}

for (const h of hits) console.log(`${h.file}:${h.line}  ${h.name}, use ${h.use}\n    ${h.text}`);
console.log(`\n${hits.length} to fix.`);
process.exit(1);
