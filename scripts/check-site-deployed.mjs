// Is the live waitlist site the same as the one in this repo?
//
// That project's Git connection is deliberately off, because a push rebuilt it from the repository root and
// served the old web app instead. The cost of that is drift: a change can sit in the repo for weeks while the
// site shows the old thing, and nobody notices. This says so in one command.
//
//   node scripts/check-site-deployed.mjs
//
// Exits 1 when anything differs, so it can gate a release later if that is ever wanted.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SITE = process.env.WAITLIST_SITE_URL || 'https://budgetfriendly-waitlist.vercel.app';
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const folder = join(root, 'waitlist');

/**
 * What the site is compared against is origin/main, not this working copy.
 *
 * Run from a checkout that is behind, the old version of this called a perfectly correct site OLD and offered
 * the command to publish the stale copies over it. origin/main is what the site is meant to be serving, so
 * that is the question worth asking. When git cannot answer, it says so and falls back to the files on disk.
 */
const git = (args, encoding = 'utf8') => execFileSync('git', args, { cwd: root, encoding, stdio: ['ignore', 'pipe', 'ignore'] });
let fromMain = true;
try {
  git(['fetch', 'origin', '--quiet']);
  git(['rev-parse', '--verify', 'origin/main']);
} catch {
  fromMain = false;
  console.log('Cannot read origin/main, so this compares the site with the working copy instead.\n');
}
const onMain = (name, binary = false) => {
  if (!fromMain) return null;
  try {
    return git(['show', `origin/main:waitlist/${name}`], binary ? 'buffer' : 'utf8');
  } catch {
    return null;
  }
};

// Every file the site serves. A new one added to waitlist/ belongs here too, or it can fail to deploy
// without this noticing: the pages would match while the thing they depend on is missing.
const FILES = ['index.html', 'join.html', 'joined.html', 'privacy.html', 'terms.html', 'refund.html', '404.html', 'styles.css', 'motion.js', 'config.js', 'robots.txt', 'sitemap.xml'];

// Files that are not text. The pages name these in @font-face, so a deploy that misses them leaves the site
// quietly falling back to a system font while every page above still matches. Compared byte for byte.
const BINARY = ['fonts/figtree-latin.woff2', 'fonts/figtree-latin-ext.woff2', 'fonts/sora-latin.woff2', 'fonts/sora-latin-ext.woff2', 'logo.png'];

// Line endings differ between a Windows checkout and what the host serves, and mean nothing here.
const fingerprint = (text) => createHash('sha256').update(text.replace(/\r\n/g, '\n').trim()).digest('hex').slice(0, 12);

let differs = 0;
let unreachable = 0;

for (const name of FILES) {
  let local = onMain(name);
  if (local == null) {
    try {
      local = await readFile(join(folder, name), 'utf8');
    } catch {
      console.log(`  ?    ${name.padEnd(14)} not in the repo`);
      continue;
    }
  }

  let live;
  try {
    const res = await fetch(`${SITE}/${name}`, { headers: { 'User-Agent': 'budgetfriendly-deploy-check' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    live = await res.text();
  } catch (err) {
    unreachable++;
    console.log(`  ?    ${name.padEnd(14)} could not be fetched (${err.message})`);
    continue;
  }

  const same = fingerprint(local) === fingerprint(live);
  if (!same) differs++;
  console.log(`  ${same ? 'same' : 'OLD '} ${name.padEnd(14)} repo ${fingerprint(local)}  live ${fingerprint(live)}`);
}

for (const name of BINARY) {
  let local = onMain(name, true);
  if (local == null) {
    try {
      local = await readFile(join(folder, name));
    } catch {
      console.log(`  ?    ${name.padEnd(30)} not in the repo`);
      continue;
    }
  }

  let live;
  try {
    const res = await fetch(`${SITE}/${name}`, { headers: { 'User-Agent': 'budgetfriendly-deploy-check' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    live = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    unreachable++;
    console.log(`  ?    ${name.padEnd(30)} could not be fetched (${err.message})`);
    continue;
  }

  const bytes = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 12);
  const same = bytes(local) === bytes(live);
  if (!same) differs++;
  console.log(`  ${same ? 'same' : 'OLD '} ${name.padEnd(30)} repo ${bytes(local)}  live ${bytes(live)}`);
}

if (unreachable === FILES.length + BINARY.length) {
  console.log('\nCould not reach the site at all. Check the address, or your connection.');
  process.exit(1);
}

if (differs) {
  const what = fromMain ? 'origin/main' : 'this working copy';
  console.log(
    `\n${differs} file${differs === 1 ? '' : 's'} on the site ${differs === 1 ? 'does' : 'do'} not match ${what}. Deploy:\n` +
      '  node scripts/deploy-site.mjs\n' +
      'That refuses anything not on origin/main, so it cannot publish an older copy over a correct site.'
  );
  process.exit(1);
}

console.log(`\nThe live site matches ${fromMain ? 'origin/main' : 'this working copy'}.`);
