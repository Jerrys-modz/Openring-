# TestFlight (internal testing)

Internal testing needs no Beta App Review and builds appear within minutes of processing.
Testers must be people on your App Store Connect team (up to 100, Users and Access).
Release builds are standalone: the JS is bundled, so no Metro or dev server is needed.

## One-time setup
1. **Pick the bundle ID.** `ios.bundleIdentifier` in `app.config.ts` (default
   `com.jerrysmodz.openring`) must be unique. Change it before the first build; EAS
   registers it as an App ID on your developer team.
2. **Create the app record** in App Store Connect → Apps → + → New App:
   platform iOS, any name that is not taken, the bundle ID above (it appears once EAS has
   registered it; run step 3 first if the dropdown is empty), a SKU (e.g. `openring`),
   user access Full. Copy the numeric *Apple ID* from App Information (the ASC app id).
3. **Log in to EAS and let it manage credentials**
   ```bash
   npm install && npm i -g eas-cli
   eas login
   eas init                           # links the project, adds extra.eas.projectId
   eas credentials --platform ios     # or just accept the prompts during the first build
   ```
   Sign in with your Apple ID when prompted; EAS creates the distribution certificate and
   App Store provisioning profile. (Optional, for non-interactive submits: App Store
   Connect API key → `eas credentials` → App Store Connect API Key, then run `eas submit`
   with it. Put `"ascAppId": "<id>"` under `submit.production.ios` in `eas.json`.)

## Each release
```bash
npm run build:ios      # eas build, production profile, buildNumber auto-incremented
npm run submit:ios     # uploads the latest build to App Store Connect
# or in one step:
eas build --platform ios --profile production --auto-submit
```
Wait for the build to finish processing (App Store Connect → TestFlight → iOS Builds). If
it shows "Missing Compliance", the app already declares `ITSAppUsesNonExemptEncryption:
false`, so it should pass automatically.

## Add testers
App Store Connect → TestFlight → Internal Testing → + → create a group (e.g. "Me") →
tick *Enable automatic distribution* → add yourself. Install the TestFlight app on the
iPhone, sign in with the same Apple ID, and install OpenRing.

## Notes
- Builds expire after 90 days; just upload a new one.
- Internal testing requires no privacy policy URL or beta app description. External
  testers and public release do, and for HealthKit apps they need a privacy policy too.
- HealthKit is in the app: the config plugin adds the `com.apple.developer.healthkit` entitlement and
  both `NSHealth*UsageDescription` strings. The App ID needs the HealthKit capability and the
  provisioning profile has to be regenerated to include it (EAS does both when it can sign in to
  Apple; run `eas credentials` interactively if a non-interactive build cannot).
- Bluetooth permission text and `bluetooth-central` background mode are already set.
