# Loyalty card in Apple Wallet and Google Wallet

The "Aggiungi al Wallet" button on the Darta Club card is built and switched off until a wallet account exists. Until then it shows the demo message, so the live site never breaks.

## What the customer gets

- They design the card on the site (name, finish, stamp, barber), tap **Aggiungi al Wallet**, and the card opens in **Apple Wallet** (iPhone, iPad, Safari on Mac) or **Google Wallet** (Android). If both wallets are on and the device is unknown, two buttons let them choose.
- The pass shows the tier, the stamps (`3 / 10`, plus a strip of ten stamp circles on Apple), the barber, the name, how many haircuts are left until the free one, and a QR code with the card number. On the back: address, opening hours and a note that the card is a demo.
- **It is a snapshot.** The stamps on the pass are the ones on the card when the customer tapped the button; they do not change when the customer is stamped in the salon, because the salon has no way to stamp yet. See "Next step" below.

## How it works

```
shop button --POST card--> Edge Function darta-wallet --> table darta_cards (the card, one row)
                                |-- Google: a signed "Save to Google Wallet" link is sent back, the browser opens it
                                '-- Apple: a link to /darta-wallet/apple/<card id> is sent back; opening it builds and signs the .pkpass
```

- Source: `supabase/functions/darta-wallet/`; table `darta_cards` (migration `20261003020000_darta_cards.sql`). Pass pictures: `img/wallet/` (made by `tools/make-wallet-images.py`, the logos with `sips`). The function reads them from the site.
- The Apple signature is built by hand on WebCrypto (no library); it is checked in the tests with OpenSSL, against a throwaway certificate chain. The Google link is a JWT signed with the service account key.
- The name typed on the card is stored in `darta_cards` (personal data, readable only by the service role). Rate limits: 6 cards per visitor per 10 minutes, 300 per hour in total.

## Turn on Google Wallet (free, about 30 minutes)

1. Open the **Google Pay & Wallet Console** (pay.google.com/business/console) and create an **Issuer account**. Copy the **Issuer ID** (a long number).
2. In **Google Cloud Console** create a project, enable the **Google Wallet API**, then create a **Service Account** and a **JSON key** for it (IAM & Admin > Service Accounts > Keys > Add key > JSON). Keep the file private.
3. Back in the Wallet Console, **Users** > invite the service account's email as a user of the issuer (so it may create passes).
4. In Supabase (Project `kemfyrbrlsbuberjqzje` > Edge Functions > Secrets) add:

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

## What was and was not tested

- Tested here (112 automated tests): card validation, the zip, the manifest hashes, the CMS signature and certificate chain verified by OpenSSL, tampering rejected, the Google JWT verified with its public key and kept under Google's 1800-character limit, the server rules (origin, rate limits, errors) and the button logic.
- **Not tested: a real iPhone or Android phone**, because that needs the Apple and Google accounts above. The first real try may show a small thing to adjust (a field label, a picture size); that is normal for passes.

## Next step: stamps that really count

To make the stamps live, the salon needs a way to stamp a card (a small page that scans the QR code and adds a stamp, protected by a PIN), a `stamps` update on the `darta_cards` row, and then the pass has to refresh itself: Apple through a small web service plus push notifications, Google by updating the card object through its API. That is a separate piece of work (about 2 to 3 days).
