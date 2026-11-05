import type { Category, Data, Person } from '../types';

// Colors chosen to stay distinguishable on light and dark backgrounds.
export const PALETTE = ['#4E79A7', '#F28E2B', '#E15759', '#76B7B2', '#59A14F', '#EDC948', '#B07AA1', '#FF9DA7', '#9C755F', '#5FA2CE', '#D37295', '#8CD17D', '#B6992D', '#86BCB6', '#A0CBE8', '#BAB0AC'];

const c = (id: string, name_en: string, name_tr: string, icon: string, color: string, kind: 'expense' | 'income' = 'expense'): Category => ({ id, name_en, name_tr, icon, color, kind });

export const DEFAULT_CATEGORIES: Category[] = [
  c('groceries', 'Groceries', 'Market', '🛒', '#59A14F'),
  c('dining', 'Dining & Cafe', 'Yeme & İçme', '🍽️', '#F28E2B'),
  c('transport', 'Transport & Fuel', 'Ulaşım & Yakıt', '⛽', '#4E79A7'),
  c('bills', 'Bills & Utilities', 'Faturalar', '💡', '#EDC948'),
  c('housing', 'Rent & Home', 'Kira & Ev', '🏠', '#9C755F'),
  c('home_bills', 'Home Bills', 'Ev Faturaları', '🧾', '#F1CE63'),
  c('home_shopping', 'Home Shopping', 'Ev Alışverişi', '🧺', '#499894'),
  c('shopping', 'Shopping', 'Alışveriş', '🛍️', '#B07AA1'),
  c('health', 'Health', 'Sağlık', '💊', '#E15759'),
  c('entertainment', 'Entertainment', 'Eğlence', '🎬', '#FF9DA7'),
  c('subscriptions', 'Subscriptions', 'Abonelikler', '📺', '#76B7B2'),
  c('education', 'Education', 'Eğitim', '📚', '#5FA2CE'),
  c('kids', 'Kids', 'Çocuk', '🧸', '#D37295'),
  c('travel', 'Travel', 'Seyahat', '✈️', '#86BCB6'),
  c('personal', 'Personal Care', 'Kişisel Bakım', '💇', '#B6992D'),
  c('pets', 'Pets', 'Evcil Hayvan', '🐾', '#8CD17D'),
  c('gifts', 'Gifts', 'Hediye', '🎁', '#A0CBE8'),
  c('fees', 'Bank Fees', 'Banka Masrafları', '🏦', '#86BCB6'),
  c('loan', 'Loan Payments', 'Kredi Ödemeleri', '📉', '#9C755F'),
  c('other', 'Other', 'Diğer', '📦', '#BAB0AC'),
  c('salary', 'Salary', 'Maaş', '💼', '#59A14F', 'income'),
  c('bonus', 'Bonus', 'Prim', '⭐', '#EDC948', 'income'),
  c('rental_income', 'Rental Income', 'Kira Geliri', '🏘️', '#4E79A7', 'income'),
  c('other_income', 'Other Income', 'Diğer Gelir', '💰', '#BAB0AC', 'income'),
];

/** Categories added after launch: households created earlier get them on next load. */
const ADDED_CATS = ['home_bills', 'home_shopping'];
export function missingDefaultCats(have: Category[]): Category[] {
  if (!have.length) return [];
  const ids = new Set(have.map((x) => x.id));
  return DEFAULT_CATEGORIES.filter((x) => ADDED_CATS.includes(x.id) && !ids.has(x.id)).map((x) => ({ ...x }));
}

/** Categories that are household (ev) expenses by default. */
export const HOME_CATS = new Set(['housing', 'home_bills', 'home_shopping']);
/** Filter value for the shared household group next to the people chips. */
export const HOME_GROUP = '__home';

export const DEFAULT_PEOPLE: Person[] = [
  { id: 'p1', name: 'Ben', color: '#4E79A7' },
  { id: 'p2', name: 'Eşim', color: '#E15759' },
];

export function emptyData(): Data {
  return {
    categories: DEFAULT_CATEGORIES.map((x) => ({ ...x })),
    people: DEFAULT_PEOPLE.map((x) => ({ ...x })),
    cards: [
      { id: 'c-isbank-p1', name: 'İş Bankası Kart', bank: 'isbank', person_id: 'p1', kind: 'card' },
      { id: 'c-garanti-p1', name: 'Garanti Kart', bank: 'garanti', person_id: 'p1', kind: 'card' },
      { id: 'c-qnb-p1', name: 'QNB Kart', bank: 'qnb', person_id: 'p1', kind: 'card' },
      { id: 'a-isbank-p1', name: 'İş Bankası Hesap', bank: 'isbank', person_id: 'p1', kind: 'account' },
      { id: 'a-garanti-p1', name: 'Garanti Hesap', bank: 'garanti', person_id: 'p1', kind: 'account' },
      { id: 'c-yk-p2', name: 'Yapı Kredi Kart', bank: 'yapikredi', person_id: 'p2', kind: 'card' },
      { id: 'c-isbank-p2', name: 'İş Bankası Kart', bank: 'isbank', person_id: 'p2', kind: 'card' },
    ],
    txns: [],
    rules: [],
  };
}
