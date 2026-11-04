import type { Card } from '../types';
import { shiftMonth } from './dates';

/**
 * Month in which a card purchase is paid, from the card's statement cut-off day and due day.
 * Example: cut-off 25, due 4 → a purchase on 10 Oct is on the 25 Oct statement, paid 4 Nov → "2026-11".
 * Returns null for cash/accounts or cards without known days.
 */
export function payMonthFor(dateISO: string, card: Card | undefined | null): string | null {
  if (!card || card.kind === 'account' || !card.cut_day || !card.due_day) return null;
  const day = Number(dateISO.slice(8, 10));
  const month = dateISO.slice(0, 7);
  const statementMonth = day > card.cut_day ? shiftMonth(month, 1) : month;
  // due day before (or on) the cut-off day means the due date falls in the month after the statement
  return card.due_day <= card.cut_day ? shiftMonth(statementMonth, 1) : statementMonth;
}
