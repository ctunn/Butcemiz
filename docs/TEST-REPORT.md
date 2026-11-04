# Bütçemiz: E2E Test Report

## Round 2 (after fixes): 52 / 52 passed

| Round | Total | Passed | Failed |
|---|---|---|---|
| 1 | 52 | 49 | 3 |
| 2 | 52 | 52 | 0 |

Fixes made between the rounds:
- **TC40 (major):** the transport keyword "taksi" matched "TAKSİT", so installment purchases landed in Ulaşım. Keywords now match whole words only, and a unit test covers it.
- **TC11 (minor):** amounts of ₺1 million and more now use compact notation in the summary tiles and the chart centre (₺10 Mr, ₺2,5 Mn). The test now expects that format.
- **TC48 (minor):** search now also matches the amount as it is displayed ("1.234,56", "250,5").

Observations from round 1, also handled:
- CSV export now uses `;` and decimal commas when the app is in Turkish, so Turkish Excel opens it in columns.
- The importer now says how many dated lines it could not read.
- Confirmations (delete, undo import, reset, restore) use an in-app dialog instead of the browser pop-up.

Unit tests: 81 / 81 passed (parsers, money and date formats, categories, statistics).

---

## Round 1 details

- **Build tested:** `npx vite build` → `vite preview --port 4180`
- **Browser:** Chromium (Playwright) emulating iPhone 15 Pro (393×659, touch), locale tr-TR
- **Suite:** `node tests/e2e/run.mjs` (cases are described in `docs/TEST-CASES.md`)
- **Runs:** 2 full runs gave identical results, so no flaky cases were seen. Raw results and screenshots are in `tests/e2e/report/` (`results.json`, `results.md`, `*-pass.png`, `*-fail.png`).

## Summary

| Total | Passed | Failed | Skipped |
|---|---|---|---|
| 52 | 49 | 3 | 0 |

| Severity | Count |
|---|---|
| Blocker | 0 |
| Major | 1 (TC40) |
| Minor | 2 (TC11, TC48) |

## Results per case

| ID | Area | Case | Result |
|---|---|---|---|
| TC01 | Genel | First launch shows Turkish UI and empty state | PASS |
| TC02 | Genel | Tab navigation and empty states on every tab | PASS |
| TC03 | Düzen | 393px width: no horizontal scroll on any tab (empty and with demo data) | PASS |
| TC04 | Düzen | Dark mode uses dark palette and stays readable | PASS |
| TC05 | Hızlı ekleme | Add a basic expense with + button | PASS |
| TC06 | Hızlı ekleme | Turkish decimal "1.234,56" is parsed as 1234.56 | PASS |
| TC07 | Hızlı ekleme | Other number formats: "1,5" → 1.50, "1.234" → 1234, "12.50" → 12.50 | PASS |
| TC08 | Hızlı ekleme | Zero amount is rejected with a message | PASS |
| TC09 | Hızlı ekleme | Empty and non-numeric amount are rejected | PASS |
| TC10 | Hızlı ekleme | Negative input "-50" never stores a negative amount | PASS |
| TC11 | Hızlı ekleme | Huge amount 9.999.999.999,99 is stored and tiles are not clipped | **FAIL** |
| TC12 | Hızlı ekleme | Add income (Gelir) 85.000 Maaş | PASS |
| TC13 | Hızlı ekleme | No category chosen → Diğer; card + person stored | PASS |
| TC14 | Hızlı ekleme | Close (X), Escape and backdrop dismiss the sheet without saving | PASS |
| TC15 | İşlemler | Edit a transaction (amount prefilled with Turkish comma) | PASS |
| TC16 | İşlemler | Delete a transaction with confirmation | PASS |
| TC17 | Kalıcılık | Data and settings survive a reload | PASS |
| TC18 | İşlemler | Search is case/diacritic-insensitive and shows empty state on no match | PASS |
| TC19 | İşlemler | Filter by payment method and by person | PASS |
| TC20 | İşlemler | Month navigation and "Tüm aylar" toggle | PASS |
| TC21 | İşlemler | Day groups: Bugün / Dün headers with daily net | PASS |
| TC22 | Özet | Month boundaries: last day of previous month, 1st of this month, 1st of next month | PASS |
| TC23 | Özet | Year boundary: navigating back from January reaches December of previous year | PASS |
| TC24 | Özet | Income / expense / balance tiles, negative balance shown in red with minus | PASS |
| TC25 | Özet | Person filter on summary | PASS |
| TC26 | Özet | Pie chart + legend: percentages, tap legend to drill down, tap slice | PASS |
| TC27 | Özet | "Ödeme şekli" breakdown and 6-month trend | PASS |
| TC28 | Özet | Uncategorised / deleted-category transaction does not break the chart | PASS |
| TC29 | Ayarlar | Language switch to English and back; persists after reload | PASS |
| TC30 | Ayarlar | Currency switch to USD changes formatting | PASS |
| TC31 | Ayarlar | Add a person, use it, delete an unused person | PASS |
| TC32 | Ayarlar | Add a bank account, it appears in Ekstreler; deleting a used card moves txns to cash | PASS |
| TC33 | Ayarlar | Add, rename, hide and delete categories | PASS |
| TC34 | Ayarlar | Sync panel renders; invalid Supabase URL/key is rejected | PASS |
| TC35 | Yedek | Download backup JSON contains all data | PASS |
| TC36 | Yedek | Restore a backup replaces data; broken/invalid backup is rejected | PASS |
| TC37 | Yedek | CSV export has header, all rows and escapes quotes | PASS |
| TC38 | Yedek | Load demo data, then "Tüm verileri sil" resets to defaults | PASS |
| TC39 | Yedek | Cancelling the delete-all confirmation keeps data | PASS |
| TC40 | Ekstreler | Yapı Kredi credit-card PDF: preview, detection, credits unticked, categories, installment | **FAIL** |
| TC41 | Ekstreler | Garanti account PDF: salary, card payment, investment, transfer, fees | PASS |
| TC42 | Ekstreler | CSV import (semicolon, BOM, Turkish decimals), select all/none, category change is learned | PASS |
| TC43 | Ekstreler | Duplicate import: same file again → rows marked "Zaten yüklendi" and unticked | PASS |
| TC44 | Ekstreler | Duplicate detection also works for PDF re-import and when user picks the same card manually | PASS |
| TC45 | Ekstreler | Undo an import removes exactly its transactions | PASS |
| TC46 | Ekstreler | Invalid files: junk CSV, empty CSV, corrupt PDF show a friendly message | PASS |
| TC47 | Ekstreler | Imported card statement shows correctly in Summary pie + paid-with and in English | PASS |
| TC48 | İşlemler | Search by amount typed the Turkish way ("1.234,56" and "250,5") | **FAIL** |
| TC49 | Ekstreler | Re-categorising an imported transaction teaches the importer | PASS |
| TC50 | Ekstreler | Account PDF where long descriptions wrap onto two lines (Garanti style) keeps every row | PASS |
| TC51 | Ekstreler | Password-protected PDF asks for the password, rejects a wrong one, opens with the right one | PASS |
| TC52 | Düzen | Very long number typed in the amount field does not push the sheet wider than 393px | PASS |

## Failures

### BUG-1 (TC40): Installment purchases ("… TAKSIT") are categorised as Ulaşım & Yakıt. Severity: **major**

**Steps to reproduce**
1. Open Ekstreler and upload a card statement that has the row `TRENDYOL.COM 2/6 TAKSIT  833,33` (generated `tests/e2e/tmp/yapikredi-ekstre.pdf`).
2. Look at the category dropdown on that row.

- **Expected:** Alışveriş (`shopping`), because "trendyol" is a shopping keyword.
- **Actual:** Ulaşım & Yakıt (`transport`).

**Suspected cause:** In `src/lib/categorize.ts:9` the `transport` keyword list contains `'taksi'`, and `suggestCategory` (`categorize.ts:23-31`, substring test on line 31) matches keywords as plain substrings. "taksi" is a substring of "**taksi**t", and `transport` is checked before `shopping`, so the transport rule wins. Turkish card statements write "TAKSIT" on every installment line, so nearly every installment purchase is filed under transport. The pie chart is then wrong until the user fixes each row by hand.

**Suggested fix:** Match `taksi` only as a whole word (`' taksi '`, as is already done for `' bp '`), or exclude "taksit".

Screenshot: `tests/e2e/report/TC40-fail.png`

### BUG-2 (TC11): Large amounts are cut off in the Özet tiles and spill out of the donut centre. Severity: **minor**

**Steps to reproduce**
1. Tap + and enter `9.999.999.999,99`, then tap Kaydet.
2. Look at the Gider and Bakiye tiles and at the pie centre.

- **Expected:** The full value is readable, shrunk or abbreviated if needed.
- **Actual:** The tiles show `₺10.000.000.0` and `−₺10.000.000.` (scrollWidth 109 and 118 px against a 93 px tile). The donut centre text `₺10.000.000.000` runs over the ring.

**Suspected cause:** `src/screens/Home.tsx:48` shrinks the value in only two steps (`sm` above 8 characters, `xs` above 10), and `src/styles.css:63-64` uses `overflow:hidden; white-space:nowrap` with no ellipsis, so nothing scales beyond 13px. `src/components/PieChart.tsx:43` (centre value) never goes below 17px. The amount itself is stored correctly (9999999999.99). In practice this starts at roughly 12 characters (about −₺10.000.000), so it is rare for a household.

**Suggested fix:** Use a compact notation (`notation:'compact'` → "₺10 Mr") when the value is long, or scale the font to fit.

Screenshot: `tests/e2e/report/TC11-fail.png`

### BUG-3 (TC48): Searching for an amount the way it is displayed finds nothing. Severity: **minor**

**Steps to reproduce**
1. Add an expense of `1.234,56`.
2. Open İşlemler and type `1.234,56` in Ara (or `250,5` for a 250,50 expense).

- **Expected:** The row is found, because the list shows "−₺1.234,56" and Turkish users type amounts that way.
- **Actual:** "Henüz kayıt yok". Only `1234.56` or `1234` matches.

**Suspected cause:** `src/screens/Transactions.tsx:28` builds the search text with `String(x.amount)`, which gives "1234.56" (JS format) and not the displayed Turkish format.

**Suggested fix:** Add `h.money(x.amount)` and the comma variant to the searchable text, or normalise the query with `parseAmount`.

Screenshot: `tests/e2e/report/TC48-fail.png`

## Observations (not counted as failures)

- **Add sheet title:** The add sheet title stays "Harcama ekle" after switching the toggle to Gelir (`src/App.tsx:63`). This is cosmetic.
- **CSV export separators:** The CSV export uses `,` as the separator and `.` as the decimal mark (`src/screens/Settings.tsx:36-38`). Excel set to Turkish expects `;` and `,`, so the file opens as a single column there. This is worth considering for the target users.
- **Logged parse errors:** A corrupt PDF logs the raw exception with `console.error` (`src/screens/Import.tsx:63`). The user still sees a friendly toast and message. TC46 allows this log explicitly.
- **Rows dropped without notice:** The parser drops rows it cannot read without telling the user, because `ParseResult.skipped` is never shown in the UI. My first draft PDF had cells that wrapped badly, and it quietly lost 2 of 8 rows. Real-world wrapping (TC50) works, but showing "N rows could not be read" would make a silent loss visible.
- **Not covered by automation:** live Supabase sync, real iOS Safari keyboard and home-screen behaviour, and the service worker (it registers only on https).

## Representative screenshots

- `tests/e2e/report/TC41-pass.png`: Garanti account statement preview with flags
- `tests/e2e/report/TC26-pass.png`: Özet pie chart drill-down with demo data
- `tests/e2e/report/TC40-fail.png`: TRENDYOL TAKSIT row categorised as Ulaşım
- Others: `TC01` (empty state), `TC03` (393px), `TC04` (dark mode), `TC29` (English), `TC43` (duplicates), `TC46` (invalid file), `TC50` (wrapped PDF)
