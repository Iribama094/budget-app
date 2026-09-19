import type { StatementRow, StatementSource } from '../api/business';

/** Splits CSV text into rows, handling quotes, CRLF, a byte-order mark and comma, semicolon or tab separators. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const sample = src.split(/\r?\n/).slice(0, 15).join('\n');
  const delim = [',', ';', '\t'].map((d) => [d, sample.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some(Boolean));
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function iso(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Reads the dates Nigerian banks and payment dashboards export; slashes are read day first (13/09/2026). */
export function parseStatementDate(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    let d = +m[1];
    let mo = +m[2];
    if (mo > 12 && d <= 12) [d, mo] = [mo, d];
    return iso(+m[3], mo, d);
  }
  m = t.match(/^(\d{1,2})[\s\-/]+([A-Za-z]{3,9})[\s\-/,]+(\d{2,4})/);
  if (m) {
    const mo = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    return mo >= 0 ? iso(+m[3], mo + 1, +m[1]) : null;
  }
  m = t.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})/);
  if (m) {
    const mo = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    return mo >= 0 ? iso(+m[3], mo + 1, +m[2]) : null;
  }
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function parseAmount(raw: string | undefined): number {
  const t = String(raw ?? '').trim();
  if (!t) return NaN;
  const negative = /^\(.*\)$/.test(t) || /^-/.test(t.replace(/[^\d.\-()]/g, ''));
  const n = Number(t.replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n) || t.replace(/[^\d]/g, '') === '') return NaN;
  return negative ? -n : n;
}

type Patterns = RegExp[];
const COLUMNS: Record<string, { match: Patterns; exclude?: RegExp }> = {
  date: { match: [/^date$/, /transaction date/, /trans\.? ?date/, /value date/, /posting date/, /paid ?at/, /created ?at/, /date/, /^time$/, /time/] },
  amount: { match: [/^amount$/, /transaction amount/, /amount paid/, /^amount/, /amount/], exclude: /fee|charge|balance|settle/ },
  credit: { match: [/^credit$/, /credit amount/, /money in/, /inflow/, /deposit/, /^cr$/, /credit/], exclude: /card|balance/ },
  debit: { match: [/^debit$/, /debit amount/, /money out/, /outflow/, /withdraw/, /^dr$/, /debit/], exclude: /card|balance/ },
  direction: { match: [/^type$/, /transaction type/, /direction/, /dr\s*\/\s*cr/, /cr\s*\/\s*dr/, /^d\/c$/, /entry type/] },
  description: { match: [/narration/, /description/, /details/, /remarks?/, /particulars/, /memo/, /beneficiary/, /customer name/, /customer/, /^name$/] },
  reference: { match: [/^reference$/, /reference/, /transaction ref/, /^ref/, /session id/, /transaction id/, /^id$/] },
  status: { match: [/^status$/, /status/] }
};

function findColumns(headers: string[]) {
  const lower = headers.map((h) => h.toLowerCase().trim());
  const out: Record<string, number> = {};
  const used = new Set<number>();
  for (const [key, { match, exclude }] of Object.entries(COLUMNS)) {
    out[key] = -1;
    for (const p of match) {
      const idx = lower.findIndex((h, i) => !used.has(i) && p.test(h) && !(exclude && exclude.test(h)));
      if (idx >= 0) {
        out[key] = idx;
        used.add(idx);
        break;
      }
    }
  }
  return out;
}

export type StatementPreview = {
  recognized: boolean;
  rows: StatementRow[];
  skipped: number;
  credits: { count: number; total: number };
  debits: { count: number; total: number };
};

/** Finds the header row, maps its columns and turns each line into a credit or debit. */
export function readStatement(text: string, source: StatementSource): StatementPreview {
  const table = parseCsv(text);
  let headerIdx = -1;
  let cols: Record<string, number> = {};
  for (let i = 0; i < Math.min(table.length, 25); i++) {
    const c = findColumns(table[i]);
    if (c.date >= 0 && (c.amount >= 0 || c.credit >= 0 || c.debit >= 0)) {
      headerIdx = i;
      cols = c;
      break;
    }
  }
  const empty: StatementPreview = { recognized: false, rows: [], skipped: 0, credits: { count: 0, total: 0 }, debits: { count: 0, total: 0 } };
  if (headerIdx < 0) return empty;

  const rows: StatementRow[] = [];
  let skipped = 0;
  for (const line of table.slice(headerIdx + 1)) {
    const date = cols.date >= 0 ? parseStatementDate(line[cols.date] ?? '') : null;
    if (!date) {
      skipped++;
      continue;
    }
    const status = cols.status >= 0 ? String(line[cols.status] ?? '').toLowerCase() : '';
    if (/fail|abandon|revers|declin|pending|cancel/.test(status)) {
      skipped++;
      continue;
    }

    let amount = NaN;
    let direction: 'credit' | 'debit' | null = null;
    if (cols.credit >= 0 || cols.debit >= 0) {
      const c = parseAmount(line[cols.credit]);
      const d = parseAmount(line[cols.debit]);
      if (Math.abs(c) > 0) {
        amount = Math.abs(c);
        direction = 'credit';
      } else if (Math.abs(d) > 0) {
        amount = Math.abs(d);
        direction = 'debit';
      }
    }
    if (!direction && cols.amount >= 0) {
      const a = parseAmount(line[cols.amount]);
      if (Number.isFinite(a) && a !== 0) {
        amount = Math.abs(a);
        const kind = cols.direction >= 0 ? String(line[cols.direction] ?? '').toLowerCase().trim() : '';
        if (/credit|^cr$|inflow|deposit|received|incoming|money in/.test(kind)) direction = 'credit';
        else if (/debit|^dr$|outflow|withdraw|outgoing|money out|transfer out/.test(kind)) direction = 'debit';
        else if (source === 'paystack') direction = 'credit';
        else direction = a < 0 ? 'debit' : 'credit';
      }
    }
    if (!direction || !Number.isFinite(amount) || amount <= 0) {
      skipped++;
      continue;
    }

    rows.push({
      date,
      amount: Math.round(amount * 100) / 100,
      direction,
      description: (cols.description >= 0 ? String(line[cols.description] ?? '') : '').slice(0, 300),
      reference: cols.reference >= 0 ? String(line[cols.reference] ?? '').slice(0, 120) || null : null
    });
  }

  const sum = (dir: 'credit' | 'debit') => {
    const list = rows.filter((r) => r.direction === dir);
    return { count: list.length, total: Math.round(list.reduce((s, r) => s + r.amount, 0) * 100) / 100 };
  };
  return { recognized: true, rows, skipped, credits: sum('credit'), debits: sum('debit') };
}
