import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { parseStatementText, parseStatementLines, detectBank, detectMode, type Line } from '../../src/import/parse';
import { parseCsvStatement, parseCSV, detectDelimiter } from '../../src/import/csv';

const fx = (n: string) => readFileSync(new URL('../fixtures/' + n, import.meta.url), 'utf8');

describe('Garanti account statement (hesap hareketleri)', () => {
  const r = parseStatementText(fx('garanti-account.txt'));
  it('detects bank and mode', () => { expect(r.bank).toBe('garanti'); expect(r.mode).toBe('account'); });
  it('finds every dated row (wrapped row joined)', () => expect(r.rows).toHaveLength(10));
  it('uses the amount, not the running balance', () => {
    expect(r.rows[0]).toMatchObject({ date: '2026-09-15', amount: 5.8, kind: 'expense', hint: 'fees' });
  });
  it('flags card payments so they are not double counted', () => {
    expect(r.rows[2]).toMatchObject({ amount: 3917.17, flag: 'cardpay' });
  });
  it('flags investments and transfers', () => {
    expect(r.rows[3]).toMatchObject({ kind: 'income', flag: 'transfer' });
    expect(r.rows[4].flag).toBe('investment');
    expect(r.rows[5]).toMatchObject({ amount: 2170.33, flag: 'investment' });
  });
  it('recognises salary as income', () => {
    expect(r.rows[6]).toMatchObject({ date: '2026-09-01', amount: 17419.42, kind: 'income', hint: 'salary', flag: null });
    expect(r.rows[9]).toMatchObject({ kind: 'income', hint: 'salary' });
  });
  it('joins a description wrapped over two lines', () => {
    expect(r.rows[8]).toMatchObject({ date: '2026-07-14', amount: 2000, kind: 'expense' });
    expect(r.rows[8].description).toMatch(/AİDAT/);
    expect(r.rows[8].description).not.toMatch(/Para Transferi$/);
  });
});

describe('İş Bankası account statement with wrapped description cells (PDF lines with y)', () => {
  // Emulates pdf.js rows: description cell lines sit above/below the dated row.
  const L = (text: string, y: number): Line => ({ text, y, page: 1 });
  const lines: Line[] = [
    L('HESAP ÖZETİ', 800), L('Sayın AD SOYAD', 780), L('Mevcut Bakiye : 548,30 TL  www.isbank.com.tr  İşCep', 770),
    L('Tarih/Saat  Kanal/Şube  İşlem Tutarı*  Bakiye  Ek Hesap Bakiyesi  İşlem  İşlem Tipi  Açıklama', 740),
    L('24/09/2026-09:29:14  İşCep  -8,37  548,30  0,00  FA  FAST  ÜCRET H2600000000001 4000,00 TRY ÜZ.', 720),
    L('24/09/2026-09:29:14  İşCep  -4.000,00  556,67  0,00  FA  FAST', 700),
    L('ÖRNEK APARTMANI YÖNETİCİLİĞİ*TR000000000000000000000000*6 NUMARA İKİ AYLIK AİDAT', 692),
    L('24/09/2026-09:26:53  İşCep  4.519,77  4.556,67  0,00  FM  Döviz  1000-0000001.FX.İŞCEP ALTIN SATIŞ/ 1000,0000000', 670),
    L('0000/00000000-MUHASEBE HESABINA İSCEP KRE.KART BORÇ', 658),
    L('14/09/2026-09:50:15  Diğer  -6.794,47  2.045,27  0,00  AN  Para Çekme  ÖDEME', 650),
    L('05/09/2026-11:20:51  Bankamatik  -3.000,00  490,81  0,00  AK  Para Çekme  12345 NUMARALI BANKAMATİK TEN PARA ÇEKME', 620),
    L('10000000000001 /ORNEKSIGORTA/FATURA', 608),
    L('04/09/2026-19:15:08  Sistem  -794,31  490,81  0,00  PH  Fatura  NO:0100000000000001/K:00001', 600),
    L('04/09/2026-09:18:19  İşCep  25.000,00  26.680,84  0,00  0S  Havale  dügün*AD SOYAD*H2600000000002', 580),
    L('(*) Çekilen tutar \'-\' ile gösterilmiştir.', 500),
  ];
  const r = parseStatementLines(lines);
  it('detects İş Bankası account', () => { expect(r.bank).toBe('isbank'); expect(r.mode).toBe('account'); });
  it('reads 7 rows', () => expect(r.rows).toHaveLength(7));
  it('takes the first amount (not balance) in amounts-first layout', () => {
    expect(r.rows[0]).toMatchObject({ date: '2026-09-24', amount: 8.37, kind: 'expense', hint: 'fees' });
    expect(r.rows[1]).toMatchObject({ amount: 4000, kind: 'expense' });
  });
  it('attaches wrapped description text to the right row', () => {
    expect(r.rows[1].description).toMatch(/AİDAT/);
    expect(r.rows[1].description).not.toMatch(/TR00/);
  });
  it('flags gold sale, card payment and cash withdrawal', () => {
    expect(r.rows[2]).toMatchObject({ kind: 'income', flag: 'investment' });
    expect(r.rows[3]).toMatchObject({ amount: 6794.47, flag: 'cardpay' });
    expect(r.rows[4]).toMatchObject({ flag: 'cash' });
  });
  it('keeps bills and incoming transfers', () => {
    expect(r.rows[5]).toMatchObject({ amount: 794.31, kind: 'expense', flag: null });
    expect(r.rows[5].description).toMatch(/SIGORTA|SİGORTA/i);
    expect(r.rows[6]).toMatchObject({ amount: 25000, kind: 'income', flag: 'transfer' });
  });
});

describe('credit card statement', () => {
  const r = parseStatementText(fx('card-statement.txt'));
  it('detects Yapı Kredi card statement', () => { expect(r.bank).toBe('yapikredi'); expect(r.mode).toBe('card'); });
  it('skips summary lines and reads purchases', () => expect(r.rows.map((x) => x.amount)).toEqual([1245.3, 389.9, 1500, 833.33, 3000, 319.68, 250, 224.19]));
  it('picks amount not points', () => expect(r.rows[0]).toMatchObject({ description: 'MIGROS SANAL MARKET ISTANBUL', kind: 'expense', flag: null }));
  it('reads installments', () => expect(r.rows[3].installment).toBe('2/6'));
  it('marks payments and refunds', () => {
    expect(r.rows[4]).toMatchObject({ kind: 'income', flag: 'refund' });
    expect(r.rows[6]).toMatchObject({ kind: 'income', flag: 'refund' });
  });
  it('uses TRY amount for foreign purchases', () => expect(r.rows[5].amount).toBe(319.68));
});

describe('bank detection', () => {
  it('detects banks', () => {
    expect(detectBank('Türkiye İş Bankası A.Ş. Maximum Kart')).toBe('isbank');
    expect(detectBank('QNB Finansbank CardFinans')).toBe('qnb');
    expect(detectBank('Garanti BBVA Bonus')).toBe('garanti');
    expect(detectBank('YAPI KREDİ World')).toBe('yapikredi');
    expect(detectBank('Some other bank')).toBe('other');
  });
  it('detects mode', () => {
    expect(detectMode('Hesap Kesim Tarihi 20.10.2026')).toBe('card');
    expect(detectMode('Tarih Açıklama Tutar Bakiye')).toBe('account');
  });
});

describe('CSV', () => {
  it('detects delimiter', () => { expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';'); expect(detectDelimiter('a,b\n1,2')).toBe(','); });
  it('handles quotes', () => expect(parseCSV('a,"b, c","d ""q"""\n')).toEqual([['a', 'b, c', 'd "q"']]));
  it('parses a Turkish card CSV with header', () => {
    const r = parseCsvStatement('Tarih;Açıklama;Tutar\n01.10.2026;MIGROS;1.234,56\n02.10.2026;ÖDEME TEŞEKKÜR;-2.000,00\n03.10.2026;NETFLIX;229,99\n');
    expect(r.mode).toBe('card');
    expect(r.rows).toHaveLength(3);
    expect(r.rows[0]).toMatchObject({ date: '2026-10-01', amount: 1234.56, kind: 'expense' });
    expect(r.rows[1]).toMatchObject({ kind: 'income', flag: 'refund' });
  });
  it('parses an account CSV with Borç/Alacak columns', () => {
    const r = parseCsvStatement('İşlem Tarihi,Açıklama,Borç,Alacak,Bakiye\n"05/10/2026","ENERJISA FATURA","450,00","","1.000,00"\n"06/10/2026","MAAŞ ÖDEMESİ","","30.000,00","31.000,00"\n');
    expect(r.mode).toBe('account');
    expect(r.rows[0]).toMatchObject({ amount: 450, kind: 'expense' });
    expect(r.rows[1]).toMatchObject({ amount: 30000, kind: 'income', hint: 'salary' });
  });
  it('infers columns without header and flips negative-heavy exports', () => {
    const r = parseCsvStatement('2026-10-01,SHELL,-1500.00\n2026-10-02,MIGROS,-320.50\n2026-10-03,SALARY,25000.00\n');
    expect(r.rows[0]).toMatchObject({ amount: 1500, kind: 'expense' });
    expect(r.rows[2]).toMatchObject({ amount: 25000, kind: 'income' });
  });
  it('returns nothing for garbage', () => expect(parseCsvStatement('hello\nworld').rows).toHaveLength(0));
});

describe('installment purchases (taksitli işlemler)', () => {
  const head = 'GARANTİ BBVA BONUS KART HESAP ÖZETİ\nHesap Kesim Tarihi: 20.10.2026  Son Ödeme Tarihi: 30.10.2026\n';
  const r = (line: string) => parseStatementText(head + line).rows[0];
  it('takes the monthly installment, not the full purchase amount', () => {
    expect(r('12.08.2026 MEDIAMARKT ISTANBUL 3/6 12.000,00 2.000,00')).toMatchObject({ amount: 2000, installment: '3/6' });
    expect(r('12.08.2026 MEDIAMARKT ISTANBUL 12.000,00 TL 3/6 TAKSIT 2.000,00 TL')).toMatchObject({ amount: 2000, installment: '3/6' });
    expect(r('12.08.2026 APPLE STORE Taksit 2/12 54.999,00 4.583,25 45,83')).toMatchObject({ amount: 4583.25, installment: '2/12' });
    expect(r('12.08.2026 TEKNOSA 6 Taksitin 4.sü 9.000,00 1.500,00')).toMatchObject({ amount: 1500, installment: '4/6' });
  });
  it('handles rounding of the last installment', () => {
    expect(r('12.08.2026 IKEA 3/3 1.000,00 333,34')).toMatchObject({ amount: 333.34 });
  });
  it('keeps a single amount as is', () => {
    expect(r('12.08.2026 TRENDYOL.COM 2/6 TAKSIT 833,33')).toMatchObject({ amount: 833.33, installment: '2/6' });
  });
  it('does not treat bonus points as the installment', () => {
    expect(r('12.08.2026 MIGROS 1.245,30 12,45')).toMatchObject({ amount: 1245.3, installment: null });
  });
});

