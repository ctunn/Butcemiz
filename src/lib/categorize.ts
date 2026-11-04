import { fold, merchantKey } from './text';
import type { Rule } from '../types';

// Keyword → category id. Matched against folded description (lowercase, no diacritics).
const KEYWORDS: [string, string[]][] = [
  ['subscriptions', ['netflix', 'spotify', 'youtube', 'apple.com', 'itunes', 'icloud', 'disney', 'prime video', 'amazon prime', 'exxen', 'blutv', 'blu tv', 'gain', 'tabii', 'google storage', 'google one', 'chatgpt', 'openai', 'claude.ai', 'anthropic', 'microsoft', 'xbox game pass', 'storytel']],
  ['dining', ['yemeksepeti', 'trendyol yemek', 'trendyolyemek', 'getiryemek', 'getir yemek', 'migros yemek', 'starbucks', 'kahve dunyasi', 'burger', 'mcdonald', 'kfc', 'popeyes', 'dominos', 'pizza', 'simit sarayi', 'cafe', 'kafe', 'coffee', 'kahve', 'restoran', 'restaurant', 'lokanta', 'kebap', 'doner', 'pide', 'baklava', 'pastane', 'gloria jean', 'espressolab', 'tavuk dunyasi', 'big chefs', 'kofteci']],
  ['groceries', ['migros', 'a101', 'bim ', 'bim birlesik', 'sok market', 'sok mag', 'carrefour', 'file market', 'metro ', 'macrocenter', 'getir', 'hakmar', 'tarim kredi', 'onur market', 'kim market', 'happy center', 'market', 'manav', 'kasap', 'firin', 'bakkal', 'sarkuteri']],
  ['transport', ['shell', 'opet', 'petrol ofisi', ' bp ', 'bp ', 'total', 'aytemiz', 'lukoil', 'akaryakit', 'istanbulkart', 'otopark', 'park ', 'uber', 'bitaksi', 'marti', 'hgs', 'ogs', 'otoyol', 'kopru', ' taksi ', 'metro istanbul', 'iett', ' ego ', 'izban', 'tcdd', 'oto yikama', 'lastik']],
  ['bills', ['turkcell', 'vodafone', 'turk telekom', 'turktelekom', 'ttnet', 'turknet', 'superonline', 'igdas', 'enerjisa', 'ck enerji', 'ck bogazici', 'aydem', 'gediz', 'iski', 'aski', 'izsu', 'dogalgaz', 'dogal gaz', 'elektrik', 'su idaresi', 'fatura', 'sigorta', 'digiturk', 'd-smart', 'tivibu', 'aidat']],
  ['housing', ['kira', 'emlak', 'koctas', 'bauhaus', 'ikea', 'english home', 'madame coco', 'karaca', 'tekzen', 'mobilya', 'hirdavat']],
  ['shopping', ['trendyol', 'hepsiburada', 'amazon', 'n11', 'ciceksepeti', 'zara', 'lc waikiki', 'lcw', 'defacto', 'koton', 'mavi', 'h&m', 'h m ', 'bershka', 'pull bear', 'pull&bear', 'massimo', 'mango', 'boyner', 'teknosa', 'mediamarkt', 'media markt', 'vatan bilgisayar', 'apple store', 'decathlon', 'flo ', 'in street', 'superstep', 'beymen', 'vakko', 'network', 'ipekyol', 'derimod', 'english home']],
  ['health', ['eczane', 'eczanesi', 'hastane', 'hospital', 'acibadem', 'medical park', 'memorial', 'florence', 'liv hospital', 'medicana', 'dent', 'dis klinik', 'laboratuvar', 'optik', 'saglik', 'klinik', 'doktor']],
  ['entertainment', ['sinema', 'cinema', 'cinemaximum', 'paribu cineverse', 'biletix', 'passo', 'biletinial', 'steam', 'playstation', 'nintendo', 'epic games', 'tiyatro', 'konser', 'bowling', 'muze']],
  ['travel', ['otel', 'hotel', 'booking', 'airbnb', 'pegasus', 'thy', 'turk hava', 'turkish airlines', 'ajet', 'anadolujet', 'sunexpress', 'obilet', 'enuygun', 'tatilbudur', 'etstur', 'jolly', 'havalimani', 'airport', 'rent a car', 'duty free']],
  ['personal', ['kuafor', 'berber', 'gratis', 'watsons', 'rossmann', 'sephora', 'mac cosmetics', 'flormar', 'golden rose', 'guzellik', 'spa ', 'masaj']],
  ['education', ['kirtasiye', 'okul', 'kurs', 'udemy', 'coursera', 'kitap', 'd&r', 'd r ', 'idefix', 'universite', 'kolej', 'egitim']],
  ['kids', ['toyzz', 'oyuncak', 'joker', 'ebebek', 'mothercare', 'bebek', 'kidz']],
  ['pets', ['pet ', 'petshop', 'pet shop', 'veteriner', 'vet ', 'mama']],
  ['gifts', ['cicek', 'hediye', 'gift', 'flowers']],
];

export function suggestCategory(desc: string, rules: Rule[] = []): string | null {
  const key = merchantKey(desc);
  if (key) {
    const learned = rules.find((r) => r.key === key);
    if (learned) return learned.category_id;
  }
  const f = ' ' + fold(desc).replace(/[^a-z0-9&.\s]/g, ' ').replace(/\s+/g, ' ') + ' ';
  for (const [cat, words] of KEYWORDS) {
    for (const w of words) if (f.includes(w.startsWith(' ') ? w : w.endsWith(' ') ? ' ' + w : w)) return cat;
  }
  return null;
}
