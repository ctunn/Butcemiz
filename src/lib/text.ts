/** Lowercase with Turkish rules and strip diacritics so "ŞOK MARKET" ~ "sok market". */
export function fold(s: string): string {
  return s
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Stable key for a merchant description: folded, digits/punctuation removed, first 2 meaningful words. */
export function merchantKey(desc: string): string {
  const words = fold(desc)
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
  return words.slice(0, 2).join(' ');
}

const STOP = new Set(['www', 'com', 'tr', 'ltd', 'sti', 'as', 'a', 's', 'san', 'tic', 've', 'istanbul', 'ankara', 'izmir', 'tl', 'try', 'pos', 'isl']);
