/**
 * Web-side image processing using Canvas API.
 * Replaces Rust image commands for the Web build.
 */

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src.slice(0, 80)}`));
    img.src = src;
  });
}

function canvasToDataUrl(canvas: HTMLCanvasElement, type = 'image/png'): string {
  return canvas.toDataURL(type);
}

function detectAspectRatio(w: number, h: number): string {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const g = gcd(Math.round(w), Math.round(h));
  return `${Math.round(w / g)}:${Math.round(h / g)}`;
}

// ── Split image into grid cells ──────────────────────────────────────────────

export async function webSplitImage(
  imageSource: string,
  rows: number,
  cols: number,
  _lineThickness = 0,
): Promise<string[]> {
  const img = await loadImg(imageSource);
  const cellW = Math.floor(img.width / cols);
  const cellH = Math.floor(img.height / rows);
  const results: string[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const canvas = document.createElement('canvas');
      canvas.width = cellW;
      canvas.height = cellH;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, c * cellW, r * cellH, cellW, cellH, 0, 0, cellW, cellH);
      results.push(canvasToDataUrl(canvas));
    }
  }
  return results;
}

// ── Prepare node image (resize for preview) ──────────────────────────────────

export interface WebPrepareResult {
  imagePath: string;
  previewImagePath: string;
  aspectRatio: string;
}

export async function webPrepareNodeImageSource(
  source: string,
  maxPreviewDimension = 512,
): Promise<WebPrepareResult> {
  const img = await loadImg(source);
  const aspectRatio = detectAspectRatio(img.width, img.height);

  // Create preview
  let pw = img.width;
  let ph = img.height;
  if (pw > maxPreviewDimension || ph > maxPreviewDimension) {
    const scale = maxPreviewDimension / Math.max(pw, ph);
    pw = Math.round(pw * scale);
    ph = Math.round(ph * scale);
  }
  const canvas = document.createElement('canvas');
  canvas.width = pw;
  canvas.height = ph;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, pw, ph);
  const previewDataUrl = canvasToDataUrl(canvas);

  return {
    imagePath: source,
    previewImagePath: previewDataUrl,
    aspectRatio,
  };
}

export async function webPrepareNodeImageBinary(
  bytes: Uint8Array,
  extension?: string,
  maxPreviewDimension = 512,
): Promise<WebPrepareResult> {
  const mime = extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg'
    : extension === 'webp' ? 'image/webp'
    : 'image/png';
  const blob = new Blob([bytes], { type: mime });
  const dataUrl = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
  return webPrepareNodeImageSource(dataUrl, maxPreviewDimension);
}

// ── Crop image ───────────────────────────────────────────────────────────────

export async function webCropImageSource(payload: {
  source: string;
  cropX?: number;
  cropY?: number;
  cropWidth?: number;
  cropHeight?: number;
}): Promise<string> {
  const img = await loadImg(payload.source);
  const sx = payload.cropX ?? 0;
  const sy = payload.cropY ?? 0;
  const sw = payload.cropWidth ?? img.width;
  const sh = payload.cropHeight ?? img.height;
  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvasToDataUrl(canvas);
}

// ── Persist / load — in web mode images stay as data URLs or blob URLs ───────

export async function webPersistImageSource(source: string): Promise<string> {
  // In web mode, images are already data URLs or blob URLs — just return as-is.
  return source;
}

export async function webLoadImage(source: string): Promise<string> {
  // If already a data URL, return directly
  if (source.startsWith('data:')) return source;
  // Try to fetch and convert
  const res = await fetch(source);
  const blob = await res.blob();
  return new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

// ── Save / download ──────────────────────────────────────────────────────────

export function webDownloadImage(source: string, fileName = 'image.png'): string {
  const a = document.createElement('a');
  a.href = source;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  return fileName;
}

// ── Clipboard ────────────────────────────────────────────────────────────────

export async function webCopyImageToClipboard(source: string): Promise<void> {
  const img = await loadImg(source);
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
  });
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}
