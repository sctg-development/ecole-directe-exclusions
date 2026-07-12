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
import { t, tf } from "../src/i18n/fr.js";

/** Recursively collects every leaf string of the i18n object with its dotted path. */
function collectStrings(node: unknown, path: string, out: Array<[string, string]>): void {
  if (typeof node === "string") {
    out.push([path, node]);
    return;
  }
  if (node !== null && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      collectStrings(value, path === "" ? key : `${path}.${key}`, out);
    }
  }
}

describe("i18n fr", () => {
  it("contains no empty or whitespace-only strings", () => {
    const strings: Array<[string, string]> = [];
    collectStrings(t, "", strings);
    expect(strings.length).toBeGreaterThan(50);
    for (const [path, value] of strings) {
      expect(value.trim(), `t.${path} must not be empty`).not.toBe("");
    }
  });

  it("contains only string leaves", () => {
    const check = (node: unknown, path: string): void => {
      if (typeof node === "string") return;
      expect(node, `t.${path} must be an object or a string`).toBeTypeOf("object");
      expect(node, `t.${path} must not be null`).not.toBeNull();
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        check(value, path === "" ? key : `${path}.${key}`);
      }
    };
    check(t, "");
  });
});

describe("tf", () => {
  it("interpolates named placeholders", () => {
    expect(tf("Page {page} sur {pages}", { page: 2, pages: 7 })).toBe("Page 2 sur 7");
  });

  it("leaves unknown placeholders untouched", () => {
    expect(tf("Bonjour {name}", {})).toBe("Bonjour {name}");
  });
});
