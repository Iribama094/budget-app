// A launch audit of the waitlist site: accessibility, tracking, consent and the claims we make.
//
//   node scripts/audit-site.mjs
//
// It reads the files rather than trusting anybody's memory. Every finding names the file and the line so it
// can be checked by hand. It reports; it never changes anything.
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const folder = join(here, '..', 'waitlist');
const pages = ['index.html', 'join.html', 'joined.html', 'privacy.html', 'terms.html', '404.html'];

const findings = [];
const note = (level, area, where, what) => findings.push({ level, area, where, what });

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

for (const page of pages) {
  let html;
  try {
    html = await readFile(join(folder, page), 'utf8');
  } catch {
    note('fail', 'pages', page, 'missing');
    continue;
  }

  // Language, for screen readers and translation.
  if (!/<html[^>]+lang="/.test(html)) note('fail', 'accessibility', page, 'no lang on <html>');

  // Every image needs alt text. alt="" is correct for decoration, so it counts as answered.
  for (const m of html.matchAll(/<img\b[^>]*>/g)) {
    if (!/\salt=/.test(m[0])) note('fail', 'alt text', `${page}:${lineOf(html, m.index)}`, m[0].slice(0, 90));
  }

  // Inputs need a label, or an aria-label, or to be hidden from everyone.
  for (const m of html.matchAll(/<input\b[^>]*>/g)) {
    const tag = m[0];
    const type = (tag.match(/type="([^"]+)"/) ?? [])[1] ?? 'text';
    if (type === 'hidden') continue;
    const id = (tag.match(/id="([^"]+)"/) ?? [])[1];
    const labelled =
      (id && new RegExp(`<label[^>]+for="${id}"`).test(html)) ||
      /aria-label=/.test(tag) ||
      new RegExp(`<label[^>]*>\\s*<input[^>]*${type === 'checkbox' || type === 'radio' ? '' : 'x'}`).test(html);
    const wrapped = html.slice(Math.max(0, m.index - 400), m.index).lastIndexOf('<label') > html.slice(Math.max(0, m.index - 400), m.index).lastIndexOf('</label>');
    if (!labelled && !wrapped) note('fail', 'forms', `${page}:${lineOf(html, m.index)}`, `input has no label: ${tag.slice(0, 80)}`);
  }

  // A control with only an icon needs a name.
  for (const m of html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)) {
    const text = m[1].replace(/<[^>]+>/g, '').trim();
    if (!text && !/aria-label=/.test(m[0])) note('fail', 'buttons', `${page}:${lineOf(html, m.index)}`, 'button with no words and no aria-label');
  }

  // Positive tabindex reorders the keyboard path and is almost always a mistake.
  for (const m of html.matchAll(/tabindex="([0-9]+)"/g)) {
    if (Number(m[1]) > 0) note('fail', 'keyboard', `${page}:${lineOf(html, m.index)}`, `tabindex="${m[1]}" reorders the keyboard path`);
  }

  // Headings should start at one h1 and not skip levels.
  const heads = [...html.matchAll(/<h([1-6])\b/g)].map((m) => Number(m[1]));
  const h1s = heads.filter((h) => h === 1).length;
  if (h1s !== 1) note(h1s === 0 ? 'fail' : 'warn', 'headings', page, `${h1s} h1 headings, expected exactly 1`);
  for (let i = 1; i < heads.length; i++) {
    if (heads[i] - heads[i - 1] > 1) {
      note('warn', 'headings', page, `jumps from h${heads[i - 1]} to h${heads[i]}`);
      break;
    }
  }

  // Anything loaded from somebody else, and anything that could track.
  for (const m of html.matchAll(/<(script|iframe|link)\b[^>]*(src|href)="(https?:\/\/[^"]+)"/g)) {
    const host = new URL(m[3]).host;
    note('info', 'third party', `${page}:${lineOf(html, m.index)}`, `${m[1]} from ${host}`);
  }
  for (const m of html.matchAll(/document\.cookie|localStorage|sessionStorage/g)) {
    note('info', 'storage', `${page}:${lineOf(html, m.index)}`, m[0]);
  }

  // Claims worth being able to prove, and words that suggest reviews we do not have.
  const claims = [/\b(\d[\d,.]*)\s*(\+|plus)?\s*(users|people|customers|businesses|downloads)\b/gi, /\btrusted by\b/gi, /\bbank[- ]level\b/gi, /\bmilitary[- ]grade\b/gi, /\b(guarantee|guaranteed)\b/gi, /\bsave (you )?₦?\d/gi, /\b\d+\s*(star|stars)\b/gi, /\btestimonial/gi, /\breview(s)?\b/gi];
  for (const re of claims) {
    for (const m of html.matchAll(re)) {
      const around = html.slice(Math.max(0, m.index - 60), m.index + 80).replace(/\s+/g, ' ');
      note('warn', 'claims', `${page}:${lineOf(html, m.index)}`, `"${m[0]}" in: ...${around}...`);
    }
  }

  // Marketing consent that is already ticked is not consent.
  for (const m of html.matchAll(/<input\b[^>]*type="checkbox"[^>]*>/g)) {
    if (/\bchecked\b/.test(m[0])) note('fail', 'consent', `${page}:${lineOf(html, m.index)}`, `ticked by default: ${m[0].slice(0, 90)}`);
  }
}

// Who we are, and how to reach us.
const index = await readFile(join(folder, 'index.html'), 'utf8').catch(() => '');
const privacy = await readFile(join(folder, 'privacy.html'), 'utf8').catch(() => '');
if (!/mailto:/.test(index)) note('warn', 'business details', 'index.html', 'no contact address anywhere on the landing page');
if (!/(RC\s?\d|registered|limited|ltd\b)/i.test(privacy + index)) note('warn', 'business details', 'site', 'no registered company name or number');
if (!/cookie/i.test(privacy)) note('warn', 'cookies', 'privacy.html', 'no mention of cookies either way');
if (!/refund|payment|free/i.test(await readFile(join(folder, 'terms.html'), 'utf8').catch(() => ''))) note('warn', 'refunds', 'terms.html', 'nothing about money, refunds or it being free');

const order = { fail: 0, warn: 1, info: 2 };
findings.sort((a, b) => order[a.level] - order[b.level] || a.area.localeCompare(b.area));
let fails = 0;
for (const f of findings) {
  if (f.level === 'fail') fails++;
  console.log(`${f.level.toUpperCase().padEnd(4)} ${f.area.padEnd(16)} ${String(f.where).padEnd(22)} ${f.what}`);
}
console.log(`\n${fails} to fix, ${findings.filter((f) => f.level === 'warn').length} to check by hand, ${findings.filter((f) => f.level === 'info').length} for the record.`);
process.exit(fails ? 1 : 0);
