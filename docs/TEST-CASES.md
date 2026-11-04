# Bütçemiz: End-to-End Test Cases

Target: the production build (`npx vite build` + `vite preview`), Chromium emulating **iPhone 15 Pro** (393×659, touch, `tr-TR` locale).
Automation: `node tests/e2e/run.mjs` (or `node tests/e2e/run.mjs TC40 TC41` to run a subset). Every case starts with an empty localStorage. Confirm dialogs are accepted unless the case says otherwise. Any `console.error` or uncaught page error counts as a failure unless the case explicitly allows it.

Dates: "P(n)" means day *n* of the **previous** month relative to the run date. All names, IBANs and amounts are made up.

Generated files (`tests/e2e/tmp/`):

| File | Content |
|---|---|
| `yapikredi-ekstre.pdf` | Yapı Kredi World Card statement: "Hesap Kesim Tarihi", "Son Ödeme Tarihi", "Dönem Borcu". Table `İşlem Tarihi \| Açıklama \| Tutar \| Puan`. 8 rows: MIGROS 1.245,30 · YEMEKSEPETI 389,90 · SHELL 1.500,00 · TRENDYOL.COM 2/6 TAKSIT 833,33 · ÖDEMENİZ İÇİN TEŞEKKÜR EDERİZ -3.000,00 · IADE - ZARA 250,00+ · ECZANE 224,19 · NETFLIX.COM 229,99 |
| `garanti-hesap-hareketleri.pdf` | Garanti account statement: `Tarih \| Açıklama \| Etiket \| Tutar \| Bakiye`, signed amounts "-1.234,56 TL" and a running balance. 8 rows: MAAŞ ÖDEMESİ +45.000,00 · K.Kartı Ödeme -12.345,67 · FON SATIŞ +2.170,33 · FAST transfer -1.500,00 · HESAP İŞLETİM ÜCRETİ -25,00 · EFT KOMİSYONU -8,50 · ENERJISA FATURA -1.234,56 · APT AİDAT FAST -2.000,00 |
| `garanti-uzun-aciklama.pdf` | Garanti-style account statement whose long descriptions wrap onto several lines (3 rows) |
| `sifreli-ekstre.pdf` | The Yapı Kredi PDF encrypted with password `123456` (made with python3 + pypdf; the case is skipped if those are missing) |
| `kart-ekstre.csv` | UTF-8 BOM, `;`-separated, header `İşlem Tarihi;Açıklama;Tutar (TL)`. 5 rows: A101 1.234,56 · STARBUCKS 145,00 · TURKCELL FATURA 650,00 · ACME DENEME MAĞAZASI 999,99 · ÖDEME - TEŞEKKÜRLER -2.000,00 |
| `notlar.csv`, `bos.csv`, `bozuk.pdf` | Text that is not a statement, a 0-byte file, and a corrupt PDF |
| `bozuk-yedek.json`, `yanlis-yedek.json` | A truncated JSON file, and valid JSON in the wrong shape |

## Cases

| ID | Area | Steps | Dummy input | Expected result |
|---|---|---|---|---|
| TC01 | General | Open the app with no data | – | Title "Bütçemiz", `<html lang="tr">`, tabs Özet/İşlemler/Ekstreler/Ayarlar, "Henüz kayıt yok", all three tiles ₺0, current month label (e.g. "Kasım 2026") |
| TC02 | General | Visit each tab, then reload | – | Each screen opens and shows its empty state; the URL hash follows the tab (`#txns`); reload stays on the same tab |
| TC03 | Layout | At 393px, visit every tab while empty and again with demo data; open the add sheet | Demo data | No horizontal page scroll; no element sticks out of the viewport (except inside scroll containers such as the chips row) |
| TC04 | Layout | Dark colour scheme: load demo data, open the add sheet | `prefers-color-scheme: dark` | Body #0E1116, light text, cards and sheet not white |
| TC05 | Quick add | Tap +, check focus, type the amount, pick Market, add a note, Kaydet | 250, "ŞOK Market Deneme" | Amount field is focused; sheet closes; toast "Kaydedildi"; Gider ₺250 and Bakiye −₺250; stored as 250 expense groceries dated today; list shows the row under "Bugün" |
| TC06 | Quick add | Add an expense written in Turkish format | "1.234,56" | Stored as 1234.56; list shows −₺1.234,56 |
| TC07 | Quick add | Add three expenses | "1,5", "1.234", "12.50" | 1.5, 1234 (dot as thousands separator), 12.5 |
| TC08 | Quick add | Save with a zero amount | "0", "0,00" | "Sıfırdan büyük bir tutar girin"; the sheet stays open; nothing is saved |
| TC09 | Quick add | Save empty; type letters; type an ambiguous number | "", "abc", "1,2,3" | Error for empty input; letters are filtered out; "1,2,3" is never stored as zero or a negative |
| TC10 | Quick add | Type a minus sign | "-50" | The minus is stripped; stored as +50 expense |
| TC11 | Quick add | Add a huge amount | "9.999.999.999,99" | Stored exactly; tiles show the value without clipping; no horizontal scroll |
| TC12 | Quick add | Switch to Gelir and add Maaş | "85.000" | "Ödeme şekli" is hidden; Gelir ₺85.000; Bakiye ₺85.000; the Gelirler legend shows Maaş; card_id is null |
| TC13 | Quick add | Pick no category; pick Garanti Kart and Eşim | 75 | Category Diğer; card and person stored; row subtitle "Diğer · Eşim · Garanti Kart"; Eşim is preselected next time |
| TC14 | Quick add | Close the sheet with X, Escape and a backdrop tap | 99 | The sheet closes each time and nothing is saved |
| TC15 | Transactions | Edit a row and change the amount and category | 250,5 → 300, Yeme & İçme | The amount is prefilled as "250,5"; the update is saved; the list shows −₺300,00 |
| TC16 | Transactions | Edit, then Sil, then confirm | 42 | Toast "Silindi"; empty state; removed from storage |
| TC17 | Persistence | Add a transaction, set the currency to EUR, reload | 123,45 | The transaction and the € formatting persist |
| TC18 | Transactions | Search | "migros", "sisli", "market", "zzzz" | Case- and diacritic-insensitive matches on note and category; "zzzz" shows the empty state |
| TC19 | Transactions | Filter by payment method (card, cash, all) and person chip Eşim | 4 seeded transactions | Counts 1 / 2 / 3, then 2; the totals line shows +₺300 and −₺200 |
| TC20 | Transactions | Previous month; tap the month label (all months) and tap it again | – | Previous month shows 1 row; "Tüm aylar" shows 4; then back to the current month |
| TC21 | Transactions | Add transactions today and yesterday | 10, 20 | Day headers read "Bugün" (net −₺10,00) and "Dün" |
| TC22 | Summary | Add on the last day of the previous month, the 1st of this month and the 1st of next month | 100 / 200 / 50 | Each month's Gider tile shows only its own transaction |
| TC23 | Summary | Navigate back past January, then forward past December | – | The labels cross the year boundary correctly |
| TC24 | Summary | Add income 1.000 and expense 1.500,75 | – | Gelir ₺1.000, Gider ₺1.501, Bakiye −₺501 shown in red (`.neg`) |
| TC25 | Summary | Use the person chips | 100 Çağdaş, 300 Eşim | Gider 400 / 300 / 100 / 400 |
| TC26 | Summary | Demo data, previous month: check the legend, tap a legend row, tap it again, tap a pie slice, tap a drill-down row | – | ≥5 categories; percentages add up to about 100; drill-down list appears; the centre label shows the category; a slice tap selects its legend row; a row tap opens the edit sheet |
| TC27 | Summary | Demo data: "Ödeme şekli" card and trend | – | Bars include "Nakit / Banka kartı" and "Garanti Kart · Çağdaş"; 6 trend columns; tapping a bar switches the month; the Gelirler view hides "Ödeme şekli" |
| TC28 | Summary | Transaction whose category and card do not exist | Injected in storage | The legend shows "?"; totals include it; the row renders |
| TC29 | Settings | Switch to English, reload, then switch back | – | EN tabs, `lang="en"`, title "Our Budget", English category names; persists after reload; Türkçe restores |
| TC30 | Settings | Currency USD | – | Tiles show $, the add sheet shows USD |
| TC31 | Settings | Add a person (padded name), try an empty name, delete the unused person, open a used person | "  Deneme Kişi  " | Name is trimmed; an empty name is not saved; unused person can be deleted; a person who owns cards has no Sil button |
| TC32 | Settings | Add a QNB bank account owned by Eşim, use it, delete it | "Deneme Hesap" | Listed with 🏦; offered in the Ekstreler select; on delete its transactions move to cash |
| TC33 | Settings | Add, rename, use, hide (Gizle) categories; add and delete an income category | "Kırtasiye Deneme", "Freelance" (EN only) | EN name falls back to TR and vice versa; a hidden category is not offered for new transactions but is still shown when editing its own; an unused category can be deleted |
| TC34 | Sync | Open "Eşitlemeyi kur" and enter a bad URL and key | `http://…` + "kisa"; "not a url" + 40 chars | Error toast "… URL / key"; the form stays; no cloud config stored; no overflow |
| TC35 | Backup | Yedeği indir | 77,7 | File `budget-backup-YYYY-MM-DD.json` contains the transactions, categories, people and cards |
| TC36 | Backup | Restore a broken backup, a wrong-shape backup, then a valid one; reload | 3 JSON files | Error toasts and no data change for the bad files; a valid restore replaces everything and survives reload |
| TC37 | Backup | CSV export | A note with quotes and a comma | Header `date,type,amount,category,person,payment,note`; one line per transaction; quotes escaped |
| TC38 | Backup | Load demo data, then Tüm verileri sil | – | Demo income this month ₺157.000; after the reset no transactions are left, defaults are kept, and the empty state shows |
| TC39 | Backup | Tüm verileri sil, then cancel the confirm | – | Data is kept |
| TC40 | Statements | Upload the Yapı Kredi PDF and import | `yapikredi-ekstre.pdf` | "8 işlem bulundu", badge "Yapı Kredi · Kart ekstresi", Yapı Kredi Kart auto-selected, 2 credits unticked, "Taksit 2/6", suggested categories (Market, Yeme & İçme, Ulaşım, **Alışveriş for TRENDYOL**, Sağlık, Abonelikler), button "6 işlemi kaydet · ₺4.422,71", no overflow; the import is linked to the card, person Eşim and one import_id, and listed under Önceki yüklemeler |
| TC41 | Statements | Upload the Garanti account PDF and import | `garanti-hesap-hareketleri.pdf` | "8 işlem bulundu", badge "Garanti BBVA · Hesap hareketleri", Garanti Hesap selected; salary is income in Maaş (ticked); card payment, investment and transfer are unticked with their labels; AİDAT transfer is kept as Faturalar; fees go to Banka Masrafları; the balance column is not used as the amount; "5 işlemi kaydet"; Summary shows Gelir ₺45.000 and Gider ₺3.268 |
| TC42 | Statements | CSV import; Hiçbirini seçme / Tümünü seç; change ACME's category; import; upload another file with the same merchant | `kart-ekstre.csv` | 5 rows; −₺1.234,56; refund unticked; counts 4 → 0 (button disabled) → 5; the changed category is saved and learned as a rule; the next file suggests the learned category |
| TC43 | Statements | Import the CSV, then upload it again | `kart-ekstre.csv` ×2 | "Daha önce yüklenmiş 4 işlem işaretsiz"; 4 rows tagged "Zaten yüklendi"; button disabled; no duplicates stored |
| TC44 | Statements | Import the PDF, set the select to another card, upload the PDF again | `yapikredi-ekstre.pdf` ×2 | Auto-switches to Yapı Kredi and finds 6 duplicates |
| TC45 | Statements | Import, then "Bu yüklemeyi geri al", then upload again | CSV + 1 manual transaction | Exactly the imported rows are removed; the manual one stays; re-import is possible |
| TC46 | Statements | Upload junk, empty and corrupt files | `notlar.csv`, `bos.csv`, `bozuk.pdf` | "Bu dosyadan işlem okunamadı…"; error toast for the PDF; the busy state is cleared; nothing is imported (the app's own `console.error` of the parse exception is allowed) |
| TC47 | Statements | Import the card PDF, then check Summary and the English Statements tab | – | Gider tile, "Yapı Kredi Kart · Eşim" bar, Çağdaş filter → ₺0; the EN "Previous imports" heading; no overflow |
| TC48 | Transactions | Search by amount | "1234", "1.234,56", "250,5" | Each finds its row (the user types the amount as the list shows it) |
| TC49 | Statements | Change an imported row to Hediye in the edit sheet, then import the same merchant again | ACME | A rule is stored; the next import suggests Hediye |
| TC50 | Statements | Upload a PDF with descriptions that wrap over several lines | `garanti-uzun-aciklama.pdf` | All 3 rows are found with full descriptions and correct amounts |
| TC51 | Statements | Upload the encrypted PDF; enter a wrong password, then the right one | `sifreli-ekstre.pdf`, 000000 / 123456 | Password prompt; "Şifre yanlış"; preview with 8 rows |
| TC52 | Layout | Type a 21-character amount in the add sheet | "123456789012345678,99" | The sheet does not get wider than 393px |

Not automated: live Supabase sync (needs a real project), real iOS Safari keyboard and home-screen behaviour, and the service worker offline mode (it only registers over https).
