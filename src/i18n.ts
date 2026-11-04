import type { Lang } from './types';
import { useStore } from './store/store';

const en = {
  appName: 'Our Budget',
  home: 'Summary', txns: 'Transactions', add: 'Add', import: 'Statements', settings: 'Settings',
  income: 'Income', expense: 'Expense', expenses: 'Expenses', incomes: 'Income', net: 'Balance',
  everyone: 'Everyone', allCards: 'All payment methods', cash: 'Cash / Debit', byCategory: 'By category',
  noData: 'Nothing here yet', noDataHint: 'Tap + to add your first expense, or import a card statement.',
  amount: 'Amount', category: 'Category', date: 'Date', person: 'Who', paidWith: 'Paid with', note: 'Note (optional)',
  save: 'Save', cancel: 'Cancel', delete: 'Delete', edit: 'Edit', saved: 'Saved', deleted: 'Deleted', close: 'Close',
  addExpense: 'Add expense', addIncome: 'Add income', editTxn: 'Edit transaction', confirmDelete: 'Delete this transaction?',
  invalidAmount: 'Enter an amount greater than zero',
  today: 'Today', yesterday: 'Yesterday', search: 'Search', allMonths: 'All months', total: 'Total',
  last6: 'Last 6 months', topCategories: 'Top categories', ofExpenses: 'of spending',
  importTitle: 'Import a card statement', importHint: 'Choose the PDF or CSV statement you downloaded from your bank app. It is read on this phone and never uploaded anywhere except your own budget.',
  chooseFile: 'Choose PDF or CSV', card: 'Card', reading: 'Reading statement…', pdfPassword: 'This PDF is password protected. Enter the statement password (often the last digits of your ID number).',
  wrongPassword: 'Wrong password, try again.', unlock: 'Open', found: 'Found {n} transactions', foundCredits: '{n} payments/refunds are unticked',
  duplicates: '{n} already imported are unticked', importN: 'Import {n} transactions', imported: 'Imported {n} transactions',
  noRows: 'No transactions could be read from this file. Try the CSV/Excel export from your bank, or add the items by hand.',
  detectedBank: 'Detected bank', payment: 'Payment / refund', duplicate: 'Already imported', selectAll: 'Select all', selectNone: 'Select none',
  uncategorized: 'Needs a category', pastImports: 'Previous imports', undoImport: 'Remove this import', confirmUndo: 'Remove all transactions from this import?',
  language: 'Language', currency: 'Currency', people: 'People', cards: 'Cards', categories: 'Categories', addCard: 'Add card', addCategory: 'Add category', addPerson: 'Add person',
  name: 'Name', bank: 'Bank', owner: 'Owner', icon: 'Icon', color: 'Colour', kind: 'Type',
  sync: 'Sync between phones', syncLocal: 'Data is saved only on this phone.', syncCloud: 'Synced with your household',
  syncSetup: 'Set up sync', supaUrl: 'Supabase project URL', supaKey: 'Supabase anon key', connect: 'Connect', disconnect: 'Stop syncing on this phone',
  email: 'Email', password: 'Password', signIn: 'Sign in', signUp: 'Create account', signOut: 'Sign out',
  createHousehold: 'Create household', joinHousehold: 'Join with invite code', inviteCode: 'Invite code', householdName: 'Household name',
  shareCode: 'Share this code with your partner so they can join:', moveLocal: 'Copy this phone\'s data to the household',
  checkEmail: 'Check your email to confirm the account, then sign in.',
  backup: 'Backup', exportJson: 'Download backup', importJson: 'Restore backup', exportCsv: 'Export transactions (CSV)', restoreConfirm: 'Replace all data with this backup?',
  resetAll: 'Delete all data', resetConfirm: 'This deletes every transaction, card and category. Continue?', demoData: 'Load demo data',
  installHint: 'Install on iPhone: tap Share, then "Add to Home Screen".',
  error: 'Something went wrong', retry: 'Retry', archived: 'Hidden', show: 'Show', hide: 'Hide',
  method: 'Payment', expenseCats: 'Expense categories', incomeCats: 'Income categories', offline: 'Offline — showing saved data',
  perPerson: 'Per person', thisMonth: 'This month', installment: 'Installment', cardOrAccount: 'Card / account',
  flag_cardpay: 'Card payment (already counted in card statement)', flag_transfer: 'Transfer', flag_investment: 'Investment / savings', flag_cash: 'Cash withdrawal', flag_refund: 'Payment / refund',
  modeCard: 'Card statement', modeAccount: 'Account statement', unticked: '{n} transfers, card payments or investments are unticked so nothing is counted twice',
  basisLabel: 'Which month card spending counts in', basisPay: 'Payment month', basisPurchase: 'Purchase date', basisPayHint: 'Card purchases count in the month the statement is paid, next to the salary that pays it.', basisPurchaseHint: 'Every purchase counts on the day it was made.', cutDay: 'Statement day', dueDay: 'Payment due day',
  confirmYes: 'Yes, continue', cardDeleteConfirm: '{n} transactions use this card. They will be moved to Cash / Debit. Continue?', skippedRows: '{n} lines looked like transactions but could not be read; check them against the statement.',
  cardKind: 'Type', kindCard: 'Credit card', kindAccount: 'Bank account',
};

export type Dict = typeof en;

const tr: Dict = {
  appName: 'Bütçemiz',
  home: 'Özet', txns: 'İşlemler', add: 'Ekle', import: 'Ekstreler', settings: 'Ayarlar',
  income: 'Gelir', expense: 'Gider', expenses: 'Giderler', incomes: 'Gelirler', net: 'Bakiye',
  everyone: 'Herkes', allCards: 'Tüm ödeme yöntemleri', cash: 'Nakit / Banka kartı', byCategory: 'Kategoriye göre',
  noData: 'Henüz kayıt yok', noDataHint: 'İlk harcamanızı eklemek için + tuşuna basın ya da kart ekstresi yükleyin.',
  amount: 'Tutar', category: 'Kategori', date: 'Tarih', person: 'Kim', paidWith: 'Ödeme şekli', note: 'Not (isteğe bağlı)',
  save: 'Kaydet', cancel: 'Vazgeç', delete: 'Sil', edit: 'Düzenle', saved: 'Kaydedildi', deleted: 'Silindi', close: 'Kapat',
  addExpense: 'Harcama ekle', addIncome: 'Gelir ekle', editTxn: 'İşlemi düzenle', confirmDelete: 'Bu işlem silinsin mi?',
  invalidAmount: 'Sıfırdan büyük bir tutar girin',
  today: 'Bugün', yesterday: 'Dün', search: 'Ara', allMonths: 'Tüm aylar', total: 'Toplam',
  last6: 'Son 6 ay', topCategories: 'En çok harcanan', ofExpenses: 'harcamanın',
  importTitle: 'Kart ekstresi yükle', importHint: 'Banka uygulamanızdan indirdiğiniz PDF veya CSV ekstreyi seçin. Dosya bu telefonda okunur, yalnızca kendi bütçenize kaydedilir.',
  chooseFile: 'PDF veya CSV seç', card: 'Kart', reading: 'Ekstre okunuyor…', pdfPassword: 'Bu PDF şifreli. Ekstre şifresini girin (genellikle T.C. kimlik numaranızın son haneleri).',
  wrongPassword: 'Şifre yanlış, tekrar deneyin.', unlock: 'Aç', found: '{n} işlem bulundu', foundCredits: '{n} ödeme/iade işaretsiz bırakıldı',
  duplicates: 'Daha önce yüklenmiş {n} işlem işaretsiz', importN: '{n} işlemi kaydet', imported: '{n} işlem kaydedildi',
  noRows: 'Bu dosyadan işlem okunamadı. Bankanın CSV/Excel çıktısını deneyin ya da kalemleri elle ekleyin.',
  detectedBank: 'Banka', payment: 'Ödeme / iade', duplicate: 'Zaten yüklendi', selectAll: 'Tümünü seç', selectNone: 'Hiçbirini seçme',
  uncategorized: 'Kategori seçin', pastImports: 'Önceki yüklemeler', undoImport: 'Bu yüklemeyi geri al', confirmUndo: 'Bu yüklemedeki tüm işlemler silinsin mi?',
  language: 'Dil', currency: 'Para birimi', people: 'Kişiler', cards: 'Kartlar', categories: 'Kategoriler', addCard: 'Kart ekle', addCategory: 'Kategori ekle', addPerson: 'Kişi ekle',
  name: 'Ad', bank: 'Banka', owner: 'Sahibi', icon: 'Simge', color: 'Renk', kind: 'Tür',
  sync: 'Telefonlar arası eşitleme', syncLocal: 'Veriler yalnızca bu telefonda saklanıyor.', syncCloud: 'Hane ile eşitleniyor',
  syncSetup: 'Eşitlemeyi kur', supaUrl: 'Supabase proje adresi', supaKey: 'Supabase anon anahtarı', connect: 'Bağlan', disconnect: 'Bu telefonda eşitlemeyi durdur',
  email: 'E-posta', password: 'Şifre', signIn: 'Giriş yap', signUp: 'Hesap oluştur', signOut: 'Çıkış yap',
  createHousehold: 'Hane oluştur', joinHousehold: 'Davet koduyla katıl', inviteCode: 'Davet kodu', householdName: 'Hane adı',
  shareCode: 'Eşinizin katılması için bu kodu paylaşın:', moveLocal: 'Bu telefondaki verileri haneye kopyala',
  checkEmail: 'Hesabı onaylamak için e-postanızı kontrol edin, sonra giriş yapın.',
  backup: 'Yedek', exportJson: 'Yedeği indir', importJson: 'Yedekten geri yükle', exportCsv: 'İşlemleri dışa aktar (CSV)', restoreConfirm: 'Tüm veriler bu yedekle değiştirilsin mi?',
  resetAll: 'Tüm verileri sil', resetConfirm: 'Tüm işlemler, kartlar ve kategoriler silinecek. Devam edilsin mi?', demoData: 'Örnek veri yükle',
  installHint: 'iPhone\'a yüklemek için: Paylaş\'a, sonra "Ana Ekrana Ekle"ye dokunun.',
  error: 'Bir hata oluştu', retry: 'Tekrar dene', archived: 'Gizli', show: 'Göster', hide: 'Gizle',
  method: 'Ödeme', expenseCats: 'Gider kategorileri', incomeCats: 'Gelir kategorileri', offline: 'Çevrimdışı — kayıtlı veriler gösteriliyor',
  perPerson: 'Kişiye göre', thisMonth: 'Bu ay', installment: 'Taksit', cardOrAccount: 'Kart / hesap',
  flag_cardpay: 'Kart ödemesi (kart ekstresinde zaten var)', flag_transfer: 'Transfer', flag_investment: 'Yatırım / birikim', flag_cash: 'Nakit çekim', flag_refund: 'Ödeme / iade',
  modeCard: 'Kart ekstresi', modeAccount: 'Hesap hareketleri', unticked: 'Çift sayılmaması için {n} transfer, kart ödemesi veya yatırım işaretsiz bırakıldı',
  basisLabel: 'Kart harcamaları hangi ayda sayılsın', basisPay: 'Ödeme ayı', basisPurchase: 'Harcama tarihi', basisPayHint: 'Kart harcamaları ekstrenin ödendiği ayda, onu ödeyen maaşın yanında sayılır.', basisPurchaseHint: 'Her harcama yapıldığı günün ayında sayılır.', cutDay: 'Hesap kesim günü', dueDay: 'Son ödeme günü',
  confirmYes: 'Evet, devam et', cardDeleteConfirm: 'Bu kartta {n} işlem var. Nakit / Banka kartı olarak işaretlenecekler. Devam edilsin mi?', skippedRows: 'İşleme benzeyen {n} satır okunamadı; ekstreyle karşılaştırın.',
  cardKind: 'Tür', kindCard: 'Kredi kartı', kindAccount: 'Banka hesabı',
};

export const DICTS: Record<Lang, Dict> = { en, tr };

export function useT() {
  const { prefs } = useStore();
  const d = DICTS[prefs.lang];
  return (key: keyof Dict, vars?: Record<string, string | number>) => {
    let s = d[key] ?? en[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
    return s;
  };
}
