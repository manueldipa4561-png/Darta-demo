# Darta Card in Apple Wallet and Google Wallet

The **Darta Card** comes with a membership (Darta Essential or Darta Premium). The wallet button is built and switched off until a wallet account exists. Until then it shows the demo message, so the live site never breaks.

## What the customer gets

- Anyone can design the card on the home page (name, finish, stamp, barber), but nobody can stamp it there or add it to a wallet: the card is for members, and **only the salon stamps it**.
- After paying a membership, the thank-you page (`/ordine`) shows **Aggiungi la Darta Card al Wallet**. It sends the design saved on the home page plus the Stripe checkout id; the `darta-wallet` function asks Stripe whether that checkout is a **paid subscription** and refuses anything else (`not_member`). The card is always issued with **0 stamps**, and the name comes from Stripe when none was typed. It opens in **Apple Wallet** (iPhone, iPad, Safari on Mac) or **Google Wallet** (Android); if both wallets are on and the device is unknown, two buttons let them choose. `darta-wallet` needs `STRIPE_READ_KEY` (or `STRIPE_SECRET_KEY`) for this check.
- The pass shows the tier, the stamps (`3 / 10`, plus a strip of ten stamp circles on Apple), the barber, the name, how many haircuts are left until the free one, and a QR code with the card number. On the back: address, opening hours and a note that the card is a demo.
- **Every card starts with 0 stamps, and only the salon adds them**, one per visit, from the staff page `/salone` (see "Stamping in the salon" below). The server ignores any stamp count the shop page sends. After a stamp both passes refresh by themselves: Apple through its web service and a push, Google through its API.

## How it works

```
shop button --POST card--> Edge Function darta-wallet --> table darta_cards (the card, one row)
                                |-- Google: a signed "Save to Google Wallet" link is sent back, the browser opens it
                                '-- Apple: a link to /darta-wallet/apple/<card id> is sent back; opening it builds and signs the .pkpass
```

- Source: `supabase/functions/darta-wallet/`; table `darta_cards` (migration `20261003020000_darta_cards.sql`). Pass pictures: `img/wallet/` (made by `tools/make-wallet-images.py`, the logos with `sips`). The function reads them from the site.
- The Apple signature is built by hand on WebCrypto (no library); it is checked in the tests with OpenSSL, against a throwaway certificate chain. The Google link is a JWT signed with the service account key.
- The name typed on the card is stored in `darta_cards` (personal data, readable only by the service role). Rate limits: 6 cards per visitor per 10 minutes, 300 per hour in total.

```
salon page /salone --POST /darta-wallet/salon (PIN)--> darta_add_stamp(): darta_cards.stamps + 1, row in darta_stamps
                                |-- Apple: empty push to every iPhone that registered the pass --> it asks /apple-ws for the new pass
                                '-- Google: PATCH of the saved loyalty object (points, tier, next reward)
```

- Source: `supabase/functions/darta-wallet/salon.ts` (the stamp), `webservice.ts` (Apple's web service), `google.ts` (`updateObject`). Migration `20261022000000_darta_stamps.sql`: tables `darta_stamps` (the log: card, stamp or redeem, count after, barber, time) and `darta_pass_devices` (iPhones registered for a pass), columns `pass_token` and `updated_at` on `darta_cards`, and the function `darta_add_stamp()`, which is the only thing that changes the count. Only the service role can call it.

## Stamping in the salon

**Why a PIN and not staff logins.** Three barbers share one phone or tablet at the counter. One salon PIN, kept as a Supabase secret, means no accounts, passwords or emails to manage; changing the secret locks every device out at once. The log still records which barber stamped. Guessing is held off by the length (8 characters at least, or the stamping stays off) and the rate limits: 40 requests per device per 10 minutes and 200 per hour for the whole salon, counted before the PIN is checked. With an 8-digit PIN that is years of guessing. If the salon ever wants one login per barber, Supabase Auth can replace the PIN check in `salon.ts` without touching the rest.

Rules the server enforces: one stamp per card per visit (a second scan within 3 hours is refused, so a double tap never counts twice); no 11th stamp; at 10 the barber taps **Taglio omaggio fatto: azzera** after the free haircut and the card goes back to 0.

### Turn it on

1. Apply the migration `supabase/migrations/20261022000000_darta_stamps.sql` (Supabase > SQL editor, or `supabase db push`). Existing cards get their `pass_token` automatically.
2. In Supabase > Edge Functions > Secrets add `DARTA_SALON_PIN`: 8 digits or more, not a date or a phone number. Give it to the barbers in person.
3. Deploy the `darta-wallet` function again (it now carries `salon.ts` and `webservice.ts`) and the site (it now has `salone.html`, `js/salon.js`, `css/salon.css`).
4. On the salon phone open `https://darta-demo.netlify.app/salone`, type the PIN once (the phone remembers it; **Esci da questo telefono** forgets it), and add the page to the home screen.

### Using it

- **Android (Chrome):** tap **Scansiona il QR**, point the camera at the customer's pass. The stamp goes in as soon as the code is read.
- **iPhone:** Safari cannot read QR codes from a web page yet, so type the 8 characters printed under the QR (for example `3F2B8C1E`) and tap **Aggiungi timbro**. A USB or Bluetooth barcode reader also works: it types into the same field.
- The page shows the name and the new count (`4 / 10`), and which wallets were updated.

## Turn on Google Wallet (free, about 30 minutes)

1. Open the **Google Pay & Wallet Console** (pay.google.com/business/console) and create an **Issuer account**. Copy the **Issuer ID** (a long number).
2. In **Google Cloud Console** create a project, enable the **Google Wallet API**, then create a **Service Account** and a **JSON key** for it (IAM & Admin > Service Accounts > Keys > Add key > JSON). Keep the file private.
3. Back in the Wallet Console, **Users** > invite the service account's email as a user of the issuer (so it may create passes).
4. In Supabase (Project `kemfyrbrlsbuberjqzje` > Edge Functions > Secrets) add the secrets below. The same service account also updates the stamps on saved cards (scope `wallet_object.issuer`), so nothing else is needed for live stamps.

   | Secret | Where to find it |
   |---|---|
   | `GOOGLE_WALLET_ISSUER_ID` | the Issuer ID from step 1 |
   | `GOOGLE_WALLET_SA_EMAIL` | `client_email` in the JSON key |
   | `GOOGLE_WALLET_SA_KEY` | `private_key` in the JSON key (the whole value, starting with `-----BEGIN PRIVATE KEY-----`) |
   | `SITE_URL` | already set for payments |

5. Try it on an Android phone. While the issuer is in **demo mode** only Google accounts you list under *Test accounts* in the Wallet Console can add the card; to open it to everyone, request production access in the console.

## Turn on Apple Wallet (needs the Apple Developer Program, 99 USD per year)

1. In **developer.apple.com > Certificates, Identifiers & Profiles > Identifiers**, add a **Pass Type ID**, for example `pass.it.darta.club`. Note your **Team ID** (Membership page, 10 characters).
2. On your Mac, in Terminal, create the key and the signing request (the key stays on your computer and is never sent anywhere):

   ```bash
   openssl req -new -newkey rsa:2048 -nodes -keyout darta-pass.key -out darta-pass.csr -subj "/CN=Darta Barber Studio Pass/O=Punto Due Studio/C=IT"
   ```
3. Open the Pass Type ID in the Apple portal > **Create Certificate** > upload `darta-pass.csr` > download `pass.cer`.
4. Download Apple's **Worldwide Developer Relations - G4** intermediate certificate (`AppleWWDRCAG4.cer`) from apple.com/certificateauthority.
5. Convert both to text:

   ```bash
   openssl x509 -inform DER -in pass.cer -out pass.pem
   openssl x509 -inform DER -in AppleWWDRCAG4.cer -out wwdr.pem
   ```
6. In Supabase add these secrets (open each file in a text editor and paste its whole content):

   | Secret | Value |
   |---|---|
   | `APPLE_PASS_TYPE_ID` | `pass.it.darta.club` (your Pass Type ID) |
   | `APPLE_TEAM_ID` | your 10-character Team ID |
   | `APPLE_PASS_CERT_PEM` | the content of `pass.pem` |
   | `APPLE_PASS_KEY_PEM` | the content of `darta-pass.key` |
   | `APPLE_WWDR_PEM` | the content of `wwdr.pem` |

7. Open the site on an iPhone and tap **Aggiungi al Wallet**. Apple certificates last one year: put the renewal in the calendar. Keep `darta-pass.key` in a password manager and delete the loose copies.

**Live stamps on Apple need nothing more.** Every pass carries `webServiceURL` (`https://kemfyrbrlsbuberjqzje.supabase.co/functions/v1/darta-wallet/apple-ws`) and its own `authenticationToken`, so the iPhone registers itself; after a stamp the function pushes through Apple's push service (`api.push.apple.com`) with the same Pass Type ID certificate. Two things to check on the first real try: the iPhone must have the pass's **Automatic Updates** on (the default), and the Edge runtime must allow a client certificate on `fetch` (`Deno.createHttpClient`). If the push fails, the function logs `apns push failed` and the pass still updates the next time the customer pulls down on it in Wallet.

## What was and was not tested

- Tested here (`node --test tests/*.test.mjs`): card validation, the zip, the manifest hashes, the CMS signature and certificate chain verified by OpenSSL, tampering rejected, the Google JWT verified with its public key and kept under Google's 1800-character limit, the server rules (origin, rate limits, errors) and the button logic.
- Stamps (`tests/salon.test.mjs`): a stamp raises the card by one and is logged; the Apple device is pushed, finds the change through the web service and downloads a pass that shows the new count; Google gets an OAuth token and a PATCH with the new count; no PIN, a wrong PIN, another origin, another method or the Apple web service cannot change a card; new cards always start at 0; doubles within 3 hours, an 11th stamp and early redeems are refused; a failing wallet never undoes a stamp.
- The SQL itself (`tests/stamp-sql.test.mjs`) runs every migration on PGlite, a real Postgres in the test process, and checks `darta_add_stamp()` and the permissions. It is skipped unless PGlite is around: `npm i --prefix /tmp/pglite @electric-sql/pglite`, then run the tests with `PGLITE=/tmp/pglite/node_modules/@electric-sql/pglite/dist/index.js`.
- **Not tested: a real iPhone or Android phone**, because that needs the Apple and Google accounts above. The first real try may show a small thing to adjust (a field label, a picture size, the push); that is normal for passes.
