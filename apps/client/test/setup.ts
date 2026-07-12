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

/**
 * Vitest setup (happy-dom, globals: false): manual Testing Library cleanup and small
 * browser-API shims that happy-dom may not provide.
 */

import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// happy-dom ships matchMedia, but guard anyway (some page code checks color scheme).
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  const matchMediaStub = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
  window.matchMedia = matchMediaStub as typeof window.matchMedia;
}

// happy-dom does not implement window.prompt; provide a stub tests can spy on.
if (typeof window !== "undefined" && typeof window.prompt !== "function") {
  window.prompt = () => null;
}

// With `globals: false`, Testing Library cannot auto-register its cleanup hook.
afterEach(() => {
  cleanup();
  localStorage.clear();
});
