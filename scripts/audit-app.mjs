// The same launch audit, for the phone app: labels on controls people cannot see, touch targets, the
// permissions we ask for, and claims we would have to stand behind.
//
//   node scripts/audit-app.mjs
//
// It reads the source. Some of it is heuristic, so warnings are for a human to judge, not a verdict.
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', 'mobile');

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (/\.(tsx|ts)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const findings = [];
const note = (level, area, where, what) => findings.push({ level, area, where, what });
const lineOf = (text, i) => text.slice(0, i).split('\n').length;

/**
 * The opening tag of a JSX control, from `<Pressable` to the `>` that closes it.
 *
 * Arrow functions inside props carry their own `>` (`({ pressed }) =>`), so those are blanked first.
 * Without that the window stops early and misses the very props being looked for.
 */
function openingTag(src, at) {
  const window = src.slice(at, at + 900).replace(/=>/g, '@@');
  const end = window.indexOf('>');
  return end === -1 ? window : window.slice(0, end + 1);
}

const files = await walk(join(root, 'src'));
files.push(join(root, 'App.tsx'));

let pressables = 0;
let labelled = 0;

for (const file of files) {
  const src = await readFile(file, 'utf8').catch(() => '');
  const where = relative(root, file).replace(/\\/g, '/');

  // A control whose content is only an icon needs a spoken name.
  for (const m of src.matchAll(/<(Pressable|TouchableOpacity|IconButton)\b/g)) {
    pressables++;
    const tag = openingTag(src, m.index);
    const hasLabel = /accessibilityLabel=/.test(tag);
    if (hasLabel) labelled++;
    const iconOnly = /<[A-Z][A-Za-z]*\s+(color|size)=/.test(tag) && !/>\s*[A-Za-z0-9]/.test(tag) && !/<Text\b/.test(tag);
    if (iconOnly && !hasLabel) note('fail', 'app labels', `${where}:${lineOf(src, m.index)}`, `icon-only control with no accessibilityLabel: ${tag.replace(/\s+/g, ' ').slice(0, 90)}`);
  }

  // Anything people tap should be about 44 points or more. Follow the style name from the control that uses
  // it to the size it declares, rather than guessing from whatever sits near a number.
  const sizes = new Map();
  for (const m of src.matchAll(/(\w+):\s*\{([^}]*)\}/g)) {
    const height = /height:\s*(\d+)/.exec(m[2]);
    const padding = /paddingVertical:\s*(\d+)/.exec(m[2]);
    const minHeight = /minHeight:\s*(\d+)/.exec(m[2]);
    if (height || padding || minHeight) {
      sizes.set(m[1], {
        height: height ? Number(height[1]) : null,
        padded: padding ? Number(padding[1]) * 2 : null,
        min: minHeight ? Number(minHeight[1]) : null
      });
    }
  }
  for (const m of src.matchAll(/<(Pressable|TouchableOpacity)\b/g)) {
    const tag = openingTag(src, m.index);
    if (/hitSlop/.test(tag)) continue;
    for (const use of tag.matchAll(/styles\.(\w+)/g)) {
      const size = sizes.get(use[1]);
      if (!size) continue;
      const tallest = Math.max(size.height ?? 0, size.min ?? 0, size.padded ?? 0);
      if (tallest > 0 && tallest < 44) {
        note('warn', 'touch targets', `${where}:${lineOf(src, m.index)}`, `styles.${use[1]} is ${tallest} tall on a control with no hitSlop`);
      }
    }
  }

  // Claims we would have to prove, and reviews we do not have.
  for (const re of [/\btrusted by\b/gi, /\bbank[- ]level\b/gi, /\bmilitary[- ]grade\b/gi, /\bguarantee(d)?\b/gi, /\b\d+\s*(star|stars)\b/gi, /\btestimonial/gi, /\b(\d[\d,.]*)\s*\+?\s*(users|people|customers)\b/gi]) {
    for (const m of src.matchAll(re)) {
      const around = src.slice(Math.max(0, m.index - 70), m.index + 90).replace(/\s+/g, ' ');
      note('warn', 'claims', `${where}:${lineOf(src, m.index)}`, `"${m[0]}": ...${around}...`);
    }
  }

  // Anything that phones home to somebody else.
  for (const m of src.matchAll(/https?:\/\/[a-z0-9.-]+/gi)) {
    const host = m[0].replace(/^https?:\/\//, '');
    if (/supabase\.co|localhost|127\.0\.0\.1|example\.com|budgetfriendly|w3\.org|schema\.org/.test(host)) continue;
    note('info', 'third party', `${where}:${lineOf(src, m.index)}`, host);
  }

  // Plain HTTP anywhere in the app.
  for (const m of src.matchAll(/http:\/\/(?!localhost|127\.0\.0\.1|10\.0\.2\.2|www\.w3\.org|schema\.org)/g)) {
    // `new URL('http://local' + path)` is a way to parse a relative path, not a request. Ignore it.
    const before = src.slice(Math.max(0, m.index - 40), m.index);
    if (/new URL\(\s*['"`]$/.test(before)) continue;
    note('fail', 'cleartext', `${where}:${lineOf(src, m.index)}`, src.slice(m.index, m.index + 60).split(/['"\s]/)[0]);
  }
}

// What the app asks the phone for, and why.
const appJson = JSON.parse(await readFile(join(root, 'app.json'), 'utf8'));
const ios = appJson.expo?.ios?.infoPlist ?? {};
for (const [key, value] of Object.entries(ios)) {
  if (/UsageDescription$/.test(key)) note('info', 'permissions', 'app.json', `${key}: ${String(value).slice(0, 80)}`);
}
const plugins = JSON.stringify(appJson.expo?.plugins ?? []);
for (const [name, why] of [['expo-image-picker', 'photos, for a profile picture'], ['expo-local-authentication', 'Face ID or fingerprint lock'], ['expo-notifications', 'reminders and alerts'], ['expo-audio', 'voice entry']]) {
  if (plugins.includes(name)) note('info', 'permissions', 'app.json', `${name}: ${why}`);
}
if (!appJson.expo?.android?.allowBackup === false) note('info', 'data', 'app.json', `android.allowBackup: ${appJson.expo?.android?.allowBackup}`);

note('info', 'app labels', 'summary', `${labelled} of ${pressables} controls carry an accessibilityLabel`);

const order = { fail: 0, warn: 1, info: 2 };
findings.sort((a, b) => order[a.level] - order[b.level] || a.area.localeCompare(b.area));
const shown = findings.filter((f) => f.level !== 'info').slice(0, 40);
for (const f of [...shown, ...findings.filter((f) => f.level === 'info')]) {
  console.log(`${f.level.toUpperCase().padEnd(4)} ${f.area.padEnd(14)} ${String(f.where).padEnd(46)} ${f.what}`);
}
const fails = findings.filter((f) => f.level === 'fail').length;
console.log(`\n${fails} to fix, ${findings.filter((f) => f.level === 'warn').length} to check by hand.`);
process.exit(fails ? 1 : 0);
