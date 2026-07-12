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

/** Unit tests for password hashing (PBKDF2-SHA256) and constant-time comparisons. */

import { describe, expect, it } from "vitest";
import {
  constantTimeEqual,
  hashPassword,
  secretsEqual,
  verifyPassword,
} from "../src/lib/crypto.js";

describe("hashPassword / verifyPassword", () => {
  it("verifies the correct password", async () => {
    const { hash, salt } = await hashPassword("correct-horse-battery-staple");
    await expect(verifyPassword("correct-horse-battery-staple", hash, salt)).resolves.toBe(true);
  });

  it("rejects a wrong password", async () => {
    const { hash, salt } = await hashPassword("correct-horse-battery-staple");
    await expect(verifyPassword("wrong-password-entirely", hash, salt)).resolves.toBe(false);
  });

  it("salts each hash independently, so two hashes of the same password differ", async () => {
    const a = await hashPassword("same-password-both-times");
    const b = await hashPassword("same-password-both-times");
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
    // Both remain valid against the same plaintext.
    await expect(verifyPassword("same-password-both-times", a.hash, a.salt)).resolves.toBe(true);
    await expect(verifyPassword("same-password-both-times", b.hash, b.salt)).resolves.toBe(true);
  });

  it("produces base64 hash and salt strings", async () => {
    const { hash, salt } = await hashPassword("another-password-1234");
    expect(() => atob(hash)).not.toThrow();
    expect(() => atob(salt)).not.toThrow();
    // 256-bit hash, 128-bit (16-byte) salt.
    expect(atob(hash).length).toBe(32);
    expect(atob(salt).length).toBe(16);
  });
});

describe("constantTimeEqual", () => {
  it("returns true for identical byte arrays", () => {
    const a = new Uint8Array([1, 2, 3, 4]);
    const b = new Uint8Array([1, 2, 3, 4]);
    expect(constantTimeEqual(a, b)).toBe(true);
  });

  it("returns false for differing byte arrays or lengths", () => {
    expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
    expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2]))).toBe(false);
  });
});

describe("secretsEqual", () => {
  it("matches equal secrets and rejects differing ones", async () => {
    await expect(secretsEqual("s3cret", "s3cret")).resolves.toBe(true);
    await expect(secretsEqual("s3cret", "other")).resolves.toBe(false);
  });
});
