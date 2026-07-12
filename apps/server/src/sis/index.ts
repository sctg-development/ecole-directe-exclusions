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

/** SIS provider factory, selected by the `SIS_PROVIDER` environment variable. */

import type { Env } from "../env.js";
import type { SisProvider } from "./provider.js";
import { MockSisProvider } from "./mock.js";
import { AplimSisProvider } from "./aplim.js";

export type { SisProvider } from "./provider.js";
export { MockSisProvider } from "./mock.js";
export { AplimSisProvider } from "./aplim.js";

export function createSisProvider(env: Env): SisProvider {
  switch (env.SIS_PROVIDER) {
    case "mock":
      return new MockSisProvider(env.SCHOOL_ID);
    case "aplim":
      return new AplimSisProvider();
    default:
      throw new Error(`Unknown SIS_PROVIDER "${env.SIS_PROVIDER}" (expected "mock" or "aplim")`);
  }
}
