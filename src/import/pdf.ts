import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PdfPasswordError } from './errors';
import type { Line } from './parse';
export { PdfPasswordError };

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** Extract text rows from a PDF, rebuilt from item positions so table rows stay on one line. */
export async function pdfToLines(data: ArrayBuffer, password?: string): Promise<Line[]> {
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(data), password, isEvalSupported: false }).promise;
  } catch (e: any) {
    if (e?.name === 'PasswordException') throw new PdfPasswordError(e.code === 2);
    throw e;
  }
  const out: Line[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    out.push(...itemsToLines(content.items as any[], p));
  }
  return out;
}

export function itemsToLines(items: { str: string; transform: number[]; width?: number }[], page = 1): Line[] {
  const rows: { y: number; parts: { x: number; s: string; w: number }[] }[] = [];
  for (const it of items) {
    if (typeof it.str !== 'string' || it.str.trim() === '') continue;
    const x = it.transform[4], y = it.transform[5];
    let row = rows.find((r) => Math.abs(r.y - y) < 2.5);
    if (!row) { row = { y, parts: [] }; rows.push(row); }
    row.parts.push({ x, s: it.str, w: it.width || 0 });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((r) => {
    r.parts.sort((a, b) => a.x - b.x);
    let line = '';
    let lastEnd = -Infinity;
    for (const part of r.parts) {
      const gap = part.x - lastEnd;
      line += (line && gap > 1 ? '  ' : line && !line.endsWith(' ') && gap > 0.3 ? ' ' : '') + part.s;
      lastEnd = part.x + part.w;
    }
    return { text: line.trim(), y: r.y, page };
  });
}
