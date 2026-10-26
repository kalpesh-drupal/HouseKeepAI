# HouseKeepAI — App Store & Play Store

Production web app: https://house-keep-ai.vercel.app  
Expo project: https://expo.dev/accounts/kpatel26/projects/housekeep-ai  
Bundle / package ID: `com.housekeepai.app`

## 1) Create the store apps (one-time)

### Google Play Console
1. Open https://play.google.com/console
2. Create app **HouseKeepAI**
3. Package name must be: `com.housekeepai.app`
4. Complete store listing, content rating, privacy policy URL
5. Create a **service account** for Play Developer API and download the JSON key  
   (Play Console → Users and permissions → Invite new users / API access)

### Apple App Store Connect
1. Open https://appstoreconnect.apple.com
2. Register App ID / bundle ID: `com.housekeepai.app` (Certificates, Identifiers & Profiles if needed)
3. Create a new app with that bundle ID
4. Note your **Team ID** and **App Store Connect App ID** (numeric, under App Information)

## 2) Build

Android is already building on EAS. For **iOS**, run this on your Mac (interactive — signs in with Apple):

```bash
cd mobile
npx eas build --platform ios --profile production
```

When prompted, allow EAS to manage credentials (distribution certificate + provisioning profile).

Rebuild Android if needed:

```bash
npx eas build --platform android --profile production
```

## 3) Submit

### Android → Play (internal/draft track)

```bash
cd mobile
npx eas submit --platform android --profile production --latest \
  --service-account-path /ABS/PATH/to/play-service-account.json
```

### iOS → App Store Connect

```bash
cd mobile
npx eas submit --platform ios --profile production --latest
```

Or with an App Store Connect API key (non-interactive):

```bash
npx eas submit --platform ios --profile production --latest \
  --asc-api-key-path /ABS/PATH/AuthKey_XXXXX.p8 \
  --asc-api-key-id XXXXX \
  --asc-api-issuer-id YOUR-ISSUER-UUID
```

## 4) After upload
- **Play:** promote the internal/draft release through testing → production
- **Apple:** complete listing, attach build in TestFlight, submit for review

## Listing checklist
- [ ] Privacy policy URL (HTTPS)
- [ ] Support URL / email
- [ ] Screenshots
- [ ] Short + full description
- [ ] Age / content rating
- [ ] Data safety / privacy labels
