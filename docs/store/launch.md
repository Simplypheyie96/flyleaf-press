# Bookprint — store launch

Flyleaf Press ships to the App Store and Google Play as **Bookprint: Book Review Cards**.
The app is a Capacitor shell around the same web build (`app/`), bundle id `com.feyidesigns.press`.
Product ids and prices below are already in the code (`app/src/unlock.ts`) and in the local
StoreKit file (`app/ios/App/App/Press.storekit`); `npm run check:unlock` keeps all three in step.

## Build

| | Command (from `app/`) | Output |
|---|---|---|
| iOS | `npm run ios:open` → Xcode → Product › Archive | upload from Organizer |
| Android | `npm run android:bundle` | `android/app/build/outputs/bundle/release/app-release.aab` |
| Android debug | `npm run android && cd android && ./gradlew assembleDebug` | `app-debug.apk` |

Android needs a JDK 21 and the SDK path:
`JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`, and
`android/local.properties` holding `sdk.dir=/opt/homebrew/share/android-commandlinetools` (gitignored).
Release signing reads `android/keystore.properties` (gitignored): `storeFile`, `storePassword`,
`keyAlias`, `keyPassword`. Create the upload keystore yourself and keep a copy off this laptop;
losing it means a new Play listing. Use Play App Signing.

Version: bump `versionCode`/`versionName` in `android/app/build.gradle` and
`CURRENT_PROJECT_VERSION`/`MARKETING_VERSION` in Xcode for every upload.

## Products (non-consumable / one-time)

Both unlock exactly the same things. Supporter exists for people who want to pay more, and the
app says so beside the button.

| Reference name | Product id | Price | Type |
|---|---|---|---|
| Unlock | `com.feyidesigns.press.unlock` | $3.99 (tier) | Non-consumable / one-time in-app product |
| Supporter | `com.feyidesigns.press.supporter` | $7.99 (tier) | Non-consumable / one-time in-app product |

Display name / description for both stores:
- **Unlock** — "Every card style, monthly and yearly collages, PDF and image plates. Pay once, keep it."
- **Supporter** — "The same unlock, at a price that gives a little more toward the app."

Free tier: write and share reviews in two card styles (Archive, Masthead).
The unlock adds the other 18 styles, month/year/Hopefuls collages, PDF export and image plates.

Ownership is checked on the device (StoreKit 2 verified transactions; Play `purchaseState`), cached,
and re-checked at every launch so a refund re-locks. **Restore purchases** is in the unlock sheet
(Settings › Unlock everything, and every locked share). Android purchases are acknowledged on sight
(Play refunds unacknowledged ones after three days).

Later: when the app signs in to the Flyleaf account (`api.flyleaf.cc`), send the receipt there so one
purchase opens Press on every platform.

### App Store Connect
1. Agreements, Tax and Banking: Paid Apps agreement active (needs the organisation account → D-U-N-S).
2. App › In-App Purchases › create both as **Non-Consumable**, ids above, price, a review screenshot
   (the unlock sheet) and review notes: "Settings › Unlock everything. Restore is in the same sheet."
3. Add both to the first version before submitting it for review.
4. Sandbox: test with a Sandbox Apple Account; locally, Xcode's scheme already points at `Press.storekit`.

### Play Console
1. Payments profile set up; then Monetize › Products › In-app products › create both, ids above.
2. Products can only be created after an AAB with the Billing permission is uploaded to any track —
   upload the closed-test build first.
3. Add the testers' Google accounts to License testing so they buy with test cards.

## Listing

| Field | Text |
|---|---|
| Name | Bookprint: Book Review Cards |
| Subtitle (iOS) / short description (Play) | Reading wrap-ups & collages |
| Keywords (iOS, 100 chars) | `book review,booktok,bookstagram,wrap up,reading recap,collage,monthly,yearly,card,quote,tracker` |
| Category | Books (iOS primary) · Books & Reference (Play) |
| Age rating | 4+ / Everyone — no user-to-user content, no ads |

**Before submitting: check "Bookprint" for trademarks** (USPTO, EUIPO, and a search of both stores).
Keywords name no competitor apps; keep it that way. "booktok" and "bookstagram" are community terms,
not marks, but re-check them in the same pass.

Full description (Play, up to 4000 chars):

> Write a long review of every book you finish and print it as a card worth sharing. Pick a card
> style, add a cover and your favourite line, and send it to your story, your group chat, or your
> camera roll. At the end of each month, the books you read become one collage — and at the end of
> the year, a yearly wrap-up.
>
> Free: write unlimited reviews and share them in two card styles.
> Unlock once: every card style, monthly and yearly collages, PDF export and image plates.
>
> Your reviews stay on your phone. No account, no ads, no tracking.

## Screenshots

Order matters; the first one sells the app.
1. **A review card next to a monthly collage** (the two things people share).
2. Writing a review (the editor with the font picker).
3. The style picker sheet — several card styles.
4. A yearly wrap-up.
5. The shelf.

Sizes: iPhone 6.9" (1320×2868) is required; Play wants at least 2 phone shots (1080×1920 or larger)
and a 1024×500 feature graphic. Use real-looking reviews, not lorem ipsum.

## Privacy

The store app collects nothing: no analytics (Cloudflare Web Analytics is web-only), no sign-in,
no Drive sync (hidden in the store apps), no server. Reviews and photos live in on-device storage.
Purchases go through Apple/Google, who handle the payment data.

- **App Store privacy label:** Data Not Collected.
- **Play Data safety:** no data collected, no data shared. Encryption in transit: not applicable
  (nothing is transmitted). Users can delete data: yes (Settings › delete, or uninstall).
- Privacy policy URL is required by both stores — host the existing in-app privacy copy on the site
  (e.g. `press.flyleaf.cc/privacy`).

## Closed test (Play, personal account)

New personal developer accounts must run a closed test with **12 testers opted in for 14 days in a
row** before production access can be requested.
1. Create a Google Group (or an email list) with at least 12 testers; ask for 14+ to cover drop-outs.
2. Testing › Closed testing › create a track, upload the AAB, add the list, share the opt-in link.
3. Keep every tester installed for the full 14 days; push at least one update during the test.
4. Then apply for production access (the form asks what testers found and what changed).

## Apple

The Apple developer account waits on the D-U-N-S number (organisation enrolment). Until then:
everything above is ready; TestFlight internal testing starts the day the account is active.
