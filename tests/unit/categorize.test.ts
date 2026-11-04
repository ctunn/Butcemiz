import { describe, it, expect } from 'vitest';
import { suggestCategory } from '../../src/lib/categorize';

describe('suggestCategory', () => {
  const cases: [string, string | null][] = [
    ['MIGROS TICARET A.S. ISTANBUL', 'groceries'], ['A101 YENI MAGAZACILIK', 'groceries'], ['BIM BIRLESIK MAGAZALAR', 'groceries'],
    ['ŞOK MARKET', 'groceries'], ['YEMEKSEPETI', 'dining'], ['GETIR YEMEK', 'dining'], ['STARBUCKS BAGDAT CAD', 'dining'],
    ['SHELL PETROL', 'transport'], ['OPET', 'transport'], ['NETFLIX.COM', 'subscriptions'], ['SPOTIFY P1', 'subscriptions'],
    ['TURKCELL FATURA', 'bills'], ['ENERJISA', 'bills'], ['AZİZBEY APARTMANI YÖNETİCİLİĞİ 6 NUMARA AİDAT', 'bills'],
    ['TRENDYOL.COM', 'shopping'], ['HEPSIBURADA', 'shopping'], ['ECZANE DENIZ', 'health'], ['PEGASUS HAVA', 'travel'],
    ['TRENDYOL.COM 2/6 TAKSIT', 'shopping'], ['MIGROS 3. TAKSIT', 'groceries'], ['BITAKSI', 'transport'], ['ISTANBUL TAKSI DURAGI', 'transport'],
    ['RANDOM XYZ LTD', null],
  ];
  for (const [d, c] of cases) it(`"${d}" → ${c}`, () => expect(suggestCategory(d)).toBe(c));
  it('prefers a learned rule', () => {
    expect(suggestCategory('RANDOM XYZ LTD', [{ id: '1', key: 'random xyz', category_id: 'gifts' }])).toBe('gifts');
  });
});
