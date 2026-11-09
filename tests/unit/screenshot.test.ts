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

describe('Garanti app layout (day / month / year+merchant stacked)', () => {
  const L = (t: string) => ({ text: t, y: 0 });
  const lines = [
    'BONUS PLATINUM TRINK', 'Ekstre Gelecek Dönem', 'Gerçekleşen Hareketler', '0,09 Bonus',
    '28 Market -455,00 TL', 'Eki >', '2026 ORNEK FIRIN',
    '28 Akaryakıt -50,00 TL', 'Eki', '2028 ORNEK PETROL A.S./ 6400 >', '0,02 Bonus',
    '28 Elektronik -69.63742 TL', 'Eki >', '2026 APPLE.COM/US',
    '26 Giyim / Aksesuar -383,00 TL', 'Eki >', '2026 ORNEK MAGAZA (4/6)',
    '25 Yeme/ İçme -484,28 TL', 'Eki . >', '2026 ORNEK BUFE',
  ].map(L);
  const r = parseScreenshotLines(lines as any, '2026-11-09');
  it('reads every row with date, amount and merchant', () => {
    expect(r.rows.map((x) => [x.date, x.amount, x.kind])).toEqual([
      ['2026-10-28', 455, 'expense'], ['2026-10-28', 50, 'expense'], ['2026-10-28', 69637.42, 'expense'],
      ['2026-10-26', 383, 'expense'], ['2026-10-25', 484.28, 'expense'],
    ]);
    expect(r.rows[0].description).toMatch(/ORNEK FIRIN/);
    expect(r.rows[1].description).toMatch(/ORNEK PETROL/);
  });
  it('maps bank categories and installments', () => {
    expect(r.rows.map((x) => x.bankCat)).toEqual(['groceries', 'transport', 'shopping', 'shopping', 'dining']);
    expect(r.rows[3].installment).toBe('4/6');
    expect(r.rows[3].description).not.toMatch(/4\/6/);
  });
});

describe('bank of a Garanti app screenshot', () => {
  it('is found from the card name and Bonus lines', async () => {
    const { detectBank } = await import('../../src/import/parse');
    expect(detectBank('BONUS PLATINUM TRINK\n0,09 Bonus')).toBe('garanti');
  });
});
