/**
 * Reads the debit/credit alert SMS or email that Nigerian banks send
 * (GTBank, Access, Zenith, UBA, First Bank, Kuda, OPay, Moniepoint…) and turns it into a draft transaction.
 * Formats vary a lot, so every field is best-effort and the user confirms before saving.
 */

export type ParsedBankAlert = {
  amount: number;
  direction: 'debit' | 'credit';
  occurredAt: string;
  description: string;
  merchant: string;
  category: string;
  /** 0–1: how many of amount, direction, date and description we found explicitly. */
  confidence: number;
};

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };

function toNumber(raw: string): number {
  return Number(raw.replace(/,/g, ''));
}

function findAmount(lines: string[], text: string): number | null {
  // Balance lines also contain amounts; ignore them.
  const candidates = lines.filter((l) => !/\b(bal|balance|avail)/i.test(l));
  const body = candidates.join('\n');
  const patterns = [
    /\b(?:amt|amount|txn amt)\s*[:=]?\s*(?:NGN|N|₦)?\s*([\d,]+(?:\.\d{1,2})?)/i,
    /(?:NGN|₦)\s?([\d,]+(?:\.\d{1,2})?)/i,
    /\bN\s?([\d,]{3,}(?:\.\d{1,2})?)\b/,
    /\b(?:DR|CR)\s*(?:amt)?\s*[:=]?\s*([\d,]+\.\d{2})/i,
    /\b([\d]{1,3}(?:,\d{3})+(?:\.\d{2})?)\b/
  ];
  for (const p of patterns) {
    const m = body.match(p) ?? (p === patterns[0] ? null : null);
    if (m) {
      const n = toNumber(m[1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  const fallback = text.match(/([\d,]+\.\d{2})/);
  return fallback ? toNumber(fallback[1]) : null;
}

function findDirection(text: string): { value: 'debit' | 'credit'; explicit: boolean } {
  const noBalance = text.replace(/\b(avail(able)?\s*)?bal(ance)?\b[^\n]*/gi, '');
  const debit = noBalance.search(/\b(DR|debit(ed)?|withdrawal|sent|purchase|paid|payment to|transfer to|POS)\b/i);
  const credit = noBalance.search(/\b(CR|credit(ed)?|received|deposit(ed)?|inflow|transfer from|reversal|refund)\b/i);
  if (debit < 0 && credit < 0) return { value: 'debit', explicit: false };
  if (credit < 0) return { value: 'debit', explicit: true };
  if (debit < 0) return { value: 'credit', explicit: true };
  return { value: debit <= credit ? 'debit' : 'credit', explicit: true };
}

function findDate(text: string, now: Date): { value: Date; explicit: boolean } {
  const time = (s: string | undefined) => {
    const t = (s ?? '').match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
    if (!t) return { h: 12, min: 0 };
    let h = Number(t[1]);
    if (t[4]) {
      const pm = t[4].toUpperCase() === 'PM';
      if (pm && h < 12) h += 12;
      if (!pm && h === 12) h = 0;
    }
    return { h, min: Number(t[2]) };
  };

  // 13-Sep-2026, 13 SEP 2026, 13-SEP-26
  let m = text.match(/\b(\d{1,2})[-\s/]([A-Za-z]{3,4})[-\s/,]*(\d{2,4})([^\n]*)/);
  if (m && MONTHS[m[2].toLowerCase()] != null) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const { h, min } = time(m[4]);
    return { value: new Date(year, MONTHS[m[2].toLowerCase()], Number(m[1]), h, min), explicit: true };
  }
  // 2026-09-13
  m = text.match(/\b(\d{4})-(\d{2})-(\d{2})([^\n]*)/);
  if (m) {
    const { h, min } = time(m[4]);
    return { value: new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), h, min), explicit: true };
  }
  // 13/09/2026 or 13-09-26 (Nigerian banks use day first)
  m = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})([^\n]*)/);
  if (m) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const { h, min } = time(m[4]);
    const d = new Date(year, Number(m[2]) - 1, Number(m[1]), h, min);
    if (!Number.isNaN(d.getTime())) return { value: d, explicit: true };
  }
  return { value: now, explicit: false };
}

function findDescription(lines: string[], text: string): { value: string; explicit: boolean } {
  for (const l of lines) {
    const m = l.match(/^\s*(?:desc(?:ription)?|des|narration|narr|remarks?|details?|memo)\s*[:=]\s*(.+)$/i);
    if (m) return { value: m[1].trim(), explicit: true };
  }
  const phrases = [/\b(?:by|at)\s+([A-Z0-9][^.\n]{2,60}?)(?:\.|\s+(?:on|bal|avail)\b|$)/i, /\b(?:sent|paid|transfer(?:red)?)\s+(?:₦?[\d,.]+\s+)?to\s+([^.\n]{2,60}?)(?:\.|$)/i, /\breceived\s+(?:₦?[\d,.]+\s+)?from\s+([^.\n]{2,60}?)(?:\.|$)/i];
  for (const p of phrases) {
    const m = text.match(p);
    if (m) return { value: m[1].trim(), explicit: true };
  }
  const plain = lines.find((l) => !/[:=]/.test(l) && /[A-Za-z]{3,}/.test(l) && !/\b(debit|credit|alert|dear|customer|bal)/i.test(l));
  return { value: plain?.trim() ?? '', explicit: false };
}

export function merchantFrom(description: string): string {
  const cleaned = description
    .replace(/\b(POS|WEB|NIP|TRF|TRANSFER|PURCHASE|PAYMENT|FRM|FROM|TO|VIA|REF|NG|NGA)\b/gi, ' ')
    .replace(/[\/|*#:_-]+/g, ' ')
    .replace(/\d{6,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = cleaned.split(' ').filter((w) => w.length > 1).slice(0, 3);
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') || 'Bank transaction';
}

export function guessCategory(text: string, direction: 'debit' | 'credit'): string {
  const t = text.toLowerCase();
  if (direction === 'credit') {
    if (/salary|payroll|wages/.test(t)) return 'Salary';
    if (/interest/.test(t)) return 'Interest';
    return 'Other';
  }
  if (/shoprite|spar|market|grocer|supermarket|chicken republic|kfc|domino|food|eatery|restaurant|bukka/.test(t)) return 'Food';
  if (/bolt|uber|indrive|taxi|fuel|petrol|total|oando|mobil|conoil|brt|transport/.test(t)) return 'Transport';
  if (/mtn|airtel|glo|9mobile|airtime|data|smile|spectranet/.test(t)) return 'Data & Airtime';
  if (/ikedc|ekedp|eko|disco|electric|prepaid meter|nepa|water|lawma/.test(t)) return 'Bills';
  if (/dstv|gotv|startimes|netflix|showmax|spotify|cinema|filmhouse/.test(t)) return 'Entertainment';
  if (/rent|landlord|estate|agent/.test(t)) return 'Housing';
  if (/pharm|hospital|clinic|medic|hmo/.test(t)) return 'Health';
  if (/jumia|konga|mall|store|shop/.test(t)) return 'Shopping';
  return 'Other';
}

export function parseBankAlert(input: string, now = new Date()): ParsedBankAlert | null {
  const text = input.replace(/\r/g, '').trim();
  if (!text) return null;
  const lines = text.split(/\n|(?<=\.)\s+(?=[A-Z])/).map((l) => l.trim()).filter(Boolean);

  const amount = findAmount(lines, text);
  if (amount == null) return null;
  const direction = findDirection(text);
  const date = findDate(text, now);
  const description = findDescription(lines, text);
  const merchant = merchantFrom(description.value || text);

  return {
    amount,
    direction: direction.value,
    occurredAt: date.value.toISOString(),
    description: description.value || merchant,
    merchant,
    category: guessCategory(`${description.value} ${text}`, direction.value),
    confidence: (1 + (direction.explicit ? 1 : 0) + (date.explicit ? 1 : 0) + (description.explicit ? 1 : 0)) / 4
  };
}
