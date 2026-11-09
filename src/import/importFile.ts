import type { BankId } from '../types';
import { parseCsvStatement } from './csv';
import { parseStatementLines, detectBank, type ParseResult } from './parse';
import { parseScreenshotLines, mergeScreenshots } from './screenshot';

export function isImage(file: File): boolean {
  return file.type.startsWith('image/') || /\.(png|jpe?g|heic|heif|webp)$/i.test(file.name);
}

/** Bank-app screenshots: read each on the phone, merge overlapping ones. */
export async function parseScreenshots(files: File[], today: string): Promise<ParseResult> {
  const { imageToLines } = await import('./ocr');
  const results: ParseResult[] = [];
  const raw: string[] = [];
  for (const f of files) {
    const lines = await imageToLines(f);
    raw.push(lines.map((l) => l.text).join('\n'));
    results.push(parseScreenshotLines(lines, today));
  }
  return { ...mergeScreenshots(results), raw: raw.join('\n\n') };
}

export async function parseStatementFile(file: File, password?: string, bankHint?: BankId): Promise<ParseResult> {
  const name = file.name.toLowerCase();
  const buf = await file.arrayBuffer();
  const isPdf = name.endsWith('.pdf') || file.type === 'application/pdf' || new TextDecoder().decode(buf.slice(0, 5)) === '%PDF-';
  if (isPdf) {
    const { pdfToLines } = await import('./pdf');
    const lines = await pdfToLines(buf, password);
    return parseStatementLines(lines, bankHint);
  }
  const text = decodeText(buf);
  const res = parseCsvStatement(text);
  return { bank: detectBank(file.name + ' ' + text.slice(0, 3000)), ...res };
}

/** UTF-8 with fallback to Windows-1254 (Turkish), which many bank exports still use. */
export function decodeText(buf: ArrayBuffer): string {
  const utf = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  if (!utf.includes('�')) return utf;
  try { return new TextDecoder('windows-1254').decode(buf); } catch { return utf; }
}
