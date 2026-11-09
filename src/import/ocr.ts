import type { Line } from './parse';

/**
 * Read text from a screenshot on the phone (Tesseract, Turkish + English). The engine and the
 * language files are served by the app itself (public/ocr), so nothing is sent anywhere.
 */
let workerP: Promise<any> | null = null;

async function worker() {
  if (!workerP) {
    workerP = (async () => {
      const T = await import('tesseract.js');
      const base = new URL('ocr/', document.baseURI).href;
      return T.createWorker(['tur', 'eng'], 1, { workerPath: base + 'worker.min.js', corePath: base, langPath: base.replace(/\/$/, ''), gzip: true });
    })();
    workerP.catch(() => { workerP = null; });
  }
  return workerP;
}

export async function imageToLines(file: Blob): Promise<Line[]> {
  const w = await worker();
  const { data } = await w.recognize(file);
  const out: Line[] = [];
  for (const l of (data.lines || []) as { text: string; bbox: { y0: number } }[]) {
    const text = l.text.replace(/\s+/g, ' ').trim();
    if (text) out.push({ text, y: -l.bbox.y0, page: 1 });
  }
  return out;
}
