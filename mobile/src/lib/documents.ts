import { Linking, Share } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import type { BusinessReport, BusinessSettings, Invoice } from '../api/business';
import { formatAmount } from '../components/Common/ui';
import { formatShortDate } from '../utils/format';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

const BASE_CSS = `
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #10201C; margin: 36px; font-size: 13px; }
  h1 { font-size: 26px; margin: 0; letter-spacing: -0.5px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 1px; color: #5B6B67; margin: 28px 0 8px; }
  .muted { color: #5B6B67; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
  .tag { display: inline-block; padding: 4px 10px; border-radius: 999px; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #5B6B67; border-bottom: 1px solid #D9E2DF; padding: 8px 0; }
  td { padding: 9px 0; border-bottom: 1px solid #EEF2F1; vertical-align: top; }
  .r { text-align: right; }
  .totals { margin-left: auto; width: 280px; margin-top: 14px; }
  .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
  .grand { font-size: 17px; font-weight: 700; border-top: 2px solid #10201C; margin-top: 6px; padding-top: 8px; }
  .box { margin-top: 24px; padding: 14px; background: #F5F8F7; border-radius: 10px; white-space: pre-wrap; }
  footer { margin-top: 36px; font-size: 11px; color: #8A9894; }
`;

async function sharePdf(html: string, title: string) {
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: title });
  } else {
    await Print.printAsync({ uri });
  }
}

function invoiceTag(inv: Invoice): { label: string; bg: string; fg: string } {
  if (inv.status === 'paid') return { label: 'Paid', bg: '#DDF3E6', fg: '#1D7A46' };
  if (inv.status === 'void') return { label: 'Void', bg: '#EEF2F1', fg: '#5B6B67' };
  if (inv.overdue) return { label: 'Overdue', bg: '#FBE3DF', fg: '#B3321F' };
  if (inv.status === 'part_paid') return { label: 'Part paid', bg: '#F8EDD5', fg: '#8A6415' };
  return { label: 'Due', bg: '#E1F0EC', fg: '#0F6B5C' };
}

export function invoiceHtml(inv: Invoice, business: BusinessSettings | null, fallbackName: string, glyph: string): string {
  const m = (n: number) => esc(formatAmount(n, glyph));
  const tag = invoiceTag(inv);
  const name = business?.businessName || fallbackName;
  const contact = [business?.businessAddress, business?.businessPhone, business?.businessEmail].filter(Boolean).map(esc).join('<br/>');
  const rows = inv.items
    .map((i) => `<tr><td>${esc(i.description)}</td><td class="r">${esc(i.quantity)}</td><td class="r">${m(i.unitPrice)}</td><td class="r">${m(i.quantity * i.unitPrice)}</td></tr>`)
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"/><style>${BASE_CSS}</style></head><body>
    <div class="top">
      <div><h1>${esc(name)}</h1><div class="muted" style="margin-top:6px">${contact}</div></div>
      <div style="text-align:right">
        <div style="font-size:22px;font-weight:700">Invoice</div>
        <div class="muted" style="margin-top:4px">${esc(inv.number)}</div>
        <div style="margin-top:8px"><span class="tag" style="background:${tag.bg};color:${tag.fg}">${tag.label}</span></div>
      </div>
    </div>
    <div class="top" style="margin-top:28px">
      <div><h2 style="margin-top:0">Bill to</h2><div style="font-weight:600">${esc(inv.customerName)}</div>
        <div class="muted">${[inv.customerPhone, inv.customerEmail].filter(Boolean).map(esc).join('<br/>')}</div></div>
      <div style="text-align:right"><h2 style="margin-top:0">Dates</h2>
        <div>Issued ${esc(formatShortDate(inv.issueDate))}</div><div>Due ${esc(formatShortDate(inv.dueDate))}</div></div>
    </div>
    <table style="margin-top:24px"><thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="totals">
      <div><span class="muted">Subtotal</span><span>${m(inv.subtotal)}</span></div>
      ${inv.vatAmount > 0 ? `<div><span class="muted">VAT (${esc(inv.vatRate)}%)</span><span>${m(inv.vatAmount)}</span></div>` : ''}
      <div class="grand"><span>Total</span><span>${m(inv.total)}</span></div>
      ${inv.amountPaid > 0 ? `<div><span class="muted">Paid</span><span>${m(inv.amountPaid)}</span></div><div style="font-weight:700"><span>Balance due</span><span>${m(inv.balance)}</span></div>` : ''}
    </div>
    ${inv.notes ? `<div class="box">${esc(inv.notes)}</div>` : ''}
    <footer>Thank you for your business.</footer>
  </body></html>`;
}

export function shareInvoicePdf(inv: Invoice, business: BusinessSettings | null, fallbackName: string, glyph: string) {
  return sharePdf(invoiceHtml(inv, business, fallbackName, glyph), `Invoice ${inv.number}`);
}

/** A short, polite WhatsApp message for the invoice's current state. */
export function invoiceMessage(inv: Invoice, businessName: string, glyph: string): string {
  const first = inv.customerName.trim().split(/\s+/)[0] || inv.customerName;
  if (inv.status === 'paid') return `Hello ${first}, thank you for your payment of ${formatAmount(inv.total, glyph)} for invoice ${inv.number}. We appreciate you! 🙏\n\n${businessName}`;
  const items = inv.items
    .slice(0, 3)
    .map((i) => `• ${i.description}${i.quantity !== 1 ? ` × ${i.quantity}` : ''}`)
    .join('\n');
  const lead = inv.overdue
    ? `Hello ${first}, a gentle reminder that invoice ${inv.number} for ${formatAmount(inv.balance, glyph)} was due on ${formatShortDate(inv.dueDate)}.`
    : `Hello ${first}, here’s invoice ${inv.number} from ${businessName} for ${formatAmount(inv.balance, glyph)}, due ${formatShortDate(inv.dueDate)}.`;
  return [lead, items, inv.notes ? inv.notes : null, 'Thank you!'].filter(Boolean).join('\n\n');
}

/** Nigerian numbers written 080… become 23480… for WhatsApp links. */
export function whatsappNumber(phone?: string | null): string | null {
  const d = String(phone ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('0') && d.length === 11) return `234${d.slice(1)}`;
  return d;
}

export async function sendOnWhatsApp(phone: string | null | undefined, text: string): Promise<void> {
  const num = whatsappNumber(phone);
  const app = `whatsapp://send?text=${encodeURIComponent(text)}${num ? `&phone=${num}` : ''}`;
  try {
    if (await Linking.canOpenURL(app)) {
      await Linking.openURL(app);
      return;
    }
  } catch {
    // fall through to the web link
  }
  try {
    await Linking.openURL(`https://wa.me/${num ?? ''}?text=${encodeURIComponent(text)}`);
    return;
  } catch {
    // fall back to the share sheet
  }
  await Share.share({ message: text });
}

export function reportHtml(report: BusinessReport, glyph: string): string {
  const m = (n: number) => esc(formatAmount(n, glyph));
  const pl = report.profitAndLoss;
  const lines = (list: Array<{ category: string; amount: number }>) =>
    list.length ? list.map((r) => `<tr><td>${esc(r.category)}</td><td class="r">${m(r.amount)}</td></tr>`).join('') : '<tr><td class="muted">Nothing recorded</td><td></td></tr>';
  const months = report.cashFlow.months
    .map((mm) => `<tr><td>${esc(mm.label)}</td><td class="r">${m(mm.moneyIn)}</td><td class="r">${m(mm.moneyOut)}</td><td class="r">${m(mm.net)}</td></tr>`)
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"/><style>${BASE_CSS}</style></head><body>
    <div class="top">
      <div><h1>${esc(report.business.name)}</h1><div class="muted" style="margin-top:6px">${[report.business.address, report.business.phone, report.business.email].filter(Boolean).map(esc).join(' · ')}</div></div>
      <div style="text-align:right"><div style="font-size:20px;font-weight:700">Business report</div>
        <div class="muted" style="margin-top:4px">${esc(formatShortDate(report.from))} – ${esc(formatShortDate(report.to))}</div></div>
    </div>

    <h2>Profit and loss</h2>
    <table><thead><tr><th>Revenue</th><th class="r">Amount</th></tr></thead><tbody>${lines(pl.revenue)}
      <tr><td style="font-weight:700">Total revenue</td><td class="r" style="font-weight:700">${m(pl.revenueTotal)}</td></tr></tbody></table>
    <table style="margin-top:14px"><thead><tr><th>Costs</th><th class="r">Amount</th></tr></thead><tbody>${lines(pl.costs)}
      <tr><td style="font-weight:700">Total costs</td><td class="r" style="font-weight:700">${m(pl.costsTotal)}</td></tr></tbody></table>
    <div class="totals">
      <div class="grand"><span>Net profit</span><span>${m(pl.netProfit)}</span></div>
      ${pl.margin != null ? `<div><span class="muted">Margin</span><span>${pl.margin}%</span></div>` : ''}
      <div><span class="muted">Owner’s pay</span><span>${m(pl.ownerPay)}</span></div>
      <div><span class="muted">Kept in the business</span><span>${m(pl.retained)}</span></div>
    </div>

    <h2>Cash flow</h2>
    <table><thead><tr><th>Month</th><th class="r">Money in</th><th class="r">Money out</th><th class="r">Net</th></tr></thead><tbody>
      <tr><td class="muted">Opening balance</td><td></td><td></td><td class="r">${m(report.cashFlow.openingBalance)}</td></tr>
      ${months}
      <tr><td style="font-weight:700">Closing balance</td><td></td><td></td><td class="r" style="font-weight:700">${m(report.cashFlow.closingBalance)}</td></tr>
    </tbody></table>

    <h2>Position today</h2>
    <table><tbody>
      <tr><td>Customers owe the business (${report.position.receivables.count})</td><td class="r">${m(report.position.receivables.total)}</td></tr>
      <tr><td>The business owes suppliers and tax (${report.position.payables.count})</td><td class="r">${m(report.position.payables.total)}</td></tr>
    </tbody></table>

    <footer>${esc(report.note)} Generated ${esc(formatShortDate(report.generatedAt))}.</footer>
  </body></html>`;
}

export function shareReportPdf(report: BusinessReport, glyph: string) {
  return sharePdf(reportHtml(report, glyph), `${report.business.name} report`);
}
