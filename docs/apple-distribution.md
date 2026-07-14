# Apple Developer Distribution Setup Guide

> **Complete Step-by-Step Tutorial for iOS App Signing, Certificates, and Notarization for CI/CD**

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Apple Developer Account Setup](#apple-developer-account-setup)
3. [App Identifier (Bundle ID) Configuration](#app-identifier-bundle-id-configuration)
4. [Certificate Creation](#certificate-creation)
5. [APNs Certificate for Push Notifications](#apns-certificate-for-push-notifications)
6. [Provisioning Profiles](#provisioning-profiles)
7. [App Store Connect Configuration](#app-store-connect-configuration)
8. [Exporting and Preparing Files for CI/CD](#exporting-and-preparing-files-for-cicd)
9. [GitHub Secrets Setup](#github-secrets-setup)
10. [ExportOptions.plist Configuration](#exportoptionsplist-configuration)
11. [Notarization Process](#notarization-process)
12. [Troubleshooting Common Issues](#troubleshooting-common-issues)
13. [Best Practices](#best-practices)
14. [Summary Checklist](#summary-checklist)

---

## 🔹 1. Prerequisites

### Required Tools
- **Mac Computer** (macOS Ventura or later recommended)
- **Xcode** (Latest stable version from Mac App Store)
- **Apple Developer Account** ($99/year for standard, **FREE for non-profit organizations**)
- **App Store Connect Access** (included with Apple Developer Program)

### Required Information
- **Bundle Identifier**: `org.eu.sctg-development.exclusions`
- **App Name**: Exclusions
- **Team ID**: `6G4W4D2F29`

### Verify Your Setup

#### Check Xcode Installation
```bash
# Check Xcode version and path
xcode-select --version
xcodebuild -version

# Verify Xcode command line tools
xcode-select --print-path
```

#### Check Apple Developer Account Status
```bash
# Method 1: Check certificates in Keychain (recommended)
security find-identity -p codesigning -v

# Method 2: Check provisioning profiles
ls ~/Library/MobileDevice/Provisioning\ Profiles/ 2>/dev/null || echo "No provisioning profiles found"

# Method 3: Verify Xcode can access your team
# Open Xcode -> Preferences -> Accounts -> View Details -> Download All Profiles

# Method 4: Check with fastlane (if installed)
fastlane pilot list 2>/dev/null || echo "fastlane not installed"

# Note: altool is deprecated by Apple and no longer works reliably
# Use notarytool or App Store Connect API instead
```

---

## 🔹 2. Apple Developer Account Setup

### Step 1: Enroll in the Apple Developer Program
1. Go to [Apple Developer Program](https://developer.apple.com/programs/)
2. Click **Enroll** (or **Join Now**)
3. Sign in with your Apple ID
4. **For Non-Profit Organizations**:
   - Select **Organization** enrollment
   - You will need your **D-U-N-S number** (free for non-profits)

---

## 🔹 3. App Identifier (Bundle ID) Configuration

### Step 1: Register Your App ID
1. Go to [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list)
2. Click **+** to add a new identifier
3. Select **App IDs** and click **Continue**
4. Fill in the details:
   - **Description**: Exclusions
   - **Bundle ID**: `org.eu.sctg-development.exclusions` (Explicit)
   - **Capabilities**: Enable required features:
     - ✅ **Push Notifications** (required for `@capacitor/push-notifications`)
     - Sign in with Apple (if needed)
     - Background Modes (if needed)
5. Click **Continue** and then **Register**

### Step 2: Verify App ID
1. Your App ID should appear in the list
2. Click on it to view details
3. Note the **Identifier** (`org.eu.sctg-development.exclusions`) and **Team ID** (`6G4W4D2F29`)

---

## 🔹 4. Certificate Creation

### Development Certificate (for debugging)

#### Step 1: Create Certificate Signing Request (CSR)
1. Open **Keychain Access** on your Mac
2. Go to **Keychain Access** → **Certificate Assistant** → **Request a Certificate from a Certificate Authority...**
3. Fill in:
   - **User Email Address**: Your Apple Developer email
   - **Common Name**: Your name or organization name
   - **Request is**: **Saved to disk**
   - **Key Size**: 2048 bits
   - **Algorithm**: RSA
4. Save the `.certSigningRequest` file to your desktop

#### Step 2: Create Development Certificate
1. Go to [Certificates](https://developer.apple.com/account/resources/certificates/list)
2. Click **+** → Select **Apple Development**
3. Upload the `.certSigningRequest` file
4. Download the certificate (`apple_development.cer`)
5. Double-click to install in Keychain

### Distribution Certificate (for release)
1. Go to [Certificates](https://developer.apple.com/account/resources/certificates/list)
2. Click **+** → Select **Apple Distribution**
3. Upload the `.certSigningRequest` file (or create a new one)
4. Download the certificate (`apple_distribution.cer`)
5. Double-click to install in Keychain

> ⚠️ **IMPORTANT**: For CI/CD, export this as `.p12` file (see [Exporting and Preparing Files for CI/CD](#exporting-and-preparing-files-for-cicd) section).

---

## 🔹 5. APNs Certificate for Push Notifications

Since your app uses `@capacitor/push-notifications`, you **must** create an **APNs Certificate** for both **Sandbox** and **Production** environments.

### Step 1: Create APNs Certificate (Production)
1. Go to [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/certificates/list)
2. Click **+** → Select **Apple Push Notification service SSL (Sandbox & Production)**
3. Select your **App ID** (`org.eu.sctg-development.exclusions`)
4. Click **Continue** and **Download** the certificate (`aps_production.cer`)
5. Double-click to install in Keychain

### Step 2: Export APNs Certificate as .p12
1. Open **Keychain Access**
2. Go to **My Certificates** category
3. Find your **Apple Push Notification** certificate
4. **Right-click** → **Export**
5. Save as **Personal Information Exchange (.p12)** format
6. Name it: `apns_certificate.p12`
7. **Set a strong password** (you will need this for GitHub Secrets)
8. Click **Save**

> ⚠️ **IMPORTANT**: Remember this password! You will need it for the `APNS_CERTIFICATE_PASSWORD` GitHub Secret.

---

## 🔹 6. Provisioning Profiles

### Development Provisioning Profile
Used for **debugging on physical devices** during development.

1. Go to [Profiles](https://developer.apple.com/account/resources/profiles/list)
2. Click **+** → Select **iOS App Development**
3. Select your **App ID** (`org.eu.sctg-development.exclusions`)
4. Select your **Development Certificate**
5. Select the **devices** you want to include (or select all)
6. Give it a name (e.g., "Exclusions Development Profile")
7. Click **Continue** and then **Download**
8. Save as `Exclusions_Development.mobileprovision`

### Distribution Provisioning Profile
Used for **releasing your app** to the App Store or for ad-hoc distribution.

#### For App Store Distribution:
1. Go to [Profiles](https://developer.apple.com/account/resources/profiles/list)
2. Click **+** → Select **App Store**
3. Select your **App ID** (`org.eu.sctg-development.exclusions`)
4. Select your **Distribution Certificate**
5. Give it a name (e.g., "Exclusions App Store Profile")
6. Click **Continue** and then **Download**
7. Save as `Exclusions_AppStore.mobileprovision`

> 💡 **Tip**: For CI/CD, use the **App Store** provisioning profile for TestFlight and App Store submissions.

---

## 🔹 7. App Store Connect Configuration

### Create an App in App Store Connect
1. Go to [App Store Connect](https://appstoreconnect.apple.com/)
2. Click **My Apps** in the top menu
3. Click **+** → **New App**
4. Fill in the details:
   - **Name**: Exclusions
   - **Primary Language**: French (or your preferred language)
   - **Bundle ID**: Select `org.eu.sctg-development.exclusions` from the dropdown
   - **SKU**: A unique identifier for your app (e.g., `EXCLUSIONS-001`)
   - **User Access**: Full Access or Custom (recommended: Full Access for admin)
5. Click **Create**

### Generate API Keys for Notarization
Apple requires **notarization** for all apps. For CI/CD, use API keys instead of Apple ID passwords.

1. Go to [App Store Connect](https://appstoreconnect.apple.com/)
2. Click **Users and Access** (top menu)
3. Click **Keys** tab
4. Click **+** to add a new API key
5. Fill in the details:
   - **Name**: `GitHub Actions Notarization Key`
   - **Role**: **App Manager** (minimum required for notarization)
   - **Access**: Select **All Apps** or choose specific apps
6. Click **Generate**
7. **Download the `.p8` file** immediately (you **cannot** download it again!)
8. **Note the following information**:
   - **Key ID**: Displayed after generation (e.g., `ABC123DEFG`)
   - **Issuer ID**: Your App Store Connect Issuer ID (e.g., `12345678-9abc-def0-1234-56789abcdef0`)

> ⚠️ **IMPORTANT**: Store the `.p8` file securely. You cannot download it again from Apple.

---

## 🔹 8. Exporting and Preparing Files for CI/CD

For GitHub Actions (or any CI/CD system), you need to prepare your certificates and profiles in a specific format.

### Export Distribution Certificate as .p12
1. Open **Keychain Access** on your Mac
2. Go to **My Certificates** category
3. Find your **Apple Distribution** certificate
4. **Right-click** on it → **Export**
5. Save as **Personal Information Exchange (.p12)** format
6. Name it: `distribution_certificate.p12`
7. **Set a strong password** (you will need this for GitHub Secrets)
8. Click **Save**

### Encode Files for GitHub Secrets
GitHub Secrets **cannot** store binary files directly. You need to **Base64 encode** them.

#### On macOS/Linux:
```bash
# Navigate to the directory containing your files
cd .github/workflows/secrets

# Encode the distribution .p12 certificate
base64 -i distribution_certificate.p12 -o distribution_certificate_base64.txt

# Encode the APNs .p12 certificate
base64 -i apns_certificate.p12 -o apns_certificate_base64.txt

# Encode the development .p12 certificate
base64 -i development_certificate.p12 -o development_certificate_base64.txt

# Encode the provisioning profile
base64 -i Exclusions_AppStore.mobileprovision -o Exclusions_AppStore_base64.txt

# Encode the development provisioning profile
base64 -i Exclusions_Development.mobileprovision -o Exclusions_Development_base64.txt

# Encode the App Store Connect API key
base64 -i AuthKey_*.p8 -o api_key_base64.txt

# Copy to clipboard for easy pasting into GitHub Secrets
base64 -i distribution_certificate.p12 | pbcopy
base64 -i development_certificate.p12 | pbcopy
base64 -i apns_certificate.p12 | pbcopy
base64 -i Exclusions_AppStore.mobileprovision | pbcopy
base64 -i Exclusions_Development.mobileprovision | pbcopy
base64 -i AuthKey_*.p8 | pbcopy
```

#### On Windows (PowerShell):
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("distribution_certificate.p12")) | Out-File -FilePath distribution_certificate_base64.txt
[Convert]::ToBase64String([IO.File]::ReadAllBytes("apns_certificate.p12")) | Out-File -FilePath apns_certificate_base64.txt
[Convert]::ToBase64String([IO.File]::ReadAllBytes("development_certificate.p12")) | Out-File -FilePath development_certificate_base64.txt
[Convert]::ToBase64String([IO.File]::ReadAllBytes("Exclusions_AppStore.mobileprovision")) | Out-File -FilePath Exclusions_AppStore_base64.txt
[Convert]::ToBase64String([IO.File]::ReadAllBytes("Exclusions_Development.mobileprovision")) | Out-File -FilePath Exclusions_Development_base64.txt
[Convert]::ToBase64String([IO.File]::ReadAllBytes("AuthKey_*.p8")) | Out-File -FilePath api_key_base64.txt
```

---

## 🔹 9. GitHub Secrets Setup

Now that you have all the necessary files, set them up as GitHub Secrets.

### Step 1: Navigate to GitHub Secrets
1. Go to your repository on [GitHub](https://github.com/)
2. Click **Settings** (tab at the top of your repository)
3. In the left sidebar, click **Secrets and variables** → **Actions**
4. Click **New repository secret** (green button)

### Step 2: Add Required Secrets
Add the following **12 secrets** one by one:

| Secret Name | Description | How to Get the Value |
|-------------|-------------|----------------------|
| `APPLE_CERTIFICATE` | Base64-encoded distribution certificate | Contents of `distribution_certificate_base64.txt` |
| `APPLE_CERTIFICATE_PASSWORD` | Password for the .p12 certificate | The password you set when exporting the .p12 file |
| `APPLE_DEVELOPMENT_CERTIFICATE` | Base64-encoded development certificate | Contents of `development_certificate_base64.txt` |
| `APPLE_DEVELOPMENT_CERTIFICATE_PASSWORD` | Password for the development .p12 certificate | The password you set when exporting the development .p12 file |
| `APPLE_PROVISIONING_PROFILE` | Base64-encoded provisioning profile | Contents of `Exclusions_AppStore_base64.txt` |
| `APPLE_DEVELOPMENT_PROVISIONING_PROFILE` | Base64-encoded development provisioning profile | Contents of `Exclusions_Development_base64.txt` |
| `APNS_CERTIFICATE` | Base64-encoded APNs certificate | Contents of `apns_certificate_base64.txt` |
| `APNS_CERTIFICATE_PASSWORD` | Password for the APNs .p12 certificate | The password you set when exporting the APNs .p12 file |
| `APPLE_ID` | Your Apple Developer Apple ID | Your email |
| `APPLE_ID_PASSWORD` | App-specific password | Generated from [Apple ID Account Page](https://appleid.apple.com/) |
| `APP_STORE_CONNECT_API_KEY` | Base64-encoded .p8 API key | Contents of encoded `.p8` file |
| `APP_STORE_CONNECT_API_KEY_ID` | API Key ID | From App Store Connect |
| `APP_STORE_CONNECT_API_KEY_ISSUER_ID` | API Key Issuer ID | From App Store Connect |


### Step 3: Create App-Specific Password (Recommended)
Instead of using your main Apple ID password, create an **app-specific password** for better security:

1. Go to [Apple ID Account Page](https://appleid.apple.com/)
2. Sign in with your Apple ID
3. Scroll down to the **Security** section
4. Under **App-Specific Passwords**, click **Generate Password...**
5. Give it a name: `GitHub Actions`
6. Copy the generated password (e.g., `xabc-defg-hijk-lmnop`)
7. Use this as the value for `APPLE_ID_PASSWORD` in GitHub Secrets

> ✅ **Why use app-specific passwords?**
> - More secure than using your main Apple ID password
> - Can be revoked independently without affecting your main account
> - Limited to specific services

---

## 🔹 10. ExportOptions.plist Configuration

The `ExportOptions.plist` file tells Xcode **how** to export your app. It is **required** for the `xcodebuild -exportArchive` command.

### Where to Place the File
Create this file in your iOS project directory:
```
apps/client/ios/App/ExportOptions.plist
```

### For App Store Distribution (Recommended)
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>app-store</string>
    <key>teamID</key>
    <string>6G4W4D2F29</string>
    <key>uploadBitcode</key>
    <false/>
    <key>compileBitcode</key>
    <false/>
    <key>uploadSymbols</key>
    <true/>
    <key>signingStyle</key>
    <string>automatic</string>
</dict>
</plist>
```

### For Ad-Hoc Distribution
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>ad-hoc</string>
    <key>teamID</key>
    <string>6G4W4D2F29</string>
    <key>uploadBitcode</key>
    <false/>
    <key>compileBitcode</key>
    <false/>
    <key>uploadSymbols</key>
    <true/>
</dict>
</plist>
```

---

## 🔹 11. Notarization Process

Apple **requires** notarization for all iOS apps distributed through the App Store or TestFlight.

### Why Notarization is Required
- **Security**: Ensures your app has not been tampered with
- **Trust**: Builds user trust by verifying app authenticity
- **Requirement**: Mandatory for all apps

### Using `notarytool` (Recommended, macOS 10.15+)

#### With App Store Connect API Key (Recommended for CI/CD)
```bash
xcrun notarytool submit \
  --key "${APP_STORE_CONNECT_API_KEY_PATH}" \
  --key-id "${APP_STORE_CONNECT_API_KEY_ID}" \
  --issuer "${APP_STORE_CONNECT_API_KEY_ISSUER_ID}" \
  --wait \
  --timeout 300 \
  build/App.ipa
```

#### With Apple ID (Alternative)
```bash
xcrun notarytool submit \
  --apple-id "${APPLE_ID}" \
  --password "${APPLE_ID_PASSWORD}" \
  --team-id "6G4W4D2F29" \
  --wait \
  --timeout 300 \
  build/App.ipa
```

> ⚠️ **Note**: `altool` is deprecated by Apple. Use `notarytool` instead.

---

## 🔹 12. Troubleshooting Common Issues

### Code signing failed
**Solutions:**
1. Verify certificate: `security find-identity -p keys -v`
2. Check provisioning profile: `ls ~/Library/MobileDevice/Provisioning\ Profiles/`
3. Verify Bundle ID matches App ID in Apple Developer Portal
4. Check Team ID in Xcode → Target → Signing & Capabilities

### Provisioning profile not found
**Solution in GitHub Actions:**
```yaml
- name: Install Provisioning Profile
  run: |
    mkdir -p ~/Library/MobileDevice/Provisioning\ Profiles/
    echo "${{ secrets.APPLE_PROVISIONING_PROFILE }}" | base64 --decode > ~/Library/MobileDevice/Provisioning\ Profiles/App_Profile.mobileprovision
```

### Notarization failed
**Solutions:**
1. Check logs with notarytool
2. Verify Bundle ID and entitlements
3. Check certificate and profile validity
4. Use verbose mode: `xcrun notarytool submit --verbose ...`

### xcodebuild archive failed
**Solutions:**
1. Use workspace instead of project: `xcodebuild -workspace App.xcworkspace ...`
2. Clean build folder: `rm -rf build/ ~/Library/Developer/Xcode/DerivedData/`
3. Verify scheme exists: `xcodebuild -list -workspace App.xcworkspace`

### Push Notifications not working
**Solutions:**
1. Verify APNs certificate is installed in Keychain
2. Check Bundle ID matches in Apple Developer Portal
3. Ensure Push Notifications capability is enabled in App ID
4. Verify provisioning profile includes Push Notifications

---

## 🔹 13. Best Practices

### Certificate Management
✅ Use separate certificates for dev/distribution
✅ Store `.p12` files securely
✅ Use app-specific passwords
✅ Rotate certificates before expiration
❌ Do not commit `.p12` or `.mobileprovision` to Git
❌ Do not use main Apple ID password in CI/CD

### Provisioning Profile Management
✅ Use App Store profile for TestFlight/App Store
✅ Include all required capabilities (e.g., Push Notifications)
❌ Do not use Development profile for release builds

### CI/CD Security
✅ Use GitHub Secrets
✅ Use App Store Connect API keys
✅ Rotate keys periodically
❌ Do not hardcode secrets in workflow files

### Notarization
✅ Always notarize your apps
✅ Wait for completion before distributing
❌ Do not skip notarization

### Push Notifications
✅ Enable Push Notifications in App ID
✅ Create APNs certificates for both Sandbox and Production
✅ Include APNs certificate in CI/CD workflow
✅ Test notifications in development before release

---

## 🎯 14. Summary Checklist

### Apple Developer Setup
- [ ] Enrolled in Apple Developer Program
- [ ] Verified non-profit status (if applicable)
- [ ] Noted Team ID: `6G4W4D2F29`

### App Configuration
- [ ] Registered App ID: `org.eu.sctg-development.exclusions`
- [ ] Enabled **Push Notifications** capability in App ID
- [ ] Created app in App Store Connect

### Certificates
- [ ] Created Development Certificate
- [ ] Created Distribution Certificate
- [ ] Created **APNs Certificate** (Production)
- [ ] Installed certificates in Keychain
- [ ] Exported Distribution Certificate as `.p12`
- [ ] Exported APNs Certificate as `.p12`

### Provisioning Profiles
- [ ] Created Development Provisioning Profile
- [ ] Created Distribution Provisioning Profile (App Store)
- [ ] Downloaded provisioning profiles

### API Keys
- [ ] Generated App Store Connect API Key
- [ ] Downloaded `.p8` file
- [ ] Noted Key ID and Issuer ID

### GitHub Secrets
- [ ] Added `APPLE_CERTIFICATE` (Base64-encoded .p12)
- [ ] Added `APPLE_CERTIFICATE_PASSWORD`
- [ ] Added `APPLE_PROVISIONING_PROFILE` (Base64-encoded)
- [ ] Added `APPLE_ID`
- [ ] Added `APPLE_ID_PASSWORD` (app-specific)
- [ ] Added `APP_STORE_CONNECT_API_KEY` (Base64-encoded .p8)
- [ ] Added `APP_STORE_CONNECT_API_KEY_ID`
- [ ] Added `APP_STORE_CONNECT_API_KEY_ISSUER_ID`
- [ ] Added `APNS_CERTIFICATE` (Base64-encoded .p12)
- [ ] Added `APNS_CERTIFICATE_PASSWORD`

### Project Files
- [ ] Created `ExportOptions.plist` in `apps/client/ios/App/`
- [ ] Verified `Info.plist` Bundle ID: `org.eu.sctg-development.exclusions`
- [ ] Verified `capacitor.config.json` and `config.xml` use correct Bundle ID

### CI/CD Configuration
- [ ] Updated GitHub Actions workflow (`build-mobile.yml`)
- [ ] Added certificate installation step
- [ ] Added provisioning profile installation step
- [ ] Added APNs certificate installation step
- [ ] Added notarization step with `notarytool`

---

*Last updated: July 2026*
*Author: Cline (AI Assistant)*
*Project: ecole-directe-exclusions*
*Bundle ID: `org.eu.sctg-development.exclusions`*
*Team ID: `6G4W4D2F29`*
