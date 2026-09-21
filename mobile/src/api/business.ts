import { apiFetch } from './client';

type SpaceId = 'personal' | 'business';

/* ------------------------------------------------------------ goals: confirmable savings */

export type PendingSaving = {
  id: string;
  amount: number;
  source: 'autosave' | 'manual' | 'rollover';
  status: 'pending' | 'confirmed' | 'skipped';
  createdAt: string;
  goal: { id: string; name: string; emoji: string | null; targetAmount: number; currentAmount: number };
};

export async function listPendingSavings(): Promise<PendingSaving[]> {
  const data = await apiFetch('/v1/goal-contributions?status=pending', { method: 'GET' });
  return Array.isArray(data?.items) ? data.items : [];
}

/** "I moved it": the goal grows and a Savings entry lands in the budget. */
export async function confirmSaving(id: string, amount?: number): Promise<{ amount: number }> {
  return apiFetch(`/v1/goal-contributions/${encodeURIComponent(id)}/confirm`, { method: 'POST', body: JSON.stringify(amount ? { amount } : {}) });
}

export async function skipSaving(id: string): Promise<void> {
  await apiFetch(`/v1/goal-contributions/${encodeURIComponent(id)}/skip`, { method: 'POST' });
}

/** Records money put toward a goal. With recordInBudget it also appears as a Savings entry in the budget. */
export async function addMoneyToGoal(goalId: string, input: { amount: number; occurredOn?: string; recordInBudget?: boolean }): Promise<{ amount: number; goal: { currentAmount: number } }> {
  return apiFetch(`/v1/goals/${encodeURIComponent(goalId)}/contributions`, { method: 'POST', body: JSON.stringify(input) });
}

/* ------------------------------------------------------------ business settings and summary */

export type BusinessSettings = {
  businessName: string | null;
  businessEmail: string | null;
  businessPhone: string | null;
  businessAddress: string | null;
  vatRegistered: boolean;
  vatRate: number;
  /** Share customers commonly withhold and remit for you. Editable per payment. */
  whtRate: number;
  taxSetAsidePct: number;
  runwayBufferMonths: number;
  invoicePrefix: string;
  filingReminders: boolean;
};

export type TaxDeadline = { kind: 'vat' | 'paye'; title: string; dueDate: string; forPeriod: string; note: string };

export type PayYourselfSuggestion = {
  suggested: number;
  alreadyPaid: number;
  profit: number;
  taxSetAside: number;
  cash: number;
  buffer: number;
  bufferMonths: number;
  openBills: number;
  country: string;
};

export type CompanyTax = {
  exempt: boolean;
  turnover: number;
  profit: number;
  rate: number;
  threshold: number;
  estimated: number;
  afterCredits: number;
  note: string;
};

export type BusinessSummary = {
  settings: BusinessSettings;
  month: string;
  series: Array<{ month: string; label: string; revenue: number; costs: number; profit: number; ownerPay: number }>;
  current: { month: string; label: string; revenue: number; costs: number; profit: number; ownerPay: number };
  margin: number | null;
  changeVsLastMonth: number | null;
  topCosts: Array<{ category: string; amount: number }>;
  cash: number;
  avgMonthlyCosts: number;
  runwayMonths: number | null;
  receivables: { openCount: number; openTotal: number; overdueCount: number; overdueTotal: number };
  payables: { openCount: number; openTotal: number; dueSoonCount: number; dueSoonTotal: number; payeOwed: number };
  staffCount: number;
  tax: {
    setAsidePct: number;
    setAside: number;
    vatCollectedThisMonth: number;
    /** VAT paid on business costs, which comes off what you remit. */
    vatPaidThisMonth: number;
    vatToRemit: number;
    /** Tax customers withheld this year, a credit against company income tax. */
    whtCreditsThisYear: number;
    companyTax: CompanyTax | null;
    filings: Array<{ kind: 'vat' | 'paye' | 'cit'; period: string; filedAt: string }>;
    payeOwed: number;
    deadlines: TaxDeadline[];
  };
  payYourself: PayYourselfSuggestion;
};

export async function getBusinessSettings(): Promise<BusinessSettings> {
  return (await apiFetch('/v1/business/settings', { method: 'GET' })).settings;
}

export async function updateBusinessSettings(patch: Partial<BusinessSettings>): Promise<BusinessSettings> {
  return (await apiFetch('/v1/business/settings', { method: 'PATCH', body: JSON.stringify(patch) })).settings;
}

export async function getBusinessSummary(): Promise<BusinessSummary> {
  return (await apiFetch('/v1/business/summary', { method: 'GET' })).summary;
}

/* ------------------------------------------------------------ invoices */

export type InvoiceItem = { description: string; quantity: number; unitPrice: number };
export type InvoiceStatus = 'draft' | 'unpaid' | 'part_paid' | 'paid' | 'void';

export type Invoice = {
  id: string;
  number: string;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  issueDate: string;
  dueDate: string;
  items: InvoiceItem[];
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  /** Tax a customer withheld and remitted on your behalf. Counts towards settling the invoice. */
  whtAmount: number;
  customerId: string | null;
  total: number;
  amountPaid: number;
  balance: number;
  status: InvoiceStatus;
  overdue: boolean;
  daysOverdue: number;
  notes: string | null;
  sentAt: string | null;
  paidAt: string | null;
  createdAt: string;
};

export type InvoiceInput = {
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  issueDate?: string;
  dueDate: string;
  items: InvoiceItem[];
  applyVat?: boolean;
  notes?: string | null;
};

export async function listInvoices(status: 'open' | 'paid' | 'all' = 'all'): Promise<{ items: Invoice[]; totals: { owed: number; overdue: number; overdueCount: number } }> {
  return apiFetch(`/v1/invoices?status=${status}`, { method: 'GET' });
}

export async function getInvoice(id: string): Promise<{ invoice: Invoice; payments: Array<{ id: string; amount: number; paidOn: string }>; business: BusinessSettings }> {
  return apiFetch(`/v1/invoices/${encodeURIComponent(id)}`, { method: 'GET' });
}

export async function createInvoice(input: InvoiceInput): Promise<Invoice> {
  return (await apiFetch('/v1/invoices', { method: 'POST', body: JSON.stringify(input) })).invoice;
}

export async function updateInvoice(id: string, patch: Partial<InvoiceInput> & { status?: 'void' }): Promise<Invoice> {
  return (await apiFetch(`/v1/invoices/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) })).invoice;
}

export async function deleteInvoice(id: string): Promise<void> {
  await apiFetch(`/v1/invoices/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function recordInvoicePayment(id: string, input: { amount?: number; paidOn?: string; whtAmount?: number }): Promise<Invoice> {
  return (await apiFetch(`/v1/invoices/${encodeURIComponent(id)}/payments`, { method: 'POST', body: JSON.stringify(input) })).invoice;
}

export async function markInvoiceSent(id: string): Promise<Invoice> {
  return (await apiFetch(`/v1/invoices/${encodeURIComponent(id)}/sent`, { method: 'POST' })).invoice;
}

/* ------------------------------------------------------------ supplier bills */

export type SupplierBill = {
  id: string;
  kind: 'supplier' | 'paye' | 'vat' | 'other';
  supplierName: string;
  description: string;
  category: string;
  amount: number;
  amountPaid: number;
  balance: number;
  billDate: string;
  dueDate: string;
  status: 'unpaid' | 'part_paid' | 'paid' | 'void';
  overdue: boolean;
  dueInDays: number;
  notes: string | null;
};

export type BillInput = { supplierName: string; description?: string; category?: string; amount: number; billDate?: string; dueDate: string; notes?: string | null };

export async function listBills(status: 'open' | 'paid' | 'all' = 'all'): Promise<{ items: SupplierBill[]; totals: { owe: number; dueThisWeek: number; overdueCount: number } }> {
  return apiFetch(`/v1/bills?status=${status}`, { method: 'GET' });
}

export async function createBill(input: BillInput): Promise<SupplierBill> {
  return (await apiFetch('/v1/bills', { method: 'POST', body: JSON.stringify(input) })).bill;
}

export async function updateBill(id: string, patch: Partial<BillInput> & { status?: 'void' }): Promise<SupplierBill> {
  return (await apiFetch(`/v1/bills/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) })).bill;
}

export async function deleteBill(id: string): Promise<void> {
  await apiFetch(`/v1/bills/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function payBill(id: string, input: { amount?: number; paidOn?: string }): Promise<SupplierBill> {
  return (await apiFetch(`/v1/bills/${encodeURIComponent(id)}/payments`, { method: 'POST', body: JSON.stringify(input) })).bill;
}

/* ------------------------------------------------------------ staff and payroll */

export type Staff = {
  id: string;
  name: string;
  role: string | null;
  monthlyGross: number;
  payeEstimate: number;
  /** Employee's pension share, when it applies to this person. */
  pensionEnabled: boolean;
  pensionRate: number;
  pensionEstimate: number;
  /** National Housing Fund, 2.5% of pay. */
  nhfEnabled: boolean;
  nhfEstimate: number;
  netEstimate: number;
  active: boolean;
};
export type PayrollLine = { staffId: string; name: string; role?: string | null; gross: number; paye: number; pension?: number; nhf?: number; net: number };
export type PayrollRun = {
  id: string;
  period: string;
  label: string;
  paidOn: string;
  totalGross: number;
  totalPaye: number;
  totalNet: number;
  totalPension?: number;
  totalNhf?: number;
  lines: PayrollLine[];
  payeBillId: string | null;
};

/** Business staff, or with spaceId 'personal', household staff (a driver, a nanny, a cook). */
const staffPath = (path: string, spaceId?: 'personal' | 'business') => (spaceId === 'personal' ? `${path}?spaceId=personal` : path);

export async function getPayroll(spaceId?: 'personal' | 'business'): Promise<{ staff: Staff[]; totals: { gross: number; paye: number; net: number }; runs: PayrollRun[] }> {
  return apiFetch(staffPath('/v1/payroll', spaceId), { method: 'GET' });
}

export async function addStaff(
  input: { name: string; role?: string | null; monthlyGross: number; pensionEnabled?: boolean; pensionRate?: number; nhfEnabled?: boolean },
  spaceId?: 'personal' | 'business'
): Promise<Staff> {
  return (await apiFetch(staffPath('/v1/staff', spaceId), { method: 'POST', body: JSON.stringify(input) })).staff;
}

export async function updateStaff(
  id: string,
  patch: Partial<{ name: string; role: string | null; monthlyGross: number; active: boolean; pensionEnabled: boolean; pensionRate: number; nhfEnabled: boolean }>
): Promise<Staff> {
  return (await apiFetch(`/v1/staff/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) })).staff;
}

export async function removeStaff(id: string): Promise<void> {
  await apiFetch(`/v1/staff/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function runPayroll(input: { period: string; paidOn?: string; lines?: Array<{ staffId: string; gross: number }> }, spaceId?: 'personal' | 'business'): Promise<PayrollRun> {
  return (await apiFetch(staffPath('/v1/payroll/runs', spaceId), { method: 'POST', body: JSON.stringify(input) })).run;
}

/* ------------------------------------------------------------ pay yourself */

export async function getPayYourself(): Promise<{ suggestion: PayYourselfSuggestion; history: Array<{ id: string; period: string; amount: number; suggested: number | null; paidOn: string }> }> {
  return apiFetch('/v1/business/pay-yourself', { method: 'GET' });
}

export async function recordOwnerPay(input: { amount: number; paidOn?: string }): Promise<{ overSuggestion: boolean }> {
  return apiFetch('/v1/business/pay-yourself', { method: 'POST', body: JSON.stringify(input) });
}

/* ------------------------------------------------------------ reports */

export type BusinessReport = {
  business: { name: string; email: string | null; phone: string | null; address: string | null };
  currency: string;
  from: string;
  to: string;
  generatedAt: string;
  profitAndLoss: {
    revenue: Array<{ category: string; amount: number; count: number }>;
    revenueTotal: number;
    costs: Array<{ category: string; amount: number; count: number }>;
    costsTotal: number;
    netProfit: number;
    margin: number | null;
    ownerPay: number;
    retained: number;
  };
  cashFlow: { openingBalance: number; months: Array<{ month: string; label: string; moneyIn: number; moneyOut: number; net: number }>; closingBalance: number };
  position: { receivables: { count: number; total: number }; payables: { count: number; total: number } };
  note: string;
};

export async function getBusinessReport(from: string, to: string): Promise<BusinessReport> {
  return (await apiFetch(`/v1/business/report?from=${from}&to=${to}`, { method: 'GET' })).report;
}

/* ------------------------------------------------------------ statement import */

export type StatementSource = 'paystack' | 'moniepoint' | 'bank' | 'other';
export type StatementRow = { date: string; amount: number; direction: 'credit' | 'debit'; description: string; reference?: string | null };

export async function importStatement(input: { source: StatementSource; fileName?: string; spaceId?: SpaceId; rows: StatementRow[] }): Promise<{ imported: number; duplicates: number; skipped: number; total: number }> {
  return apiFetch('/v1/imports/statement', { method: 'POST', body: JSON.stringify(input) });
}

/* ------------------------------------------------------------ money wrapped */

export type Wrapped = {
  period: { kind: 'h1' | 'year'; year: number; start: string; end: string; complete: boolean; label: string };
  space: SpaceId;
  currency: string;
  hasData: boolean;
  persona: { key: string; title: string; line: string };
  totals: { income: number; spending: number; net: number; savingsRate: number | null; ownerPay: number };
  change: { spending: number | null; income: number | null };
  months: Array<{ month: string; income: number; spending: number }>;
  biggestMonth: { month: string; amount: number } | null;
  calmestMonth: { month: string; amount: number } | null;
  bestSavingMonth: { month: string; amount: number } | null;
  topCategories: Array<{ category: string; amount: number; share: number }>;
  topMerchant: { name: string; visits: number; amount: number } | null;
  busiestDay: string | null;
  habits: { transactions: number; daysLogged: number; trackedDays: number; totalDays: number; noSpendDays: number };
  goals: { saved: number; goalsFunded: number };
  budgets: { ended: number; onBudget: number };
  business: {
    revenue: number;
    costs: number;
    profit: number;
    margin: number | null;
    bestMonth: { month: string; profit: number } | null;
    topCustomer: { name: string; amount: number } | null;
    invoicesIssued: number;
    invoicesPaid: number;
    payroll: number;
    ownerPay: number;
  } | null;
};

export async function getWrapped(kind: 'h1' | 'year', year: number, spaceId: SpaceId): Promise<Wrapped> {
  return (await apiFetch(`/v1/wrapped?kind=${kind}&year=${year}&spaceId=${spaceId}`, { method: 'GET' })).wrapped;
}

/* ---------------------------------------------------------------- customers */

export type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  invoiceCount: number;
  /** Still owed across this customer's open invoices. */
  owed: number;
  overdue: boolean;
  lastInvoiceAt: string | null;
};

export async function listCustomers(): Promise<Customer[]> {
  return (await apiFetch('/v1/customers', { method: 'GET' })).items;
}

export async function createCustomer(input: { name: string; phone?: string | null; email?: string | null; notes?: string | null }): Promise<Customer> {
  return (await apiFetch('/v1/customers', { method: 'POST', body: JSON.stringify(input) })).customer;
}

export async function updateCustomer(id: string, patch: Partial<Pick<Customer, 'name' | 'phone' | 'email' | 'notes'>>): Promise<Customer> {
  return (await apiFetch(`/v1/customers/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) })).customer;
}

export async function deleteCustomer(id: string): Promise<void> {
  await apiFetch(`/v1/customers/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/* -------------------------------------------------------------- tax filings */

/** Records that a return has been filed so its deadline stops asking. filed: false undoes it. */
export async function setTaxFiling(input: { kind: 'vat' | 'paye' | 'cit'; period: string; amount?: number; filed?: boolean }): Promise<{ filed: boolean }> {
  return apiFetch('/v1/business/filings', { method: 'POST', body: JSON.stringify(input) });
}
