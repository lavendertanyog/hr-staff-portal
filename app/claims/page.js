"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { authHeaders } from '../authSession';
import { useConfirm } from '../ConfirmDialog';
import { formatLeaveDate, openMcFile } from '../leaveFormat';
import { receiptFileToDataUrl } from '../receiptImage';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://hr-backend-qjww.onrender.com';
const PAGE_SIZE = 6;

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
const emptyItem = () => ({ description: '', quantity: '', amount: '' });
const emptyForm = () => ({
  purchaseDate: '', merchant: '', category: '', currency: 'SGD', totalAmount: '',
  projectCode: '', notes: '', items: [emptyItem()],
});

const inputCls = (bad) => `w-full rounded-xl border ${bad ? 'border-red-400' : 'border-slate-300'} px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`;

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

  // Form
  const [form, setForm] = useState(emptyForm);
  const [invalid, setInvalid] = useState({});
  const [receipt, setReceipt] = useState(null); // data URL of the (resized) photo
  const [receiptChanged, setReceiptChanged] = useState(false);
  const [scanId, setScanId] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState(null); // { type: 'info' | 'warn', text }
  const [editingId, setEditingId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef(null);
  const formRef = useRef(null);

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
  const setField = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (invalid[key]) setInvalid((v) => ({ ...v, [key]: false }));
  };
  const setItem = (i, key, value) => setForm((f) => ({ ...f, items: f.items.map((it, j) => (j === i ? { ...it, [key]: value } : it)) }));
  const addItem = () => setForm((f) => ({ ...f, items: [...f.items, emptyItem()] }));
  const removeItem = (i) => setForm((f) => ({ ...f, items: f.items.length > 1 ? f.items.filter((_, j) => j !== i) : [emptyItem()] }));

  const resetForm = () => {
    setForm(emptyForm());
    setInvalid({});
    setReceipt(null);
    setReceiptChanged(false);
    setScanId(null);
    setScanNote(null);
    setEditingId(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const scanReceipt = async (dataUrl) => {
    setScanning(true);
    setScanNote(null);
    try {
      const res = await axios.post(`${API_BASE}/api/v1/claims/scan`, { receiptImage: dataUrl }, { headers: authHeaders() });
      const body = res.data || {};
      if (!body.available) {
        setScanNote({ type: 'warn', text: body.message || 'Receipt scanning is unavailable. Please fill in the details yourself.' });
        return;
      }
      const d = body.data || {};
      setScanId(body.scanId || null);
      setForm((f) => ({
        ...f,
        purchaseDate: d.purchaseDate || f.purchaseDate,
        merchant: d.merchant || f.merchant,
        category: d.category || f.category,
        currency: d.currency || f.currency,
        totalAmount: d.totalAmount != null ? String(d.totalAmount) : f.totalAmount,
        items: d.items?.length
          ? d.items.map((it) => ({ description: it.description, quantity: it.quantity ?? '', amount: it.amount ?? '' }))
          : f.items,
      }));
      setInvalid({});
      setScanNote(body.message
        ? { type: 'warn', text: body.message }
        : { type: 'info', text: 'Filled in from the receipt. Check every field before you submit.' });
    } catch (err) {
      setScanNote({ type: 'warn', text: err.response?.data?.error || "We couldn't read the receipt. Please fill in the details yourself." });
    } finally {
      setScanning(false);
    }
  };

  const handlePhoto = async (file) => {
    if (!file) return;
    try {
      const dataUrl = await receiptFileToDataUrl(file);
      setReceipt(dataUrl);
      setReceiptChanged(true);
      if (invalid.receipt) setInvalid((v) => ({ ...v, receipt: false }));
      // A new claim is scanned straight away; on an edit, the fields already filled in are kept.
      if (!editingId) await scanReceipt(dataUrl);
    } catch (err) {
      showToast(err.message || 'This photo could not be used.', 'error');
    }
  };

  const itemsTotal = useMemo(() => form.items.reduce((s, it) => s + (Number(it.amount) || 0), 0), [form.items]);
  const totalNumber = Number(form.totalAmount);
  const itemsMismatch = form.items.some((it) => it.amount !== '') && Number.isFinite(totalNumber) && totalNumber > 0
    && Math.abs(itemsTotal - totalNumber) >= 0.01;

  const submit = async (confirmDuplicate = false) => {
    const bad = {
      receipt: !receipt,
      purchaseDate: !form.purchaseDate,
      merchant: !form.merchant.trim(),
      category: !form.category,
      totalAmount: !(Number(form.totalAmount) > 0),
    };
    if (Object.values(bad).some(Boolean)) {
      setInvalid(bad);
      showToast('Please fill in the highlighted field(s).', 'error');
      return;
    }
    const payload = {
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
    };
    setSubmitting(true);
    try {
      if (editingId) {
        await axios.patch(`${API_BASE}/api/v1/claims/${editingId}`, { ...payload, receiptImage: receiptChanged ? receipt : undefined }, { headers: authHeaders() });
        showToast('Claim updated.', 'success');
      } else {
        await axios.post(`${API_BASE}/api/v1/claims`, { ...payload, receiptImage: receipt, scanId: scanId || undefined, confirmDuplicate }, { headers: authHeaders() });
        showToast('Claim submitted.', 'success');
      }
      resetForm();
      loadClaims();
    } catch (err) {
      if (err.response?.status === 409 && err.response?.data?.duplicate) {
        setSubmitting(false);
        const again = await confirm({
          title: 'Possible duplicate',
          message: err.response.data.error,
          confirmLabel: 'Submit anyway',
        });
        if (again) await submit(true);
        return;
      }
      showToast(err.response?.data?.error || 'Failed to save the claim.', 'error');
    } finally {
      setSubmitting(false);
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

  const startEdit = async (c) => {
    try {
      const res = await axios.get(`${API_BASE}/api/v1/claims/${c.claim_id}/receipt`, { headers: authHeaders() });
      setReceipt(res.data?.data?.receiptImage || null);
    } catch {
      setReceipt(null);
    }
    setEditingId(c.claim_id);
    setReceiptChanged(false);
    setScanId(null);
    setScanNote(null);
    setInvalid({});
    setForm({
      purchaseDate: c.purchase_date,
      merchant: c.merchant,
      category: c.category,
      currency: c.currency,
      totalAmount: String(Number(c.total_amount)),
      projectCode: c.project_code || '',
      notes: c.notes || '',
      items: c.items?.length
        ? c.items.map((it) => ({ description: it.description, quantity: it.quantity ?? '', amount: it.amount ?? '' }))
        : [emptyItem()],
    });
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
      if (editingId === c.claim_id) resetForm();
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

  return (
    <div className="p-8">
      <div className="mb-8 pl-3">
        <p className="text-sm uppercase tracking-[0.32em] text-slate-500">Staff Dashboard</p>
        <h1 className="mt-3 text-4xl font-semibold text-slate-950">Claims</h1>
        <p className="mt-2 text-sm text-slate-500">Photograph a receipt to claim an expense. Your manager, then HR, approve it, and it is paid with your salary.</p>
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

      {/* New / edit claim */}
      <div ref={formRef} className="mb-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">{editingId ? 'Edit claim' : 'New claim'}</p>
          {editingId && (
            <button type="button" onClick={resetForm} className="rounded-xl border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100">Cancel edit</button>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          {/* Receipt photo */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Receipt photo</label>
            <div className={`flex min-h-[220px] items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed ${invalid.receipt ? 'border-red-400' : 'border-slate-300'} bg-slate-50`}>
              {receipt
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={receipt} alt="Receipt" className="max-h-[360px] w-full object-contain" />
                : <p className="px-6 text-center text-sm text-slate-400">Take or choose a photo of the whole receipt.</p>}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={(e) => handlePhoto(e.target.files?.[0] || null)} />
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={scanning}
              className="mt-3 w-full rounded-2xl bg-[#1540A8] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#12378F] disabled:opacity-60">
              {scanning ? 'Reading receipt…' : receipt ? 'Change photo' : 'Add receipt photo'}
            </button>
            {receipt && editingId && receiptChanged && (
              <button type="button" onClick={() => scanReceipt(receipt)} disabled={scanning}
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40">
                Fill in from this photo
              </button>
            )}
            {scanNote && (
              <p className={`mt-3 rounded-xl px-3 py-2 text-xs font-medium ${scanNote.type === 'warn' ? 'bg-amber-50 text-amber-700' : 'bg-[#EAF0FF] text-[#1a3a8f]'}`}>{scanNote.text}</p>
            )}
          </div>

          {/* Fields */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Date of purchase</label>
              <input type="date" max={sgtToday()} value={form.purchaseDate} onChange={(e) => setField('purchaseDate', e.target.value)} className={inputCls(invalid.purchaseDate)} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Shop, restaurant or company</label>
              <input value={form.merchant} onChange={(e) => setField('merchant', e.target.value)} maxLength={200} className={inputCls(invalid.merchant)} placeholder="e.g. Kopitiam" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Category</label>
              <select value={form.category} onChange={(e) => setField('category', e.target.value)} className={inputCls(invalid.category)}>
                <option value="">Choose a category</option>
                {categories.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-[96px_1fr] gap-3">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Currency</label>
                <input value={form.currency} onChange={(e) => setField('currency', e.target.value.toUpperCase().slice(0, 3))} className={inputCls(false)} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Amount paid</label>
                <input type="number" min="0.01" step="0.01" inputMode="decimal" value={form.totalAmount} onChange={(e) => setField('totalAmount', e.target.value)} className={inputCls(invalid.totalAmount)} placeholder="0.00" />
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-2">Project (optional)</label>
              <select value={form.projectCode} onChange={(e) => setField('projectCode', e.target.value)} className={inputCls(false)}>
                <option value="">Not for a project</option>
                {projects.map((p) => <option key={p.project_code} value={p.project_code}>{p.project_code} · {p.project_name}</option>)}
              </select>
            </div>

            {/* Items */}
            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-2">Items purchased</label>
              <div className="space-y-2">
                {form.items.map((it, i) => (
                  <div key={i} className="grid grid-cols-[1fr_72px_110px_auto] gap-2">
                    <input value={it.description} onChange={(e) => setItem(i, 'description', e.target.value)} maxLength={200} placeholder="Item" className="rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <input type="number" min="0" step="1" value={it.quantity} onChange={(e) => setItem(i, 'quantity', e.target.value)} placeholder="Qty" className="rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <input type="number" step="0.01" value={it.amount} onChange={(e) => setItem(i, 'amount', e.target.value)} placeholder="Amount" className="rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <button type="button" onClick={() => removeItem(i)} aria-label="Remove item"
                      className="flex h-9 w-9 items-center justify-center self-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <button type="button" onClick={addItem} className="rounded-xl border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100">+ Add item</button>
                {itemsMismatch && (
                  <p className="text-xs text-amber-700">Items add up to {money(form.currency || 'SGD', itemsTotal)}; the amount paid is {money(form.currency || 'SGD', totalNumber)}. That's fine if tax, service charge or a discount explains the difference.</p>
                )}
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-2">Notes (optional)</label>
              <textarea rows={2} value={form.notes} onChange={(e) => setField('notes', e.target.value)} maxLength={1000}
                className="w-full resize-none rounded-xl border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="What was it for? e.g. client lunch with ABC Pte Ltd" />
            </div>

            <div className="sm:col-span-2 flex justify-end">
              <button type="button" onClick={() => submit(false)} disabled={submitting || scanning}
                className="rounded-2xl bg-[#1540A8] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#12378F] disabled:opacity-60">
                {submitting ? 'Saving…' : editingId ? 'Save changes' : 'Submit claim'}
              </button>
            </div>
          </div>
        </div>
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
                    <td className="px-4 py-3 text-right whitespace-nowrap font-medium text-slate-900">{money(c.currency, c.total_amount)}</td>
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
                          </div>
                          <div className="space-y-1">
                            <p><span className="text-slate-400">Submitted:</span> {formatLeaveDate(c.created_at)}</p>
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
