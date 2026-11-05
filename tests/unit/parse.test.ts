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

describe('Garanti Bonus card statement layout', () => {
  // Column order: İşlem Tarihi | Dönem İçi İşlemler | Kalan Borç / Taksit | Bonus (TL) | Tutar (TL). Made-up data.
  const text = [
    'Bonus Platinum   www.garantibbva.com.tr',
    'Hesap Kesim Tarihi   25 Ekim 2026',
    'Son Ödeme Tarihi   04 Kasım 2026',
    'İşlem Tarihi   Dönem İçi İşlemler   Kalan Borç / Taksit   Bonus (TL)   Tutar (TL)',
    'ÖNCEKİ DÖNEMDEN DEVİR EDİLEN TUTAR   10.000,00',
    'DÖNEM FAİZİ   404,05',
    'GEÇ ÖDEME FAİZİ   16,47',
    'KKDF + BSMV   126,16',
    '02 Ekim 2026   YAPAY ZEKA KAMPANYASI   150,00',
    '07 Ekim 2026   ÖDEMENİZ İÇİN TEŞEKKÜR EDERİZ   10.000,00+',
    '03 Ekim 2026   BONUS BEDAVA ALIŞVERİŞ   152,09-',
    '04 Ekim 2026   MİGROS-ORNEK M MIGROS   0,12   159,94',
    '03 Ekim 2026   IYZICO   *AMAZON.COM.T   156,34x3=469,00 1.Taksit   0,35   156,34',
    '17 Ekim 2026   BAUHAUS İNŞAAT MALZEMELER   2.190,30x6=13.141,80 1.Taksit   26,28   2.190,30',
    '07 Ekim 2026   BEYMEN PERAKENDE VE TEKST   1.529,10x6=9.174,60 4.Taksit   1.529,10',
    '30 Eylül 2026   34287-NAKİL VASITALARI VE   725,66x3=2.177,00 3.Taksit   725,66',
    '29 Eylül 2026   ANTHROPIC* CLAUDE SUB   24,00 USD   1.211,31',
    '23 Ekim 2026   ÖRNEK KANTİN   1.470,60',
  ].join('\n');
  const r = parseStatementText(text);
  const by = (d: string) => r.rows.find((x) => x.description.includes(d))!;
  it('detects Garanti card statement', () => { expect(r.bank).toBe('garanti'); expect(r.mode).toBe('card'); });
  it('reads cut-off and due dates', () => { expect(r.cutDate).toBe('2026-10-25'); expect(r.dueDate).toBe('2026-11-04'); });
  it('uses the monthly installment, not the total', () => {
    expect(by('BAUHAUS')).toMatchObject({ amount: 2190.3, installment: '1/6', kind: 'expense' });
    expect(by('BEYMEN')).toMatchObject({ amount: 1529.1, installment: '4/6' });
    expect(by('NAKİL')).toMatchObject({ amount: 725.66, installment: '3/3' });
    expect(by('AMAZON')).toMatchObject({ amount: 156.34, installment: '1/3' });
  });
  it('keeps description clean', () => expect(by('BAUHAUS').description).toBe('BAUHAUS İNŞAAT MALZEMELER'));
  it('ignores bonus column and campaign/bonus lines', () => {
    expect(by('MİGROS')).toMatchObject({ amount: 159.94 });
    expect(by('KAMPANYA')).toMatchObject({ flag: 'refund' });
    expect(by('BONUS BEDAVA')).toMatchObject({ flag: 'refund' });
    expect(by('TEŞEKKÜR')).toMatchObject({ flag: 'refund' });
  });
  it('uses TRY for foreign purchases', () => expect(by('ANTHROPIC')).toMatchObject({ amount: 1211.31 }));
  it('books interest and taxes as bank fees on the cut-off date', () => {
    const fees = r.rows.filter((x) => x.hint === 'fees');
    expect(fees.map((x) => x.amount)).toEqual([404.05, 16.47, 126.16]);
    expect(fees[0].date).toBe('2026-10-25');
  });
  it('total of ticked spending matches the statement purchases', () => {
    const spend = r.rows.filter((x) => !x.flag && x.kind === 'expense').reduce((a, x) => a + x.amount, 0);
    expect(Math.round(spend * 100) / 100).toBe(Math.round((404.05 + 16.47 + 126.16 + 159.94 + 156.34 + 2190.3 + 1529.1 + 725.66 + 1211.31 + 1470.6) * 100) / 100);
  });
});


describe('Yapı Kredi card: Kalan Tutar/Taksit column and installment note line', () => {
  const L = (text: string, y: number) => ({ text, y, page: 1 });
  const lines = [
    L('Hesap Kesim Tarihi : 27 Ekim 2026', 700),
    L('Son Ödeme Tarihi : 6 Kasım 2026', 690),
    L('İşlem Tarihi  İşlemler  Tutar(TL)  Kalan Tutar/Taksit  Puan', 500),
    L('08 Ekim 2026  MARKET A  İSTANBUL  TR  224,00  9', 480),
    L('10 Ekim 2026  MAGAZA B  İSTANBUL  TR  733,13  5.131,84 / 7  587', 470),
    L("5.864,97 TL'lik işlemin 1 / 8 taksidi", 460),
    L('15 Ekim 2026  ONLINE C  ISTANBUL  TR  1.183,68  2.367,38 / 2  71', 450),
    L("3.551,06 TL'lik işlemin 1 / 3 taksidi", 440),
    L('TOPLAM  2.140,81  667', 420),
  ];
  const r = parseStatementLines(lines, 'yapikredi');
  it('takes this month\'s installment, not the remaining balance', () => {
    expect(r.rows.map((x) => x.amount)).toEqual([224, 733.13, 1183.68]);
    expect(r.rows.reduce((a, x) => a + x.amount, 0)).toBeCloseTo(2140.81, 2);
  });
  it('reads n/N from the note line under the row', () => {
    expect(r.rows.map((x) => x.installment)).toEqual([null, '1/8', '1/3']);
  });
  it('keeps the statement dates', () => {
    expect([r.cutDate, r.dueDate]).toEqual(['2026-10-27', '2026-11-06']);
  });
});

describe('İş Bankası card (app export): trailing minus = charge, plus = credit, points not money', () => {
  const L = (text: string, y: number) => ({ text, y, page: 1 });
  const lines = [
    L('KREDİ KARTI HESAP ÖZETİ', 760), L('Hesap Kesim Tarihi:  04/11/2026', 750), L('Son Ödeme Tarihi:  16/11/2026', 740),
    L('Devir Bakiyesi:  -5,000.00', 730),
    L('İŞLEM TARİHİ  AÇIKLAMA  TUTAR', 700),
    L('5.10.2026  MAGAZA X(5/9 TK) 9,000.00 TL  1,000.00-', 690),
    L('9.10.2026  RESTORAN Y İSTANBUL TR KAZANILAN MAXİMİL:36,00  7,200.00-', 680),
    L('11.10.2026  BLACK RESTORAN INDIRIM  360.00+', 670),
    L('12.10.2026  İNDİRİM NEDENİYLE İPTAL EDİLEN MAXİMİL: 1,80 RESTORAN Y İSTANBUL TR', 660),
    L('16.10.2026  MAXIMILES SANAL YURT DISI KAZANILAN MAXİMİL:500,00', 650),
    L('4.11.2026  KREDİ KARTI YILLIK ÜCRETİ  3,760.00-', 640),
  ];
  const r = parseStatementLines(lines, 'isbank');
  it('reads charges as expenses and the discount as a credit', () => {
    expect(r.rows.map((x) => [x.amount, x.kind])).toEqual([[1000, 'expense'], [7200, 'expense'], [360, 'income'], [3760, 'expense']]);
    expect(r.rows[0].installment).toBe('5/9');
    expect(r.rows[1].description).toBe('RESTORAN Y İSTANBUL TR');
    expect(r.skipped).toBe(0);
    expect(r.dueDate).toBe('2026-11-16');
  });
});
