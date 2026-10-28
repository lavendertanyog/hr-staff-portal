"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { authHeaders } from '../authSession';
import { useConfirm } from '../ConfirmDialog';
import { formatLeaveDate, openMcFile } from '../leaveFormat';
import { RECEIPT_ACCEPT, cropReceipts, isPdfReceipt, receiptFileToDataUrl, smallReceipts } from '../receiptImage';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://hr-backend-qjww.onrender.com';
const PAGE_SIZE = 6;
const MAX_RECEIPTS = 10; // files per upload; each one is scanned, and scans are limited per person per day

const STATUS_LABEL = {
  PENDING: 'Waiting for manager',
  MANAGER_APPROVED: 'Waiting for HR',
  APPROVED: 'Approved',
  PAID: 'Paid',
  REJECTED: 'Rejected',
};
const STATUS_COLOR = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  MANAGER_APPROVED: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-green-100 text-green-700',
  PAID: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
};
const FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'OPEN', label: 'In review' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'PAID', label: 'Paid' },
  { key: 'REJECTED', label: 'Rejected' },
];

const sgtToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
const money = (currency, amount) => `${currency} ${Number(amount || 0).toFixed(2)}`;

// Claims in another currency also carry the amount in SGD at the purchase date's rate.
const fxNote = (c) => (c.currency !== 'SGD' && c.amount_base != null ? `≈ SGD ${Number(c.amount_base).toFixed(2)}` : '');
const fxDetail = (c) => {
  if (c.currency === 'SGD') return '';
  if (c.fx_rate == null) return `No exchange rate found for ${c.currency} on the purchase date.`;
  return `1 ${c.currency} = ${Number(c.fx_rate)} SGD (${c.fx_source || 'rate'} for ${c.fx_rate_date})`;
};
const emptyItem = () => ({ description: '', quantity: '', amount: '' });
// Lines between the items and the total. A receipt can have several (service charge, two tax
// rates, rounding), so they are a list rather than one tax field.
const CHARGE_KINDS = [
  { code: 'TAX', label: 'Tax' },
  { code: 'SERVICE_CHARGE', label: 'Service charge' },
  { code: 'ROUNDING', label: 'Rounding' },
  { code: 'DISCOUNT', label: 'Discount' },
  { code: 'OTHER', label: 'Other' },
];
const chargeKindLabel = (code) => CHARGE_KINDS.find((k) => k.code === code)?.label || code;
const emptyCharge = () => ({ kind: 'TAX', label: '', rate: '', amount: '' });
// How a line changes the total: discounts subtract, and tax already inside the prices adds nothing.
const chargeEffect = (ch, taxInclusive) => {
  const amount = Number(ch.amount) || 0;
  if (ch.kind === 'DISCOUNT') return -amount;
  if (ch.kind === 'TAX' && taxInclusive) return 0;
  return amount;
};
const emptyForm = () => ({
  purchaseDate: '', merchant: '', category: '', currency: 'SGD', totalAmount: '',
  projectCode: '', notes: '', items: [emptyItem()], charges: [], taxInclusive: false,
});
const chargesFromApi = (list) => (list || []).map((ch) => ({ kind: ch.kind, label: ch.label || '', rate: ch.rate ?? '', amount: ch.amount ?? '' }));
let draftSeq = 0;
// One receipt being prepared. claimId is set when it edits a claim already submitted. A photo or
// PDF holding several receipts becomes one draft per receipt; they share its fileId, and
// scanIndex says which receipt of scanId each one is. source is the original File (cropped from
// at full resolution); cropUrl is the receipt cut out of it, when it was read on its own.
const newDraft = (receipt, extra = {}) => {
  const key = `d${++draftSeq}`;
  return {
    key, fileId: key, claimId: null, receipt, receiptChanged: true, scanning: false,
    scanNote: null, scanId: null, scanIndex: null, form: emptyForm(), invalid: {}, error: '', ...extra,
  };
};

// The form with a scanned receipt's fields filled in; anything the scan couldn't read is kept.
const formFromScan = (form, s) => ({
  ...form,
  purchaseDate: s.purchaseDate || form.purchaseDate,
  merchant: s.merchant || form.merchant,
  category: s.category || form.category,
  currency: s.currency || form.currency,
  totalAmount: s.totalAmount != null ? String(s.totalAmount) : form.totalAmount,
  items: s.items?.length
    ? s.items.map((it) => ({ description: it.description, quantity: it.quantity ?? '', amount: it.amount ?? '' }))
    : form.items,
  charges: Array.isArray(s.charges) ? chargesFromApi(s.charges) : form.charges,
  taxInclusive: s.taxInclusive === true,
});

const scanNoteFor = (s, position, count) => {
  if (s.message) return { type: 'warn', text: count > 1 ? `Receipt ${position} of ${count} in this file. ${s.message}` : s.message };
  return { type: 'info', text: count > 1
    ? `Receipt ${position} of ${count} in this file, filled in as its own claim. Check every field before you submit.`
    : 'Filled in from the receipt. Check every field before you submit.' };
};

const inputCls = (bad) => `w-full rounded-xl border ${bad ? 'border-red-400' : 'border-slate-300'} px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`;
const smallInputCls = 'rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

function toPayload(form) {
  return {
    purchaseDate: form.purchaseDate,
    merchant: form.merchant.trim(),
    category: form.category,
    currency: form.currency.trim().toUpperCase() || 'SGD',
    totalAmount: Number(form.totalAmount),
    projectCode: form.projectCode || undefined,
    notes: form.notes.trim() || undefined,
    items: form.items
      .filter((it) => it.description.trim())
      .map((it) => ({ description: it.description.trim(), quantity: it.quantity === '' ? null : Number(it.quantity), amount: it.amount === '' ? null : Number(it.amount) })),
    charges: form.charges
      .filter((ch) => ch.amount !== '')
      .map((ch) => ({ kind: ch.kind, label: ch.label.trim() || undefined, rate: ch.rate === '' ? null : Number(ch.rate), amount: Number(ch.amount) })),
    taxInclusive: form.taxInclusive,
  };
}

function invalidFields(d) {
  const f = d.form;
  return {
    receipt: !d.receipt && !d.claimId,
    purchaseDate: !f.purchaseDate,
    merchant: !f.merchant.trim(),
    category: !f.category,
    totalAmount: !(Number(f.totalAmount) > 0),
  };
}

function ReceiptCard({ draft, index, count, categories, projects, onField, onItem, onAddItem, onRemoveItem, onCharge, onAddCharge, onRemoveCharge, onReplacePhoto, onRescan, onRetryPhoto, onClearer, onRemove }) {
  const fileRef = useRef(null);
  const { form, invalid } = draft;
  const cur = form.currency || 'SGD';
  const itemsTotal = form.items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
  const chargesTotal = form.charges.reduce((s, ch) => s + chargeEffect(ch, form.taxInclusive), 0);
  const addsUpTo = itemsTotal + chargesTotal;
  const total = Number(form.totalAmount);
  const hasAmounts = form.items.some((it) => it.amount !== '') || form.charges.some((ch) => ch.amount !== '');

  // A claim in another currency shows its SGD amount at the purchase date's rate. The server
  // looks the rate up again on submit; this one is only for display.
  const [fx, setFx] = useState(null); // { rate, rateDate, source } | { missing: true } | null
  const fxCurrency = (form.currency || '').toUpperCase();
  useEffect(() => {
    if (!/^[A-Z]{3}$/.test(fxCurrency) || fxCurrency === 'SGD' || !form.purchaseDate) { setFx(null); return undefined; }
    let alive = true;
    axios.get(`${API_BASE}/api/v1/claims/fx-rate`, { params: { currency: fxCurrency, date: form.purchaseDate }, headers: authHeaders() })
      .then((r) => { if (alive) setFx(r.data?.data || { missing: true }); })
      .catch(() => { if (alive) setFx({ failed: true }); });
    return () => { alive = false; };
  }, [fxCurrency, form.purchaseDate]);
  const mismatch = hasAmounts && Number.isFinite(total) && total > 0 && Math.abs(addsUpTo - total) >= 0.01;

  return (
    <div className={`rounded-2xl border ${draft.error ? 'border-red-300' : 'border-slate-200'} bg-slate-50 p-5`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
          {draft.claimId ? 'Editing claim' : count > 1 ? `Receipt ${index + 1} of ${count}` : 'Receipt'}
        </p>
        <button type="button" onClick={onRemove} className="rounded-xl border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100">
          {draft.claimId ? 'Cancel edit' : 'Remove'}
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
        {/* Photo */}
        <div>
          <div className={`flex min-h-[200px] items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed ${invalid.receipt ? 'border-red-400' : 'border-slate-300'} bg-white`}>
            {draft.receipt && isPdfReceipt(draft.receipt)
              ? (
                <button type="button" onClick={() => openMcFile(draft.receipt)} className="flex flex-col items-center gap-2 px-6 py-8 text-center">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#1540A8" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                  <span className="text-sm font-semibold text-[#1540A8]">PDF receipt</span>
                  <span className="text-xs text-slate-400">Click to open</span>
                </button>
              )
              : draft.receipt
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={draft.receipt} alt="Receipt" className="max-h-[320px] w-full cursor-zoom-in object-contain" onClick={() => openMcFile(draft.receipt)} />
              : draft.claimId && !draft.receiptChanged
                ? (
                  <div className="px-6 text-center">
                    <p className="text-sm text-slate-500">{draft.receiptLoading ? 'Loading the saved receipt…' : "The saved receipt couldn't be loaded right now. It's still kept with this claim."}</p>
                    {!draft.receiptLoading && (
                      <button type="button" onClick={onRetryPhoto} className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100">Try again</button>
                    )}
                  </div>
                )
                : <p className="px-6 text-center text-sm text-slate-400">No receipt</p>}
          </div>
          <input ref={fileRef} type="file" accept={RECEIPT_ACCEPT} className="hidden" onChange={(e) => { onReplacePhoto(e.target.files?.[0] || null); e.target.value = ''; }} />
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} disabled={draft.scanning}
              className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40">
              Change file
            </button>
            {draft.receipt && (
              <button type="button" onClick={onRescan} disabled={draft.scanning}
                className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40">
                Read again
              </button>
            )}
          </div>
          {draft.scanning && <p className="mt-3 rounded-xl bg-[#EAF0FF] px-3 py-2 text-xs font-medium text-[#1a3a8f]">Reading receipt…</p>}
          {!draft.scanning && draft.lowRes && (
            <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
              <p>This receipt is too small in the photo to read reliably, so amounts and dates may be wrong. Please upload a clearer photo.</p>
              <button type="button" onClick={onClearer}
                className="mt-2 w-full rounded-xl border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100">
                Upload a clearer photo
              </button>
            </div>
          )}
          {!draft.scanning && draft.scanNote && !(draft.lowRes && draft.scanNote.type === 'info') && (
            <p className={`mt-3 rounded-xl px-3 py-2 text-xs font-medium ${draft.scanNote.type === 'warn' ? 'bg-amber-50 text-amber-700' : 'bg-[#EAF0FF] text-[#1a3a8f]'}`}>{draft.scanNote.text}</p>
          )}
        </div>

        {/* Fields */}
        <div className={`grid gap-4 sm:grid-cols-2 ${draft.scanning ? 'pointer-events-none opacity-50' : ''}`}>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Date of purchase</label>
            <input type="date" max={sgtToday()} value={form.purchaseDate} onChange={(e) => onField('purchaseDate', e.target.value)} className={inputCls(invalid.purchaseDate)} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Shop, restaurant or company</label>
            <input value={form.merchant} onChange={(e) => onField('merchant', e.target.value)} maxLength={200} className={inputCls(invalid.merchant)} placeholder="e.g. Kopitiam" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Category</label>
            <select value={form.category} onChange={(e) => onField('category', e.target.value)} className={inputCls(invalid.category)}>
              <option value="">Choose a category</option>
              {categories.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-[96px_1fr] gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Currency</label>
              <input value={form.currency} onChange={(e) => onField('currency', e.target.value.toUpperCase().slice(0, 3))} className={inputCls(false)} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Amount paid</label>
              <input type="number" min="0.01" step="0.01" inputMode="decimal" value={form.totalAmount} onChange={(e) => onField('totalAmount', e.target.value)} className={inputCls(invalid.totalAmount)} placeholder="0.00" />
            </div>
          </div>
          {fx && (
            <p className={`sm:col-span-2 -mt-2 rounded-xl px-3 py-2 text-xs ${fx.missing || fx.failed ? 'bg-amber-50 text-amber-700' : 'bg-[#EAF0FF] text-[#1a3a8f]'}`}>
              {fx.failed
                ? "Couldn't check the exchange rate right now. You can still submit; the SGD amount is worked out when the claim is saved."
                : fx.missing
                ? `No exchange rate found for ${fxCurrency} on this date. You can still submit; HR will convert it.`
                : <>
                    {total > 0 ? <><span className="font-semibold">≈ SGD {(total * fx.rate).toFixed(2)}</span> · </> : null}
                    1 {fxCurrency} = {Number(fx.rate)} SGD ({fx.source} for {formatLeaveDate(fx.rateDate)}). You are reimbursed in SGD at this rate.
                  </>}
            </p>
          )}
          <div className="sm:col-span-2">
            <label className="block text-sm font-semibold text-slate-700 mb-2">Project (optional)</label>
            <select value={form.projectCode} onChange={(e) => onField('projectCode', e.target.value)} className={inputCls(false)}>
              <option value="">Not for a project</option>
              {projects.map((p) => <option key={p.project_code} value={p.project_code}>{p.project_code} · {p.project_name}</option>)}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-semibold text-slate-700 mb-2">Items purchased</label>
            <div className="space-y-2">
              {form.items.map((it, i) => (
                <div key={i} className="grid grid-cols-[1fr_72px_110px_auto] gap-2">
                  <input value={it.description} onChange={(e) => onItem(i, 'description', e.target.value)} maxLength={200} placeholder="Item" className={smallInputCls} />
                  <input type="number" min="0" step="1" value={it.quantity} onChange={(e) => onItem(i, 'quantity', e.target.value)} placeholder="Qty" className={smallInputCls} />
                  <input type="number" step="0.01" value={it.amount} onChange={(e) => onItem(i, 'amount', e.target.value)} placeholder="Amount" className={smallInputCls} />
                  <button type="button" onClick={() => onRemoveItem(i)} aria-label="Remove item"
                    className="flex h-9 w-9 items-center justify-center self-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-2">
              <button type="button" onClick={onAddItem} className="rounded-xl border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100">+ Add item</button>
            </div>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-semibold text-slate-700 mb-1">Charges and tax</label>
            <p className="mb-2 text-xs text-slate-400">Lines between the items and the total, as printed: service charge, each tax (for example SST 8% or GST 9%), rounding or a discount. Amounts are in {cur}.</p>
            {form.charges.length > 0 && (
              <div className="space-y-2">
                {form.charges.map((ch, i) => (
                  <div key={i} className="grid grid-cols-[130px_1fr_72px_110px_auto] gap-2">
                    <select value={ch.kind} onChange={(e) => onCharge(i, 'kind', e.target.value)} aria-label="Type" className={smallInputCls}>
                      {CHARGE_KINDS.map((k) => <option key={k.code} value={k.code}>{k.label}</option>)}
                    </select>
                    <input value={ch.label} onChange={(e) => onCharge(i, 'label', e.target.value)} maxLength={60} placeholder="As printed, e.g. SST 8%" aria-label="Label" className={smallInputCls} />
                    <input type="number" min="0" max="100" step="0.01" value={ch.rate} onChange={(e) => onCharge(i, 'rate', e.target.value)} placeholder="%" aria-label="Rate (%)" className={smallInputCls} />
                    <input type="number" step="0.01" value={ch.amount} onChange={(e) => onCharge(i, 'amount', e.target.value)}
                      placeholder={ch.kind === 'DISCOUNT' ? 'Amount off' : 'Amount'} aria-label="Amount" className={smallInputCls} />
                    <button type="button" onClick={() => onRemoveCharge(i)} aria-label="Remove charge"
                      className="flex h-9 w-9 items-center justify-center self-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
              <button type="button" onClick={onAddCharge} className="rounded-xl border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100">+ Add charge or tax</button>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" checked={form.taxInclusive} onChange={(e) => onField('taxInclusive', e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                Prices already include tax (tax is not added on top)
              </label>
            </div>
            {hasAmounts && (
              <p className={`mt-3 rounded-xl px-3 py-2 text-xs ${mismatch ? 'bg-amber-50 text-amber-700' : 'bg-white text-slate-500'}`}>
                Items {money(cur, itemsTotal)}{form.charges.length > 0 ? ` + charges and tax ${money(cur, chargesTotal)}` : ''} = {money(cur, addsUpTo)}
                {mismatch ? `, but the amount paid is ${money(cur, total)}. Check the lines, or add the missing charge, tax or rounding.` : ''}
              </p>
            )}
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-semibold text-slate-700 mb-2">Notes (optional)</label>
            <textarea rows={2} value={form.notes} onChange={(e) => onField('notes', e.target.value)} maxLength={1000}
              className="w-full resize-none rounded-xl border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="What was it for? e.g. client lunch with ABC Pte Ltd" />
          </div>
          {draft.error && <p className="sm:col-span-2 text-sm font-medium text-red-600">{draft.error}</p>}
        </div>
      </div>
    </div>
  );
}

export default function ClaimsPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [categories, setCategories] = useState([]);
  const [projects, setProjects] = useState([]);
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const [confirm, confirmDialog] = useConfirm();

  // Receipts being prepared (one claim each)
  const [drafts, setDrafts] = useState([]);
  const [scanProgress, setScanProgress] = useState(null); // { done, total }
  const [submitting, setSubmitting] = useState(false);
  const addInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const formRef = useRef(null);
  // Files with receipts too small to read, waiting for the person to choose a clearer photo or
  // keep this one (one dialog at a time), and the file a chosen clearer photo replaces.
  const [clearerAsks, setClearerAsks] = useState([]); // [{ fileId, small, total }]
  const retakeFor = useRef(null);
  const retakeFileRef = useRef(null);
  const retakeCameraRef = useRef(null);
  // Phones and tablets get a "Take photo" button that opens the camera straight away.
  const [hasCamera, setHasCamera] = useState(false);
  useEffect(() => { setHasCamera(window.matchMedia('(pointer: coarse)').matches); }, []);
  const editing = drafts.some((d) => d.claimId);
  const fileCount = new Set(drafts.map((d) => d.fileId)).size; // split cards share one file

  // List
  const [filter, setFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState(null);

  const showToast = (text, type) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ text, type });
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('staff_portal_user');
      if (!stored) { router.push('/'); return; }
      setUser(JSON.parse(stored));
    } catch { router.push('/'); }
  }, [router]);

  const loadClaims = useCallback(async () => {
    setLoadError('');
    try {
      const res = await axios.get(`${API_BASE}/api/v1/claims/mine`, { headers: authHeaders() });
      setClaims(res.data?.data || []);
    } catch (err) {
      setClaims([]);
      setLoadError(err.response?.data?.error || 'Failed to load your claims.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user?.user_id) return;
    loadClaims();
    axios.get(`${API_BASE}/api/v1/claims/categories`).then((r) => setCategories(r.data?.data || [])).catch(() => setCategories([]));
    axios.get(`${API_BASE}/api/v1/projects/active-list?userId=${user.user_id}`).then((r) => setProjects(r.data?.data || [])).catch(() => setProjects([]));
  }, [user?.user_id, loadClaims]);

  const categoryLabel = (code) => categories.find((c) => c.code === code)?.label || code;

  // ── Draft helpers ──
  const updateDraft = (key, fn) => setDrafts((list) => list.map((d) => (d.key === key ? fn(d) : d)));
  const setField = (key, field, value) => updateDraft(key, (d) => ({
    ...d, error: '', form: { ...d.form, [field]: value }, invalid: { ...d.invalid, [field]: false },
  }));
  const setItem = (key, i, field, value) => updateDraft(key, (d) => ({
    ...d, form: { ...d.form, items: d.form.items.map((it, j) => (j === i ? { ...it, [field]: value } : it)) },
  }));
  const addItem = (key) => updateDraft(key, (d) => ({ ...d, form: { ...d.form, items: [...d.form.items, emptyItem()] } }));
  const removeItem = (key, i) => updateDraft(key, (d) => ({
    ...d, form: { ...d.form, items: d.form.items.length > 1 ? d.form.items.filter((_, j) => j !== i) : [emptyItem()] },
  }));
  const setCharge = (key, i, field, value) => updateDraft(key, (d) => ({
    ...d, form: { ...d.form, charges: d.form.charges.map((ch, j) => (j === i ? { ...ch, [field]: value } : ch)) },
  }));
  const addCharge = (key) => updateDraft(key, (d) => ({ ...d, form: { ...d.form, charges: [...d.form.charges, emptyCharge()] } }));
  const removeCharge = (key, i) => updateDraft(key, (d) => ({
    ...d, form: { ...d.form, charges: d.form.charges.filter((_, j) => j !== i) },
  }));

  const postScan = async (receiptImage, parentScanId) => (
    (await axios.post(`${API_BASE}/api/v1/claims/scan`, { receiptImage, parentScanId }, { headers: authHeaders() })).data || {}
  );

  // Reads one receipt cropped out of a file, on its own: { scanId, receipt } or null. A crop can
  // catch the edge of a neighbouring receipt, so the one nearest its middle is used.
  const readCrop = async (crop, parentScanId) => {
    try {
      const body = await postScan(crop, parentScanId);
      const found = body.available ? body.data?.receipts || [] : [];
      if (found.length === 0) return null;
      const offCentre = (r) => (r.box ? ((r.box[0] + r.box[2]) / 2 - 500) ** 2 + ((r.box[1] + r.box[3]) / 2 - 500) ** 2 : Infinity);
      return { scanId: body.scanId || null, receipt: found.reduce((best, r) => (offCentre(r) < offCentre(best) ? r : best)) };
    } catch {
      return null;
    }
  };

  // Reads the card's file. With split, every receipt found after the first gets its own card
  // right after this one (same file), and receipts that share a photo or PDF page with another
  // are then cropped out of the original (`source`, full resolution) and read again on their
  // own, since small print on a picture of several receipts is often misread. Without split
  // (reading a card again when its file was already split, or editing a claim), only this
  // card's own receipt is filled in.
  const scanDraft = async (key, { dataUrl, source = null, fileId, split = true }) => {
    updateDraft(key, (d) => ({ ...d, scanning: true, scanNote: null }));
    try {
      const body = await postScan(dataUrl);
      if (!body.available) {
        updateDraft(key, (d) => ({ ...d, scanning: false, scanNote: { type: 'warn', text: body.message || 'Receipt scanning is unavailable. Please fill in the details yourself.' } }));
        return;
      }
      const receipts = body.data?.receipts || [];
      const scanId = body.scanId || null;
      if (!split) {
        updateDraft(key, (d) => {
          const s = receipts.find((r) => r.scanIndex === d.scanIndex) || receipts[0] || {};
          return { ...d, scanning: false, scanId, scanIndex: s.scanIndex ?? null, invalid: {}, scanNote: scanNoteFor(s, 1, 1), form: formFromScan(d.form, s) };
        });
        return;
      }

      const count = receipts.length;
      const perPage = {};
      receipts.forEach((r) => { perPage[r.page] = (perPage[r.page] || 0) + 1; });
      const toCrop = receipts.map((r) => Boolean(r.box) && perPage[r.page] > 1);
      // Receipts too small in the photo to read reliably are still filled in, but the person is
      // asked for a clearer photo.
      const small = await smallReceipts(source || dataUrl, receipts);
      const first = receipts[0] || {};
      const more = receipts.slice(1).map((s, i) => newDraft(dataUrl, {
        fileId, source, scanId, scanIndex: s.scanIndex, scanning: toCrop[i + 1], lowRes: small[i + 1],
        scanNote: toCrop[i + 1] ? null : scanNoteFor(s, i + 2, count), form: formFromScan(emptyForm(), s),
      }));
      const keys = [key, ...more.map((m) => m.key)];
      setDrafts((list) => {
        const at = list.findIndex((d) => d.key === key);
        if (at < 0) return list;
        const d = list[at];
        const filled = {
          ...d, scanning: toCrop[0], scanId, scanIndex: first.scanIndex ?? null, invalid: {}, lowRes: small[0],
          scanNote: toCrop[0] ? null : scanNoteFor(first, 1, count), form: formFromScan(d.form, first),
        };
        return [...list.slice(0, at), filled, ...more, ...list.slice(at + 1)];
      });
      if (count > 1) showToast(`Found ${count} receipts in one file. Each is its own claim.`, 'success');
      const smallCount = small.filter(Boolean).length;
      if (smallCount > 0) setClearerAsks((q) => [...q.filter((a) => a.fileId !== fileId), { fileId, small: smallCount, total: count }]);
      if (!toCrop.some(Boolean)) return;

      let crops;
      try {
        crops = await cropReceipts(source || dataUrl, receipts.map((r, i) => (toCrop[i] ? r : { ...r, box: null })));
      } catch {
        crops = receipts.map(() => null);
      }
      await Promise.all(receipts.map(async (s, i) => {
        if (!toCrop[i]) return;
        const read = crops[i] ? await readCrop(crops[i], scanId) : null;
        updateDraft(keys[i], (d) => (read
          ? {
            ...d, scanning: false, scanId: read.scanId, scanIndex: read.receipt.scanIndex, cropUrl: crops[i], parentScanId: scanId,
            scanNote: scanNoteFor(read.receipt, i + 1, count), form: formFromScan(d.form, read.receipt),
          }
          : {
            ...d, scanning: false,
            scanNote: { type: 'warn', text: `Receipt ${i + 1} of ${count} in this file. It couldn't be read on its own, so it was filled in from the whole file, and small print may be wrong. Check every field.` },
          }));
      }));
    } catch (err) {
      updateDraft(key, (d) => ({ ...d, scanning: false, scanNote: { type: 'warn', text: err.response?.data?.error || "We couldn't read the receipt. Please fill in the details yourself." } }));
    }
  };

  // Several files at once: each becomes its own card (more if it holds several receipts), read one after another.
  const addPhotos = async (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    const room = MAX_RECEIPTS - fileCount;
    if (room <= 0) { showToast(`You can add up to ${MAX_RECEIPTS} files at a time.`, 'error'); return; }
    if (files.length > room) showToast(`Only the first ${room} file(s) were added (${MAX_RECEIPTS} at a time).`, 'error');
    const added = [];
    for (const file of files.slice(0, room)) {
      try {
        added.push(newDraft(await receiptFileToDataUrl(file), { source: file }));
      } catch (err) {
        showToast(err.message || 'A file could not be used.', 'error');
      }
    }
    if (added.length === 0) return;
    setDrafts((list) => [...list, ...added]);
    setScanProgress({ done: 0, total: added.length });
    for (let i = 0; i < added.length; i += 1) {
      const d = added[i];
      await scanDraft(d.key, { dataUrl: d.receipt, source: d.source, fileId: d.fileId });
      setScanProgress({ done: i + 1, total: added.length });
    }
    setScanProgress(null);
  };

  const replacePhoto = async (key, file) => {
    if (!file) return;
    try {
      const dataUrl = await receiptFileToDataUrl(file);
      const draft = drafts.find((d) => d.key === key);
      // A new file isn't shared with any other card, even if the old one was.
      const fileId = `f${++draftSeq}`;
      updateDraft(key, (d) => ({
        ...d, fileId, source: file, cropUrl: null, parentScanId: null, lowRes: false, receipt: dataUrl, receiptChanged: true, scanIndex: null,
        invalid: { ...d.invalid, receipt: false },
      }));
      // A new receipt is read straight away; when editing, the details already entered are kept.
      if (draft && !draft.claimId) await scanDraft(key, { dataUrl, source: file, fileId });
    } catch (err) {
      showToast(err.message || 'This file could not be used.', 'error');
    }
  };

  // A clearer photo for a file: the cards made from it are replaced by the ones read from the new
  // photo, starting from an empty form so nothing misread is kept.
  const retakeFile = async (fileId, file) => {
    const group = drafts.filter((d) => d.fileId === fileId);
    if (!file || group.length === 0) return;
    const [first, ...rest] = group;
    const drop = new Set(rest.map((d) => d.key));
    setDrafts((list) => list.filter((d) => !drop.has(d.key)).map((d) => (d.key === first.key ? { ...d, form: emptyForm(), scanNote: null } : d)));
    await replacePhoto(first.key, file);
  };

  // Opens the camera or the file picker for a clearer photo. It must run in the click itself, or
  // the browser blocks the picker.
  const pickClearer = (fileId, useCamera) => {
    retakeFor.current = fileId;
    setClearerAsks((q) => q.filter((a) => a.fileId !== fileId));
    (useCamera ? retakeCameraRef : retakeFileRef).current?.click();
  };

  const keepPhoto = (fileId) => setClearerAsks((q) => q.filter((a) => a.fileId !== fileId));
  // From a card's "Upload a clearer photo" button: ask about its file again.
  const askClearer = (fileId) => {
    const group = drafts.filter((d) => d.fileId === fileId);
    setClearerAsks((q) => [{ fileId, small: group.filter((d) => d.lowRes).length, total: group.length }, ...q.filter((a) => a.fileId !== fileId)]);
  };
  // The dialog shown: the first file still on the page that is waiting for an answer.
  const clearerAsk = clearerAsks.find((a) => drafts.some((d) => d.fileId === a.fileId)) || null;
  useEffect(() => {
    if (!clearerAsk) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') keepPhoto(clearerAsk.fileId); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [clearerAsk]);

  // Reading a card again: a receipt cropped out of a bigger file reads its crop again; otherwise
  // the file is read again, and split only if it isn't already split into other cards.
  const rescanDraft = async (d) => {
    if (d.cropUrl) {
      updateDraft(d.key, (x) => ({ ...x, scanning: true, scanNote: null }));
      const read = await readCrop(d.cropUrl, d.parentScanId);
      updateDraft(d.key, (x) => (read
        ? { ...x, scanning: false, scanId: read.scanId, scanIndex: read.receipt.scanIndex, invalid: {}, scanNote: scanNoteFor(read.receipt, 1, 1), form: formFromScan(x.form, read.receipt) }
        : { ...x, scanning: false, scanNote: { type: 'warn', text: "We couldn't read the receipt again. Check the details yourself." } }));
      return;
    }
    const split = !d.claimId && !drafts.some((o) => o.key !== d.key && o.fileId === d.fileId);
    await scanDraft(d.key, { dataUrl: d.receipt, source: d.source, fileId: d.fileId, split });
  };

  const removeDraft = (key) => setDrafts((list) => list.filter((d) => d.key !== key));

  const clearDrafts = async () => {
    if (drafts.length > 1 && !(await confirm({ title: 'Clear receipts', message: `Remove all ${drafts.length} receipts you haven't submitted?`, confirmLabel: 'Clear', danger: true }))) return;
    setDrafts([]);
  };

  // Submits each card as its own claim. Cards that go through are removed; any that fail stay
  // with their error so nothing typed is lost.
  const submitAll = async () => {
    if (drafts.length === 0) return;
    let anyInvalid = false;
    setDrafts((list) => list.map((d) => {
      const bad = invalidFields(d);
      if (Object.values(bad).some(Boolean)) anyInvalid = true;
      return { ...d, invalid: bad };
    }));
    if (drafts.some((d) => Object.values(invalidFields(d)).some(Boolean)) || anyInvalid) {
      showToast('Please fill in the highlighted field(s).', 'error');
      return;
    }
    setSubmitting(true);
    let submitted = 0;
    let updated = 0;
    const done = new Set();
    for (const d of drafts) {
      const payload = toPayload(d.form);
      try {
        if (d.claimId) {
          await axios.patch(`${API_BASE}/api/v1/claims/${d.claimId}`, { ...payload, receiptImage: d.receiptChanged ? d.receipt : undefined }, { headers: authHeaders() });
          updated += 1;
        } else {
          try {
            await axios.post(`${API_BASE}/api/v1/claims`, { ...payload, receiptImage: d.receipt, scanId: d.scanId || undefined, scanIndex: d.scanIndex ?? undefined }, { headers: authHeaders() });
          } catch (err) {
            if (err.response?.status !== 409 || !err.response?.data?.duplicate) throw err;
            const again = await confirm({ title: 'Possible duplicate', message: err.response.data.error, confirmLabel: 'Submit anyway' });
            if (!again) {
              updateDraft(d.key, (x) => ({ ...x, error: 'Not submitted: possible duplicate of a claim you already made.' }));
              continue;
            }
            await axios.post(`${API_BASE}/api/v1/claims`, { ...payload, receiptImage: d.receipt, scanId: d.scanId || undefined, scanIndex: d.scanIndex ?? undefined, confirmDuplicate: true }, { headers: authHeaders() });
          }
          submitted += 1;
        }
        done.add(d.key);
      } catch (err) {
        updateDraft(d.key, (x) => ({ ...x, error: err.response?.data?.error || 'This receipt could not be submitted.' }));
      }
    }
    setDrafts((list) => list.filter((d) => !done.has(d.key)));
    setSubmitting(false);
    if (submitted || updated) {
      showToast(updated ? 'Claim updated.' : `Submitted ${submitted} claim${submitted === 1 ? '' : 's'}.`, 'success');
      loadClaims();
    }
  };

  const viewReceipt = async (claimId) => {
    try {
      const res = await axios.get(`${API_BASE}/api/v1/claims/${claimId}/receipt`, { headers: authHeaders() });
      openMcFile(res.data?.data?.receiptImage);
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to open the receipt.', 'error');
    }
  };

  // The saved photo is only shown for reference; it stays on the server unless replaced, so a
  // failed load never blocks saving.
  const loadSavedPhoto = async (key, claimId) => {
    updateDraft(key, (d) => ({ ...d, receiptLoading: true }));
    try {
      const res = await axios.get(`${API_BASE}/api/v1/claims/${claimId}/receipt`, { headers: authHeaders() });
      const photo = res.data?.data?.receiptImage || null;
      updateDraft(key, (d) => (d.receiptChanged ? { ...d, receiptLoading: false } : { ...d, receipt: photo, receiptLoading: false }));
    } catch {
      updateDraft(key, (d) => ({ ...d, receiptLoading: false }));
    }
  };

  const startEdit = async (c) => {
    if (drafts.length > 0 && !(await confirm({ title: 'Edit claim', message: "Remove the receipts you haven't submitted and edit this claim instead?", confirmLabel: 'Edit claim' }))) return;
    const draft = newDraft(null, {
      claimId: c.claim_id,
      receiptChanged: false,
      receiptLoading: true,
      form: {
        purchaseDate: c.purchase_date,
        merchant: c.merchant,
        category: c.category,
        currency: c.currency,
        totalAmount: String(Number(c.total_amount)),
        projectCode: c.project_code || '',
        notes: c.notes || '',
        items: c.items?.length ? c.items.map((it) => ({ description: it.description, quantity: it.quantity ?? '', amount: it.amount ?? '' })) : [emptyItem()],
        charges: chargesFromApi(c.charges),
        taxInclusive: c.tax_inclusive === true,
      },
    });
    setDrafts([draft]);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    loadSavedPhoto(draft.key, c.claim_id);
  };

  const deleteClaim = async (c) => {
    const ok = await confirm({
      title: 'Delete claim',
      message: `Delete your claim for ${c.merchant}, ${money(c.currency, c.total_amount)}? This can't be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await axios.delete(`${API_BASE}/api/v1/claims/${c.claim_id}`, { headers: authHeaders() });
      setDrafts((list) => list.filter((d) => d.claimId !== c.claim_id));
      showToast('Claim deleted.', 'success');
      loadClaims();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to delete the claim.', 'error');
    }
  };

  const filtered = claims.filter((c) => {
    if (filter === 'ALL') return true;
    if (filter === 'OPEN') return c.status === 'PENDING' || c.status === 'MANAGER_APPROVED';
    return c.status === filter;
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [filter]);

  const inReview = claims.filter((c) => c.status === 'PENDING' || c.status === 'MANAGER_APPROVED');
  const approvedUnpaid = claims.filter((c) => c.status === 'APPROVED');
  const anyScanning = drafts.some((d) => d.scanning);

  return (
    <div className="p-8">
      <div className="mb-8 pl-3">
        <p className="text-sm uppercase tracking-[0.32em] text-slate-500">Staff Dashboard</p>
        <h1 className="mt-3 text-4xl font-semibold text-slate-950">Claims</h1>
        <p className="mt-2 text-sm text-slate-500">Add photos or PDFs of your receipts. Each receipt is read for you, even when one photo or PDF holds several; check the details and submit. Your manager, then HR, approve each claim, and it is paid with your salary.</p>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">In review</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{loading ? '—' : inReview.length}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Approved, to be paid</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{loading ? '—' : approvedUnpaid.length}</p>
        </div>
      </div>

      {/* New claims from receipt photos */}
      <div ref={formRef} className="mb-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">{editing ? 'Edit claim' : 'New claims'}</p>
          {drafts.length > 0 && !editing && (
            <div className="flex flex-wrap items-center gap-2">
              {scanProgress && <span className="text-xs font-medium text-[#1a3a8f]">Reading file {Math.min(scanProgress.done + 1, scanProgress.total)} of {scanProgress.total}…</span>}
              {hasCamera && (
                <button type="button" onClick={() => cameraInputRef.current?.click()} disabled={fileCount >= MAX_RECEIPTS || anyScanning}
                  className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40">
                  Take photo
                </button>
              )}
              <button type="button" onClick={() => addInputRef.current?.click()} disabled={fileCount >= MAX_RECEIPTS || anyScanning}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40">
                + Add more receipts
              </button>
              <button type="button" onClick={clearDrafts} disabled={submitting}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40">
                Clear
              </button>
            </div>
          )}
        </div>

        <input ref={addInputRef} type="file" accept={RECEIPT_ACCEPT} multiple className="hidden"
          onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }} />
        {/* capture opens the camera straight away on a phone (full resolution, unlike a photo resent through a chat app). */}
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }} />
        <input ref={retakeFileRef} type="file" accept={RECEIPT_ACCEPT} className="hidden"
          onChange={(e) => { retakeFile(retakeFor.current, e.target.files?.[0] || null); e.target.value = ''; }} />
        <input ref={retakeCameraRef} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={(e) => { retakeFile(retakeFor.current, e.target.files?.[0] || null); e.target.value = ''; }} />

        {drafts.length === 0 ? (
          <div className={`grid gap-3 ${hasCamera ? 'sm:grid-cols-2' : ''}`}>
            {hasCamera && (
              <button type="button" onClick={() => cameraInputRef.current?.click()}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center hover:border-[#1540A8] hover:bg-[#EAF0FF] transition">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#1540A8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
                <span className="text-sm font-semibold text-[#1540A8]">Take photo</span>
                <span className="text-xs text-slate-500">Hold the camera close so the print is sharp. Several receipts can go in one photo.</span>
              </button>
            )}
            <button type="button" onClick={() => addInputRef.current?.click()}
              className={`flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 text-center hover:border-[#1540A8] hover:bg-[#EAF0FF] transition ${hasCamera ? 'py-10' : 'py-12'}`}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#1540A8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 2h14v20l-3-2-2 2-2-2-2 2-2-2-3 2z" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="9" y1="12" x2="15" y2="12" /><line x1="9" y1="16" x2="13" y2="16" /></svg>
              <span className="text-sm font-semibold text-[#1540A8]">{hasCamera ? 'Choose photos or PDFs' : 'Add receipt photos or PDFs'}</span>
              <span className="text-xs text-slate-500">Choose up to {MAX_RECEIPTS} files at once. Each receipt becomes its own claim, even when one photo or PDF holds several.</span>
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {drafts.map((d, i) => (
                <ReceiptCard key={d.key} draft={d} index={i} count={drafts.length} categories={categories} projects={projects}
                  onField={(field, value) => setField(d.key, field, value)}
                  onItem={(idx, field, value) => setItem(d.key, idx, field, value)}
                  onAddItem={() => addItem(d.key)}
                  onRemoveItem={(idx) => removeItem(d.key, idx)}
                  onCharge={(idx, field, value) => setCharge(d.key, idx, field, value)}
                  onAddCharge={() => addCharge(d.key)}
                  onRemoveCharge={(idx) => removeCharge(d.key, idx)}
                  onReplacePhoto={(file) => replacePhoto(d.key, file)}
                  onRescan={() => rescanDraft(d)}
                  onRetryPhoto={() => loadSavedPhoto(d.key, d.claimId)}
                  onClearer={() => askClearer(d.fileId)}
                  onRemove={() => removeDraft(d.key)} />
              ))}
            </div>
            <div className="mt-5 flex justify-end">
              <button type="button" onClick={submitAll} disabled={submitting || anyScanning}
                className="rounded-2xl bg-[#1540A8] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#12378F] disabled:opacity-60">
                {submitting ? 'Submitting…' : editing ? 'Save changes' : drafts.length > 1 ? `Submit all (${drafts.length})` : 'Submit claim'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* My claims */}
      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-6 pb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">My claims</p>
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button key={f.key} type="button" onClick={() => setFilter(f.key)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${filter === f.key ? 'bg-[#1540A8] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 uppercase tracking-[0.22em] text-[0.65rem]">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Merchant</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-8 text-sm text-slate-400 text-center">Loading…</td></tr>
              ) : loadError ? (
                <tr><td colSpan={6} className="px-6 py-8 text-sm text-red-600 text-center">{loadError}</td></tr>
              ) : pageRows.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-8 text-sm text-slate-400 text-center">No claims yet.</td></tr>
              ) : pageRows.map((c) => (
                <React.Fragment key={c.claim_id}>
                  <tr className="cursor-pointer hover:bg-slate-50" onClick={() => setExpandedId(expandedId === c.claim_id ? null : c.claim_id)}>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-700">{formatLeaveDate(c.purchase_date)}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{c.merchant}</td>
                    <td className="px-4 py-3 text-slate-600">{categoryLabel(c.category)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap font-medium text-slate-900">
                      {money(c.currency, c.total_amount)}
                      {fxNote(c) && <span className="block text-xs font-normal text-slate-400">{fxNote(c)}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_COLOR[c.status] || 'bg-slate-100 text-slate-600'}`}>{STATUS_LABEL[c.status] || c.status}</span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <button type="button" onClick={() => viewReceipt(c.claim_id)} className="rounded-xl border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100">Receipt</button>
                      {c.status === 'PENDING' && (<>
                        <button type="button" onClick={() => startEdit(c)} className="ml-2 rounded-xl border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100">Edit</button>
                        <button type="button" onClick={() => deleteClaim(c)} className="ml-2 rounded-xl border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-100">Delete</button>
                      </>)}
                    </td>
                  </tr>
                  {expandedId === c.claim_id && (
                    <tr className="bg-slate-50/60">
                      <td colSpan={6} className="px-6 py-4 text-sm text-slate-600">
                        <div className="grid gap-4 md:grid-cols-2">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Items</p>
                            {c.items?.length ? (
                              <ul className="mt-2 space-y-1">
                                {c.items.map((it, i) => (
                                  <li key={i} className="flex justify-between gap-4">
                                    <span>{it.quantity ? `${Number(it.quantity)} × ` : ''}{it.description}</span>
                                    <span className="whitespace-nowrap">{it.amount != null ? Number(it.amount).toFixed(2) : ''}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : <p className="mt-2 text-slate-400">No items listed.</p>}
                            {c.charges?.length > 0 && (
                              <>
                                <p className="mt-4 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Charges and tax</p>
                                <ul className="mt-2 space-y-1">
                                  {c.charges.map((ch, i) => (
                                    <li key={i} className="flex justify-between gap-4">
                                      <span>{ch.label || chargeKindLabel(ch.kind)}{ch.label && ch.label !== chargeKindLabel(ch.kind) ? <span className="text-slate-400"> · {chargeKindLabel(ch.kind)}</span> : null}</span>
                                      <span className="whitespace-nowrap">{ch.kind === 'DISCOUNT' ? '−' : ''}{Number(ch.amount).toFixed(2)}</span>
                                    </li>
                                  ))}
                                </ul>
                                {c.tax_inclusive && <p className="mt-1 text-xs text-slate-400">Prices include tax, so tax isn&apos;t added on top.</p>}
                              </>
                            )}
                          </div>
                          <div className="space-y-1">
                            <p><span className="text-slate-400">Submitted:</span> {formatLeaveDate(c.created_at)}</p>
                            {fxDetail(c) && <p><span className="text-slate-400">Exchange rate:</span> {fxDetail(c)}</p>}
                            {c.project_code && <p><span className="text-slate-400">Project:</span> {c.project_code}{c.project_name ? ` · ${c.project_name}` : ''}</p>}
                            {c.notes && <p><span className="text-slate-400">Notes:</span> {c.notes}</p>}
                            {c.manager_remarks && <p><span className="text-slate-400">Manager:</span> {c.manager_remarks}</p>}
                            {c.hr_remarks && <p><span className="text-slate-400">HR:</span> {c.hr_remarks}</p>}
                            {c.status === 'PAID' && <p><span className="text-slate-400">Paid:</span> {formatLeaveDate(c.paid_at)}{c.paid_reference ? ` (${c.paid_reference})` : ''}</p>}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {pageCount > 1 && (
          <div className="flex items-center justify-end gap-2 px-6 py-4">
            <button type="button" disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="rounded-xl border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40">Prev</button>
            <span className="text-xs text-slate-500">Page {page} of {pageCount}</span>
            <button type="button" disabled={page === pageCount} onClick={() => setPage((p) => p + 1)} className="rounded-xl border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40">Next</button>
          </div>
        )}
      </div>

      {confirmDialog}
      {clearerAsk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) keepPhoto(clearerAsk.fileId); }}>
          <div role="alertdialog" aria-modal="true" aria-label="Photo too small to read"
            className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-2xl">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Photo too small to read</p>
              <button type="button" onClick={() => keepPhoto(clearerAsk.fileId)} aria-label="Close"
                className="flex items-center justify-center w-7 h-7 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <p className="mt-4 text-sm text-slate-700">
              {clearerAsk.total > 1
                ? `${clearerAsk.small === clearerAsk.total ? 'The receipts' : `${clearerAsk.small} of the ${clearerAsk.total} receipts`} in this photo are too small to read reliably, so amounts and dates may be wrong.`
                : 'The receipt in this photo is too small to read reliably, so amounts and dates may be wrong.'}
            </p>
            <p className="mt-2 text-sm text-slate-700">
              Please upload a clearer photo: take it close to the receipt{clearerAsk.total > 1 ? 's' : ''}, or use the original photo from your camera, not one sent through WhatsApp or Telegram.
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => keepPhoto(clearerAsk.fileId)}
                className="rounded-2xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">
                Keep this photo
              </button>
              {hasCamera && (
                <button type="button" onClick={() => pickClearer(clearerAsk.fileId, true)}
                  className="rounded-2xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">
                  Take a new photo
                </button>
              )}
              <button type="button" autoFocus onClick={() => pickClearer(clearerAsk.fileId, false)}
                className="rounded-2xl bg-[#1540A8] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#12378F]">
                Choose a clearer photo
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] pointer-events-none">
          <div className={`rounded-full px-4 py-2.5 text-sm font-medium shadow-lg border ${
            toast.type === 'error' ? 'bg-red-600 border-red-700 text-white' : 'bg-slate-900 border-slate-950 text-white'
          }`}>{toast.text}</div>
        </div>
      )}
    </div>
  );
}
