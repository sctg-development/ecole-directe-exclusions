/*
MIT License
Copyright (c) 2026 Ronan Le Meillat - SCTG Development
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor wraps the Vite production build (`dist/`) into the Android and iOS shells.
 * Native projects are generated per docs/MOBILE.md (`npx cap add android|ios`), then kept in
 * sync with `npm run cap:sync -w @exclusions/client` after every web build.
 */
// iOS bundle id (Apple allows hyphens; already provisioned). Android's real applicationId is
// "org.eu.sctgdevelopment.exclusions" (Java package names can't contain hyphens) — set directly
// in android/app/build.gradle, not derived from this shared config.
const config: CapacitorConfig = {
  appId: "org.eu.sctg-development.exclusions",
  appName: "Exclusions",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
};

export default config;
