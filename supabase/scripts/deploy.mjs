// Deploys the `api` Edge Function safely.
//
// `supabase functions deploy` uploads whatever is in the folder, not what is committed. With several people
// (or several Claude sessions) sharing one checkout, that is how someone else's half finished work reaches
// production. This script closes that door:
//
//   1. the working tree must be clean, so nobody's local edits ride along
//   2. the commit must already be on origin, so what is live can always be found again
//   3. every migration in that commit must already be applied, so the code never reads columns that do not exist
//   4. the deploy runs from a fresh checkout of that exact commit, never from the shared folder
//
// Usage from the repo root:
//   node supabase/scripts/deploy.mjs              # deploys origin/main
//   node supabase/scripts/deploy.mjs <commit>     # deploys any commit that is on origin
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REF = 'uggmyokbpwfdbustnggo';
const target = process.argv[2] ?? 'origin/main';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
// shell on Windows, where npx is a .cmd and execFile cannot spawn it directly.
const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], shell: process.platform === 'win32', ...opts });
const die = (msg) => {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
};

const dirty = git('status', '--porcelain', '--untracked-files=no');
if (dirty) die(`Working tree has uncommitted changes:\n${dirty}\n  Commit or stash them first. A deploy ships the folder, not the commit.`);

console.log('Fetching origin...');
git('fetch', 'origin', '--quiet');

let sha;
try {
  sha = git('rev-parse', '--verify', `${target}^{commit}`);
} catch {
  die(`Cannot resolve "${target}".`);
}

// On origin, so the deployed code can always be found again by anyone.
const onOrigin = git('branch', '--remotes', '--contains', sha).trim();
if (!onOrigin) die(`Commit ${sha.slice(0, 7)} is not on origin. Push it first, or production runs code nobody else can see.`);

// Every migration in this commit must already be applied, or the code reads columns that do not exist yet.
const wanted = git('ls-tree', '--name-only', sha, 'supabase/migrations/')
  .split('\n')
  .map((f) => path.basename(f).split('_')[0])
  .filter((v) => /^\d{14}$/.test(v));
const listed = run('npx', ['--yes', 'supabase@latest', 'migration', 'list', '--linked']);
// The CLI prints JSON in some versions and a table in others, so read whichever came back.
const applied = new Set();
try {
  const parsed = JSON.parse(listed.slice(listed.indexOf('{')));
  for (const m of parsed.migrations ?? []) if (m.remote) applied.add(String(m.remote));
} catch {
  // Table form: the remote column is the second version on a row.
  for (const line of listed.split('\n')) {
    const versions = line.match(/\d{14}/g);
    if (versions && versions.length >= 2) applied.add(versions[1]);
  }
}
if (applied.size === 0) die('Could not read which migrations are applied. Run "npx supabase migration list --linked" and check the link.');
const missing = wanted.filter((v) => !applied.has(v));
if (missing.length) {
  die(`These migrations are in ${sha.slice(0, 7)} but not applied to the database:\n    ${missing.join('\n    ')}\n  Run "npx supabase db push" first. Deploying first is what causes 500s on live data.`);
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-deploy-'));
try {
  console.log(`Checking out ${sha.slice(0, 7)} (${target})...`);
  git('worktree', 'add', '--detach', '--quiet', work, sha);
  console.log('Deploying...');
  run('npx', ['--yes', 'supabase@latest', 'functions', 'deploy', 'api', '--use-api', '--project-ref', REF], { cwd: work, stdio: 'inherit' });
} finally {
  try {
    git('worktree', 'remove', '--force', work);
  } catch {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

const info = run('npx', ['--yes', 'supabase@latest', 'functions', 'list', '-o', 'json']);
const version = JSON.parse(info.slice(info.indexOf('['))).find((f) => f.slug === 'api')?.version;
console.log(`\n  Live: version ${version}, from ${sha.slice(0, 7)} (${git('log', '-1', '--format=%s', sha)})`);
console.log('  Now run: node supabase/scripts/e2e.mjs "$(pwd)"\n');
