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

import { describe, expect, it } from "vitest";
import { urlBase64ToUint8Array } from "../src/push/index.js";

/** Encodes bytes as base64url without padding, the format VAPID public keys use. */
function toBase64Url(bytes: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

describe("urlBase64ToUint8Array", () => {
  it("decodes plain base64", () => {
    expect(Array.from(urlBase64ToUint8Array("AQID"))).toEqual([1, 2, 3]);
  });

  it("restores stripped padding", () => {
    // 4 bytes → "AQIDBA==" in padded base64; VAPID keys come without the '='.
    expect(Array.from(urlBase64ToUint8Array("AQIDBA"))).toEqual([1, 2, 3, 4]);
    expect(Array.from(urlBase64ToUint8Array("AQ"))).toEqual([1]);
  });

  it("maps the url-safe alphabet ('-' and '_') back to '+' and '/'", () => {
    // [0xfb, 0xef] → "++8=" in standard base64 → "--8" in base64url.
    expect(Array.from(urlBase64ToUint8Array("--8"))).toEqual([0xfb, 0xef]);
    // [0xff] → "/w==" → "_w".
    expect(Array.from(urlBase64ToUint8Array("_w"))).toEqual([0xff]);
  });

  it("round-trips a realistic 65-byte VAPID public key", () => {
    // Uncompressed P-256 points are 65 bytes (0x04 prefix + two 32-byte coordinates).
    const key = new Uint8Array(65);
    key[0] = 0x04;
    for (let i = 1; i < key.length; i += 1) key[i] = (i * 37) % 256;

    const decoded = urlBase64ToUint8Array(toBase64Url(key));

    expect(decoded).toHaveLength(65);
    expect(Array.from(decoded)).toEqual(Array.from(key));
  });
});
