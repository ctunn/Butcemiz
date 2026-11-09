export type Kind = 'expense' | 'income';
export type Lang = 'en' | 'tr';
export type BankId = 'isbank' | 'garanti' | 'qnb' | 'yapikredi' | 'other';

export interface Category {
  id: string;
  name_en: string;
  name_tr: string;
  icon: string;
  color: string;
  kind: Kind;
  archived?: boolean;
}

export interface Person {
  id: string;
  name: string;
  color: string;
}

export interface Card {
  id: string;
  name: string;
  bank: BankId;
  person_id: string | null;
  last4?: string | null;
  kind?: 'card' | 'account';
  cut_day?: number | null; // statement cut-off day (hesap kesim)
  due_day?: number | null; // payment due day (son ödeme)
}

export interface Txn {
  id: string;
  kind: Kind;
  amount: number; // always positive
  date: string; // YYYY-MM-DD
  category_id: string;
  person_id: string | null;
  card_id: string | null; // null = cash / bank account
  note: string;
  source: 'manual' | 'import' | 'projected' | 'screenshot'; // screenshot = provisional until the statement
  import_id?: string | null;
  pay_month?: string | null; // YYYY-MM the card bill is paid in (budget month); null = purchase month
  plan_key?: string | null; // identifies one installment purchase across statements
  inst_no?: number | null; // which installment this row is (1..N)
  projected?: boolean; // a future installment that has not appeared on a statement yet
  shared?: boolean; // household (ev) expense shared by both, shown under the "Ev" group
  created_at: string;
}

export interface Rule {
  id: string;
  key: string; // normalized merchant key
  category_id: string;
}

export interface ShopItem {
  id: string;
  name: string;
  done: boolean;
  person_id: string | null; // who added it
  created_at: string;
  list?: ShopList; // missing = daily
  price?: number | null; // rough price for wish / needed items
}

export type ShopList = 'daily' | 'wish' | 'needed';

export interface Data {
  categories: Category[];
  people: Person[];
  cards: Card[];
  txns: Txn[];
  rules: Rule[];
  shopping: ShopItem[];
}

export type TableName = keyof Data;
