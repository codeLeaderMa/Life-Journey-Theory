#!/usr/bin/env node
/* ============================================================
   validate.mjs — data-integrity checks for class-lifecourse-matrix
   Usage:  node validate.mjs          (exit 1 on errors)
           node validate.mjs --quiet  (errors only, no warnings)
   Run locally before commit; also wired into .github/workflows/validate.yml
   ============================================================ */
import { readFileSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = dirname(fileURLToPath(import.meta.url));
const quiet = process.argv.includes('--quiet');

/* ---------- load node files + data.js ---------- */
global.window = {};
const NODE_FILES = readdirSync(ROOT).filter((f) => /^nodes_.*\.js$/.test(f)).sort();
for (const f of NODE_FILES) {
  const code = readFileSync(join(ROOT, f), 'utf8');
  (0, eval)(code);
}
const DB = new Function('window', readFileSync(join(ROOT, 'data.js'), 'utf8') + ';return DB;')(global.window);

const errors = [];
const warnings = [];
const err = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

const DISCS = new Set(['soc', 'dev', 'econ', 'psy', 'pol', 'exi', 'anth', 'bio', 'fam']);
const STAGES = new Set(['s1', 's2', 's3', 's4']);
const CLASSES = new Set(['c1', 'c2', 'c3']);
const DOMAINS = new Set(['money', 'work', 'family', 'health', 'meaning', 'relation', 'mobility']);
const ETYPES = new Set(['genealogy', 'coupling', 'tension', 'produces', 'operationalizes']);
const EVS = new Set(['emp', 'obs', 'fw', 'nat', 'spec']);
const REQ = ['id', 'cn', 'en', 'scholar', 'work', 'year', 'disc', 'school', 'core', 'detail', 'aka', 'domains', 'links'];

/* ---------- nodes ---------- */
const ids = new Set();
const dupes = new Set();
for (const n of DB.theories) {
  if (ids.has(n.id)) dupes.add(n.id);
  ids.add(n.id);
  for (const k of REQ) {
    if (n[k] === undefined || n[k] === null || n[k] === '') err(`node ${n.id}: missing/empty field '${k}'`);
  }
  if (n.disc && !DISCS.has(n.disc)) err(`node ${n.id}: bad disc '${n.disc}'`);
  (n.stages || []).forEach((s) => { if (!STAGES.has(s)) err(`node ${n.id}: bad stage '${s}'`); });
  (n.classes || []).forEach((c) => { if (!CLASSES.has(c)) err(`node ${n.id}: bad class '${c}'`); });
  (n.domains || []).forEach((d) => { if (!DOMAINS.has(d)) err(`node ${n.id}: bad domain '${d}'`); });
  if (!Array.isArray(n.domains) || !n.domains.length) err(`node ${n.id}: domains must be non-empty array`);
  if (!Array.isArray(n.links) || !n.links.length) err(`node ${n.id}: links must be non-empty array`);
  (n.links || []).forEach((l, i) => {
    if (!l.t || !l.u) err(`node ${n.id}: links[${i}] missing t/u`);
    else if (!/^https?:\/\//.test(l.u)) err(`node ${n.id}: links[${i}] non-http url`);
  });
  if ((n.core || '').length > 90) warn(`node ${n.id}: core too long (${(n.core || '').length}ch) — keep it one line`);
  if ((n.detail || '').length < 200) warn(`node ${n.id}: detail thin (${(n.detail || '').length}ch)`);
}
dupes.forEach((d) => err(`duplicate node id: ${d}`));

/* ---------- edges ---------- */
const deg = new Map();
const linDeg = new Map();
const LIN = new Set(['genealogy', 'produces', 'operationalizes']);
const pairKey = (e) => [e.f, e.t].sort().join('|');
const seenPair = new Map();
DB.edges.forEach((e, i) => {
  if (!ids.has(e.f)) err(`edge[${i}]: dangling f '${e.f}'`);
  if (!ids.has(e.t)) err(`edge[${i}]: dangling t '${e.t}'`);
  if (e.f === e.t) err(`edge[${i}]: self-loop ${e.f}`);
  if (!ETYPES.has(e.type)) err(`edge[${i}] ${e.f}→${e.t}: bad type '${e.type}'`);
  if (!e.label) err(`edge[${i}] ${e.f}→${e.t}: missing label`);
  if (!e.m) err(`edge[${i}] ${e.f}→${e.t}: missing m`);
  if (e.ev && !EVS.has(e.ev)) err(`edge[${i}] ${e.f}→${e.t}: bad ev '${e.ev}'`);
  if (e.s !== undefined && (e.s < 1 || e.s > 5)) err(`edge[${i}] ${e.f}→${e.t}: bad s '${e.s}'`);
  if ((e.label || '').length > 22) warn(`edge[${i}] ${e.f}→${e.t}: label long (${(e.label || '').length}ch)`);
  if (e.m && (e.m.length < 80 || e.m.length > 260)) warn(`edge[${i}] ${e.f}→${e.t}: m len ${e.m.length}ch outside 80-260`);
  const k = pairKey(e) + '|' + e.type;
  if (seenPair.has(k)) warn(`edge[${i}]: duplicate ${e.type} pair ${e.f}|${e.t} (also at edge[${seenPair.get(k)}])`);
  else seenPair.set(k, i);
  deg.set(e.f, (deg.get(e.f) || 0) + 1);
  deg.set(e.t, (deg.get(e.t) || 0) + 1);
  if (LIN.has(e.type)) {
    linDeg.set(e.f, (linDeg.get(e.f) || 0) + 1);
    linDeg.set(e.t, (linDeg.get(e.t) || 0) + 1);
  }
});

/* ---------- cells ---------- */
const cellSeen = new Set();
for (const c of DB.cells) {
  if (!STAGES.has(c.stage)) err(`cell: bad stage '${c.stage}'`);
  if (!CLASSES.has(c.cls)) err(`cell: bad cls '${c.cls}'`);
  const k = c.stage + c.cls;
  if (cellSeen.has(k)) err(`cell: duplicate ${k}`);
  cellSeen.add(k);
  if (!c.mech || !c.out) err(`cell ${k}: missing mech/out`);
  (c.theories || []).forEach((t) => { if (!ids.has(t)) err(`cell ${k}: theory '${t}' not in nodes`); });
  if ((c.theories || []).length < 6) warn(`cell ${k}: sparse (${(c.theories || []).length} theories)`);
}
if (DB.cells.length !== 12) warn(`cells: expected 12, got ${DB.cells.length}`);

/* ---------- deepdives / boundaries ---------- */
(DB.deepdives || []).forEach((d, i) => { if (!(d.title || d.t) || !d.body) err(`deepdives[${i}]: missing title/body`); });
(DB.boundaries || []).forEach((b, i) => { if (!b.t || !b.body) err(`boundaries[${i}]: missing t/body`); });

/* ---------- index.html registration ---------- */
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
for (const f of [...NODE_FILES, 'citations.js', 'data.js', 'app.js', 'mascots.js']) {
  if (existsSync(join(ROOT, f)) && !html.includes(`src="${f}"`) && !html.includes(`'./${f}'`) && !html.includes(`./${f}`))
    err(`index.html: '${f}' not registered`);
}
/* stray batch files on disk but not loaded — only flag files that still push data */
for (const f of readdirSync(ROOT).filter((x) => /^edges_.*\.js$/.test(x))) {
  const code = readFileSync(join(ROOT, f), 'utf8');
  if (/window\.DB_NEW_EDGES/.test(code) && !html.includes(f))
    warn(`${f}: defines edges but is not loaded by index.html (merge into data.js or delete)`);
}

/* ---------- build_dist.py file list ---------- */
const buildPy = readFileSync(join(ROOT, 'build_dist.py'), 'utf8');
for (const f of NODE_FILES) {
  if (!buildPy.includes(`"${f}"`)) err(`build_dist.py: '${f}' missing from file lists`);
}

/* ---------- graph stats (warnings) ---------- */
const orphans = DB.theories.filter((n) => !deg.get(n.id));
const semiOrphans = DB.theories.filter((n) => deg.get(n.id) && !linDeg.get(n.id));
if (orphans.length) warn(`${orphans.length} orphan nodes (0 edges): ${orphans.map((n) => n.id).slice(0, 10).join(',')}${orphans.length > 10 ? '…' : ''}`);
warn(`${semiOrphans.length} semi-orphan nodes (no lineage edge)`);
const schools = new Map();
DB.theories.forEach((n) => schools.set(n.school, (schools.get(n.school) || 0) + 1));
const frag = [...schools.entries()].filter(([, c]) => c <= 2);
warn(`${schools.size} schools, ${frag.length} with ≤2 members`);

/* ---------- report ---------- */
const linNodes = linDeg.size;
console.log(`\n=== class-lifecourse-matrix validation ===`);
console.log(`nodes: ${DB.theories.length} | edges: ${DB.edges.length} | cells: ${DB.cells.length} | schools: ${schools.size}`);
console.log(`lineage-covered nodes: ${linNodes}/${DB.theories.length}`);
console.log(`node files: ${NODE_FILES.join(', ')}`);
if (!quiet && warnings.length) {
  console.log(`\n-- warnings (${warnings.length}) --`);
  warnings.forEach((w) => console.log('  ⚠ ' + w));
}
if (errors.length) {
  console.log(`\n-- ERRORS (${errors.length}) --`);
  errors.forEach((e) => console.log('  ✗ ' + e));
  console.log('\nVALIDATION FAILED');
  process.exit(1);
}
console.log('\nVALIDATION PASSED' + (warnings.length ? ` (${warnings.length} warnings)` : ' — clean'));
