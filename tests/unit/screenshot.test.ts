import { describe, it, expect } from 'vitest';
import { parseScreenshotLines, mergeScreenshots, findDate } from '../../src/import/screenshot';

const L = (texts: string[]) => texts.map((text, i) => ({ text, y: 1000 - i * 50 }));
const TODAY = '2026-11-09';

describe('bank app screenshot (OCR lines)', () => {
  // what Tesseract read from a generated list (no real data)
  const lines = L(['Kart Hareketleri', 'Dönem İçi Harcamalar', '8 Kasım 2026', 'MIGROS MAZHARBEY -1.245,90 TL', 'SHELL ACIBADEM -2.000,00 TL',
    '6 Kasım 2026', 'BAUHAUS ATAŞEHİR -12.000,00 TL', '6 Taksit', 'IYZICO/TRENDYOL *349,99 TL', 'İade', '3 Kasım 2026', 'STARBUCKS ZORLU -185,00 TL',
    'Kullanılabilir Limit 45.000,00 TL']);
  const r = parseScreenshotLines(lines, TODAY);
  it('reads rows under their date headers, skips the limit line', () => {
    expect(r.rows.map((x) => [x.date, x.description, x.amount, x.kind])).toEqual([
      ['2026-11-08', 'MIGROS MAZHARBEY', 1245.9, 'expense'],
      ['2026-11-08', 'SHELL ACIBADEM', 2000, 'expense'],
      ['2026-11-06', 'BAUHAUS ATAŞEHİR', 2000, 'expense'],
      ['2026-11-06', 'IYZICO/TRENDYOL', 349.99, 'income'],
      ['2026-11-03', 'STARBUCKS ZORLU', 185, 'expense'],
    ]);
  });
  it('"6 Taksit" turns a new purchase into installment 1/6 of its total', () => {
    expect(r.rows[2].installment).toBe('1/6');
  });
  it('refund is flagged so it starts unticked', () => {
    expect(r.rows[3].flag).toBe('refund');
  });

  it('merchant above the amount, date on the row, no year, Bugün/Dün', () => {
    const r2 = parseScreenshotLines(L(['Bugün', 'Netflix', '289,99 TL', 'Dün', 'A101 KADIKOY 87,50 TL', '28 Eki', 'Migros 410,00', '31.10 Shell 1.500,00']), TODAY);
    expect(r2.rows.map((x) => [x.date, x.description, x.amount])).toEqual([
      ['2026-11-09', 'Netflix', 289.99], ['2026-11-08', 'A101 KADIKOY', 87.5], ['2026-10-28', 'Migros', 410], ['2026-10-31', 'Shell', 1500]]);
  });
  it('a December date seen in January belongs to last year', () => {
    expect(findDate('28 Aralık', '2027-01-05')!.iso).toBe('2026-12-28');
  });
  it('card payment shown in the app is flagged, not counted as income', () => {
    const r3 = parseScreenshotLines(L(['5 Kasım 2026', 'Ödemeniz Alındı +13.277,88 TL']), TODAY);
    expect(r3.rows[0]).toMatchObject({ kind: 'income', flag: 'cardpay' });
  });
  it('overlapping screenshots: rows on both are kept once, two equal coffees on one screenshot stay two', () => {
    const a = parseScreenshotLines(L(['8 Kasım 2026', 'KAHVE 80,00 TL', 'KAHVE 80,00 TL', 'MIGROS 100,00 TL']), TODAY);
    const b = parseScreenshotLines(L(['8 Kasım 2026', 'MIGROS 100,00 TL', '7 Kasım 2026', 'SHELL 500,00 TL']), TODAY);
    expect(mergeScreenshots([a, b]).rows.map((x) => x.description)).toEqual(['KAHVE', 'KAHVE', 'MIGROS', 'SHELL']);
  });
});
