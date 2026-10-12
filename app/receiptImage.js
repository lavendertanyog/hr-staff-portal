// Turns a receipt photo into a smaller JPEG data URL before upload: at most 1,568 px on the long
// edge (the size the scan reads well at), so uploads and stored receipts stay around 200-400 KB
// instead of a several-MB phone photo, and each scan costs less.

const MAX_EDGE = 1568;
const QUALITY = 0.82;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('This photo could not be opened. Please use a JPEG or PNG photo.'));
    img.src = src;
  });
}

export async function receiptFileToDataUrl(file) {
  if (!file || !String(file.type || '').startsWith('image/')) {
    throw new Error('Please choose a photo of the receipt.');
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
