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
import type { SchoolClass } from "@exclusions/shared";
import {
  compareClasses,
  elapsedSecondsSince,
  formatClock,
  normalizeText,
  schoolYearRange,
} from "../src/lib/format.js";

describe("formatClock", () => {
  it("formats mm:ss under one hour", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(5)).toBe("00:05");
    expect(formatClock(65)).toBe("01:05");
    expect(formatClock(599)).toBe("09:59");
    expect(formatClock(3599)).toBe("59:59");
  });

  it("switches to h:mm:ss above one hour", () => {
    expect(formatClock(3600)).toBe("1:00:00");
    expect(formatClock(3661)).toBe("1:01:01");
    expect(formatClock(7325)).toBe("2:02:05");
  });

  it("floors fractional seconds and clamps negatives to zero", () => {
    expect(formatClock(61.9)).toBe("01:01");
    expect(formatClock(-42)).toBe("00:00");
  });
});

describe("elapsedSecondsSince", () => {
  it("returns whole seconds between an ISO timestamp and now", () => {
    const created = "2026-07-09T08:30:00.000Z";
    const now = new Date("2026-07-09T08:31:30.500Z").getTime();
    expect(elapsedSecondsSince(created, now)).toBe(90);
  });

  it("clamps future timestamps to zero", () => {
    const created = "2026-07-09T09:00:00.000Z";
    const now = new Date("2026-07-09T08:59:00.000Z").getTime();
    expect(elapsedSecondsSince(created, now)).toBe(0);
  });
});

describe("schoolYearRange", () => {
  it("uses the previous 1 August when now is before August", () => {
    expect(schoolYearRange(new Date(2026, 6, 10))).toEqual({
      from: "2025-08-01",
      to: "2026-07-31",
    });
  });

  it("uses the current 1 August from August onwards", () => {
    expect(schoolYearRange(new Date(2026, 8, 1))).toEqual({
      from: "2026-08-01",
      to: "2027-07-31",
    });
  });
});

describe("normalizeText", () => {
  it("strips diacritics and lowercases for accent-insensitive search", () => {
    expect(normalizeText("Éléonore")).toBe("eleonore");
    expect(normalizeText("FRANÇOIS")).toBe("francois");
  });
});

describe("compareClasses", () => {
  const make = (name: string, level: string): SchoolClass => ({
    id: name,
    name,
    level,
    studentCount: 30,
  });

  it("sorts by school level then by name, numeric-aware", () => {
    const classes = [
      make("T S2", "Terminale"),
      make("2nde B", "Seconde"),
      make("T S10", "Terminale"),
      make("2nde A", "Seconde"),
    ];
    const sorted = [...classes].sort(compareClasses);
    expect(sorted.map((entry) => entry.name)).toEqual(["2nde A", "2nde B", "T S2", "T S10"]);
  });
});
