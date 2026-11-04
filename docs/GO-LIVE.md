# Bütçemiz: putting it on both iPhones

This takes about 20 minutes, once. Everything here is free.

## 1. Create the shared database (Supabase, 8 min)

1. Go to https://supabase.com, sign up with GitHub, then click **New project**.
   - Name: `butcemiz`. Region: **Central EU (Frankfurt)**, which is closest to Turkey. Pick a database password and save it somewhere.
2. When the project is ready, open **SQL Editor → New query**. Paste the whole of [`supabase/schema.sql`](../supabase/schema.sql) and press **Run**. It should say "Success. No rows returned".
3. Open **Authentication → Sign In / Providers → Email** and turn **Confirm email** OFF. You can leave it on, but then each of you has to click a link in an email before the first login.
4. Open **Project Settings → API** and copy the **Project URL** and the **anon public** key. The anon key is safe to put in an app, because the database rules only let each household see its own rows.

## 2. Put the app online (GitHub Pages, 5 min)

1. Create a new **public** repository on GitHub called `butcemiz`. GitHub Pages is free only for public repositories. The code holds no personal data: your transactions live in Supabase.
2. Push this folder to it. Claude does this once your GitHub account is connected.
3. In the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.
4. Optional but recommended: open **Settings → Secrets and variables → Actions → Variables** and add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` with the values from step 1.4. Both phones then sync without typing the key.
5. Under **Actions**, wait for "Deploy to GitHub Pages" to turn green. Your app is at `https://<your-username>.github.io/butcemiz/`.

Alternative: on https://vercel.com, use **Add New → Project** and import the repository. This also works with a private repository. Add the same two variables under Environment Variables.

## 3. Install on each iPhone (1 min per phone)

1. Open the app link in **Safari**. It must be Safari, not Chrome.
2. Tap **Share**, then **Add to Home Screen**, then **Add**.
3. Open **Bütçemiz** from the home screen. It runs full-screen like a normal app and works offline.

## 4. Connect the two phones

On your phone:
1. Go to **Ayarlar (Settings) → Telefonlar arası eşitleme (Sync)**. If you skipped step 2.4, paste the URL and anon key and tap **Bağlan (Connect)**.
2. Enter your email and a password, then tap **Hesap oluştur (Create account)**.
3. Tap **Hane oluştur (Create household)**. Any data already on the phone is copied up.
4. Note the 6-letter **invite code** it shows.

On your wife's phone:
1. Do the same steps 1 and 2 with her own email.
2. Type the invite code and tap **Davet koduyla katıl (Join)**.

From then on, anything either of you adds shows up on the other phone within a few seconds.

## 5. Importing statements

- **Credit card statement (ekstre):** in the bank app, open the card, then Ekstre, then download or share the PDF and save it to Files. In Bütçemiz, go to **Ekstreler**, choose the card, and pick the PDF.
- **Account activity (hesap hareketleri):** works the same way. Salary is recognised as income. Credit card payments, transfers between your own accounts, fund and gold buys or sells, and cash withdrawals are unticked by default, so nothing is counted twice. You can tick any of them before importing.
- **Password-protected PDFs:** the app asks for the password, which is usually the last digits of your TC number. The file is read on the phone and is never uploaded.
- **Wrong category?** Change it in the preview list. The app remembers your choice for that shop next time.
- **Imported the wrong file?** Go to Ekstreler, then Önceki yüklemeler, then **Bu yüklemeyi geri al**.

## Backups

Settings → Yedek → **Yedeği indir** saves a JSON file. Supabase also keeps daily backups.
