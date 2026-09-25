// Is the live waitlist site the same as the one in this repo?
//
// That project's Git connection is deliberately off, because a push rebuilt it from the repository root and
// served the old web app instead. The cost of that is drift: a change can sit in the repo for weeks while the
// site shows the old thing, and nobody notices. This says so in one command.
//
//   node scripts/check-site-deployed.mjs
//
// Exits 1 when anything differs, so it can gate a release later if that is ever wanted.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SITE = process.env.WAITLIST_SITE_URL || 'https://budgetfriendly-waitlist.vercel.app';
const here = dirname(fileURLToPath(import.meta.url));
const folder = join(here, '..', 'waitlist');

// Every file the site serves. A new one added to waitlist/ belongs here too, or it can fail to deploy
// without this noticing: the pages would match while the thing they depend on is missing.
const FILES = ['index.html', 'join.html', 'joined.html', 'privacy.html', 'terms.html', '404.html', 'styles.css', 'motion.js', 'config.js', 'robots.txt', 'sitemap.xml'];

// Line endings differ between a Windows checkout and what the host serves, and mean nothing here.
const fingerprint = (text) => createHash('sha256').update(text.replace(/\r\n/g, '\n').trim()).digest('hex').slice(0, 12);

let differs = 0;
let unreachable = 0;

for (const name of FILES) {
  let local;
  try {
    local = await readFile(join(folder, name), 'utf8');
  } catch {
    console.log(`  ?    ${name.padEnd(14)} not in the repo`);
    continue;
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

if (unreachable === FILES.length) {
  console.log('\nCould not reach the site at all. Check the address, or your connection.');
  process.exit(1);
}

if (differs) {
  console.log(`\n${differs} file${differs === 1 ? '' : 's'} on the site ${differs === 1 ? 'is' : 'are'} older than this repo. Deploy:\n  cd waitlist && npx vercel deploy --prod --yes`);
  process.exit(1);
}

console.log('\nThe live site matches this repo.');
