// Deploys the waitlist site, and refuses the three ways that have already gone wrong.
//
//   node scripts/deploy-site.mjs
//
// Why this exists rather than a line in a README:
//
//   1. A deploy from a folder with no .vercel link creates a SECOND project named after the folder and
//      publishes the site at another address. That happened, and the duplicate is still there.
//   2. `git push | tail` returns tail's exit code, so a rejected push followed by a piped deploy ships anyway.
//      That happened too: the live site was ahead of the repo, from a commit that was on nobody's main.
//   3. A deploy nobody verifies is a deploy nobody knows about. check-site-deployed runs at the end, here,
//      rather than being left to whoever remembers.
//
// So: the site must be exactly what is on origin/main before anything is uploaded, and proved afterwards.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const site = join(root, 'waitlist');
const PROJECT = 'budgetfriendly-waitlist';

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
const die = (why, fix) => {
  console.error(`\n${why}`);
  if (fix) console.error(`\n  ${fix}`);
  process.exit(1);
};

// 1. Nothing uncommitted in waitlist/, or the site would carry work the repo has never seen. Untracked files
// matter as much as edits: this uploads the folder, so an unfinished page sitting in it is published too.
const dirty = run('git', ['status', '--porcelain', '--', 'waitlist']);
if (dirty) {
  // The status token can be one or two characters and `run` trims, so the leading space of the first line is
  // already gone. Split on the token rather than a fixed offset, or the first path loses a letter.
  const entries = dirty.split('\n').map((line) => {
    const [, mark, path] = line.match(/^\s*(\S+)\s+(.*)$/) ?? [];
    return { untracked: mark === '??', path: path ?? line.trim() };
  });
  const untracked = entries.filter((e) => e.untracked).map((e) => e.path);
  const changed = entries.filter((e) => !e.untracked).map((e) => e.path);
  const parts = [];
  if (changed.length) parts.push(`Changed, so the site would carry what the repo has never seen:\n  ${changed.join('\n  ')}`);
  if (untracked.length) parts.push(`Not in the repo, and this uploads the folder, so they would go live as they stand:\n  ${untracked.join('\n  ')}`);
  die(
    `waitlist/ is not clean.\n\n${parts.join('\n\n')}`,
    untracked.length
      ? 'Commit and push what is ready. For work that is not, move it out of waitlist/ or deploy from a clean worktree:\n  git worktree add ../bf-deploy origin/main'
      : 'Commit them, push, then run this again.'
  );
}

// 2. The commit being deployed has to be on origin/main, so what is live can always be found again.
run('git', ['fetch', 'origin', '--quiet']);
const head = run('git', ['rev-parse', 'HEAD']);
const onMain = run('git', ['branch', '--remotes', '--contains', head]).includes('origin/main');
if (!onMain) die(`HEAD (${head.slice(0, 7)}) is not on origin/main.`, 'Push it to main first. A site nobody can find in the repo is a site nobody can fix.');

// The site folder itself must match origin/main, even when HEAD does: a stale worktree is the same hazard.
const differs = run('git', ['diff', '--name-only', `origin/main`, '--', 'waitlist']);
if (differs) die(`waitlist/ differs from origin/main:\n${differs}`, 'Rebase or reset onto origin/main, then run this again.');

// 3. The Vercel link, or a deploy invents a new project and publishes the site somewhere else.
const link = join(site, '.vercel', 'project.json');
if (!existsSync(link)) {
  die(
    'This checkout has no .vercel link, so a deploy would create a second project called "waitlist".',
    `cd waitlist && npx vercel link --yes --project ${PROJECT} --scope iribamas-projects`
  );
}
const linked = JSON.parse(readFileSync(link, 'utf8'));
if (linked.projectName && linked.projectName !== PROJECT) {
  die(`This folder is linked to "${linked.projectName}", not ${PROJECT}.`, `rm -rf waitlist/.vercel && cd waitlist && npx vercel link --yes --project ${PROJECT} --scope iribamas-projects`);
}

console.log(`Deploying ${head.slice(0, 7)} to ${PROJECT}...`);
try {
  const out = execFileSync('npx', ['vercel', 'deploy', '--prod', '--yes'], { cwd: site, encoding: 'utf8', shell: true });
  const alias = out.match(/https:\/\/[^\s"]*budgetfriendly-waitlist[^\s"]*/g);
  console.log(`  uploaded${alias ? `, live at ${alias[alias.length - 1]}` : ''}`);
} catch (err) {
  die(`The deploy failed:\n${err.stdout ?? ''}${err.stderr ?? ''}`, 'Vercel sometimes answers "Not authorized" once; the identical retry usually works.');
}

// 4. Prove it landed. Fonts and the logo are in there too, byte for byte.
console.log('\nChecking the live site against the repo...');
try {
  console.log(execFileSync('node', [join(here, 'check-site-deployed.mjs')], { cwd: root, encoding: 'utf8' }));
} catch (err) {
  console.error(err.stdout ?? '');
  die('The site does not match the repo after deploying. Look at the list above.');
}
