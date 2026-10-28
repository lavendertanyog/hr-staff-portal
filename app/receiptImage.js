// Turns a receipt file into a data URL before upload. A photo becomes a smaller JPEG: at most
// 1,568 px on the long edge (the size the scan reads well at), so uploads and stored receipts
// stay around 200-400 KB instead of a several-MB phone photo, and each scan costs less. A PDF is
// sent as it is, up to 3 MB.

const MAX_EDGE = 1568;
const QUALITY = 0.82;
const MAX_PDF_BYTES = 3 * 1024 * 1024;

export const RECEIPT_ACCEPT = 'image/*,application/pdf';
export const isPdfReceipt = (dataUrl) => String(dataUrl || '').startsWith('data:application/pdf');

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('This photo could not be opened. Please use a JPEG or PNG photo, or a PDF.'));
    img.src = src;
  });
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('This PDF could not be opened.'));
    reader.readAsDataURL(file);
  });
}

const isPdfFile = (file) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');

// ── Cropping receipts out of a file that holds several ──
// Read as one picture, each receipt gets only a small share of the scan's detail, so small print
// is misread. The scan gives each receipt's box (0-1000 scale, [ymin, xmin, ymax, xmax]) and PDF
// page; each is cut out of the full-resolution original and read again on its own.

const CROP_PAD = 15; // 1.5% of the picture around each box, so no edge of a receipt is cut off
const PDF_RENDER_EDGE = 3000; // px on the long edge when drawing a PDF page to crop from

function dataUrlBytes(dataUrl) {
  const s = String(dataUrl);
  return Uint8Array.from(atob(s.slice(s.indexOf(',') + 1)), (c) => c.charCodeAt(0));
}

// pdf.js is only loaded when a PDF needs cropping. Its worker runs on the page itself, which is
// fine for drawing one page and avoids serving a separate worker file.
async function renderPdfPages(source, pageNumbers) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  if (!globalThis.pdfjsWorker) globalThis.pdfjsWorker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs');
  const data = source instanceof Blob ? new Uint8Array(await source.arrayBuffer()) : dataUrlBytes(source);
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages = new Map();
  try {
    for (const n of pageNumbers) {
      if (n > doc.numPages) continue;
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(4, PDF_RENDER_EDGE / Math.max(base.width, base.height)) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      pages.set(n, canvas);
    }
  } finally {
    doc.destroy();
  }
  return pages;
}

function cropToDataUrl(picture, width, height, box) {
  const [ymin, xmin, ymax, xmax] = box;
  const x0 = Math.max(0, Math.floor(((xmin - CROP_PAD) / 1000) * width));
  const y0 = Math.max(0, Math.floor(((ymin - CROP_PAD) / 1000) * height));
  const x1 = Math.min(width, Math.ceil(((xmax + CROP_PAD) / 1000) * width));
  const y1 = Math.min(height, Math.ceil(((ymax + CROP_PAD) / 1000) * height));
  const scale = Math.min(1, MAX_EDGE / Math.max(x1 - x0, y1 - y0));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round((x1 - x0) * scale));
  canvas.height = Math.max(1, Math.round((y1 - y0) * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(picture, x0, y0, x1 - x0, y1 - y0, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', QUALITY);
}

// A receipt narrower than this in the original photo has print too small to read reliably, with
// any model or crop (tested: a 607 x 1080 photo of four receipts, each about 170 px wide, gave
// wrong digits and years). Receipts are all about the same paper width, so width is what counts.
const MIN_RECEIPT_WIDTH = 350;

// For each receipt (same order), whether it is too small in its photo to read reliably. A PDF
// isn't judged (its text may be sharp at any size), and neither is a receipt with no box.
export async function smallReceipts(source, receipts) {
  const isPdf = source instanceof Blob ? isPdfFile(source) : isPdfReceipt(source);
  if (isPdf || !receipts.some((r) => r.box)) return receipts.map(() => false);
  const objectUrl = source instanceof Blob ? URL.createObjectURL(source) : null;
  try {
    const img = await loadImage(objectUrl || source);
    return receipts.map((r) => {
      if (!r.box) return false;
      const [ymin, xmin, ymax, xmax] = r.box;
      const w = ((xmax - xmin) / 1000) * img.naturalWidth;
      const h = ((ymax - ymin) / 1000) * img.naturalHeight;
      return Math.min(w, h) < MIN_RECEIPT_WIDTH;
    });
  } catch {
    return receipts.map(() => false);
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

// One JPEG data URL per receipt (in the same order), or null where it can't be cropped. `source`
// is the original File when there is one (full resolution), otherwise the uploaded data URL.
export async function cropReceipts(source, receipts) {
  const isPdf = source instanceof Blob ? isPdfFile(source) : isPdfReceipt(source);
  const wanted = receipts.filter((r) => r.box);
  if (wanted.length === 0) return receipts.map(() => null);
  if (isPdf) {
    const pages = await renderPdfPages(source, [...new Set(wanted.map((r) => r.page || 1))]);
    return receipts.map((r) => {
      const canvas = r.box && pages.get(r.page || 1);
      return canvas ? cropToDataUrl(canvas, canvas.width, canvas.height, r.box) : null;
    });
  }
  const objectUrl = source instanceof Blob ? URL.createObjectURL(source) : null;
  try {
    const img = await loadImage(objectUrl || source);
    return receipts.map((r) => (r.box ? cropToDataUrl(img, img.naturalWidth, img.naturalHeight, r.box) : null));
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

export async function receiptFileToDataUrl(file) {
  if (file && isPdfFile(file)) {
    if (file.size > MAX_PDF_BYTES) throw new Error(`${file.name || 'This PDF'} is too large (3 MB at most).`);
    const dataUrl = await readAsDataUrl(file);
    // Some systems give a PDF no type; label it so the server accepts it.
    return dataUrl.replace(/^data:[^;,]*;base64,/, 'data:application/pdf;base64,');
  }
  if (!file || !String(file.type || '').startsWith('image/')) {
    throw new Error('Please choose a photo or a PDF of the receipt.');
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    // White background so a transparent PNG doesn't turn black as a JPEG.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', QUALITY);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
