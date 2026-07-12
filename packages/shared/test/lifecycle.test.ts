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
import {
  canTransition,
  eventTypeForTransition,
  EXCLUSION_TRANSITIONS,
  isTerminal,
  isTransitionAllowed,
} from "../src/lifecycle.js";
import type { ExclusionStatus } from "../src/domain.js";

const ALL_STATUSES: ExclusionStatus[] = [
  "pending",
  "acknowledged",
  "arrived",
  "missing",
  "resolved",
  "cancelled",
];

describe("exclusion transition graph", () => {
  it("covers every status", () => {
    expect(Object.keys(EXCLUSION_TRANSITIONS).sort()).toEqual([...ALL_STATUSES].sort());
  });

  it("terminal statuses have no outgoing transitions", () => {
    expect(isTerminal("resolved")).toBe(true);
    expect(isTerminal("cancelled")).toBe(true);
    expect(isTerminal("pending")).toBe(false);
    expect(isTerminal("missing")).toBe(false);
  });

  it("nothing ever transitions back to pending", () => {
    for (const from of ALL_STATUSES) {
      expect(isTransitionAllowed(from, "pending")).toBe(false);
    }
  });

  it("a missing student can still arrive", () => {
    expect(isTransitionAllowed("missing", "arrived")).toBe(true);
  });

  it("arrived and missing can be resolved, active statuses cannot", () => {
    expect(isTransitionAllowed("arrived", "resolved")).toBe(true);
    expect(isTransitionAllowed("missing", "resolved")).toBe(true);
    expect(isTransitionAllowed("pending", "resolved")).toBe(false);
    expect(isTransitionAllowed("acknowledged", "resolved")).toBe(false);
  });

  it("cancellation is only possible before the student is located", () => {
    expect(isTransitionAllowed("pending", "cancelled")).toBe(true);
    expect(isTransitionAllowed("acknowledged", "cancelled")).toBe(true);
    expect(isTransitionAllowed("arrived", "cancelled")).toBe(false);
    expect(isTransitionAllowed("missing", "cancelled")).toBe(false);
  });
});

describe("canTransition role rules", () => {
  it("only vie scolaire and admin acknowledge", () => {
    expect(canTransition("pending", "acknowledged", "vie-scolaire")).toBe(true);
    expect(canTransition("pending", "acknowledged", "admin")).toBe(true);
    expect(canTransition("pending", "acknowledged", "teacher")).toBe(false);
    expect(canTransition("pending", "acknowledged", "system")).toBe(false);
  });

  it("the system may only escalate to missing", () => {
    expect(canTransition("pending", "missing", "system")).toBe(true);
    expect(canTransition("acknowledged", "missing", "system")).toBe(true);
    expect(canTransition("pending", "arrived", "system")).toBe(false);
    expect(canTransition("missing", "resolved", "system")).toBe(false);
  });

  it("teachers can cancel only their own exclusions", () => {
    expect(canTransition("pending", "cancelled", "teacher", true)).toBe(true);
    expect(canTransition("pending", "cancelled", "teacher", false)).toBe(false);
    expect(canTransition("pending", "cancelled", "vie-scolaire", false)).toBe(true);
  });

  it("teachers cannot mark arrival or resolve", () => {
    expect(canTransition("acknowledged", "arrived", "teacher", true)).toBe(false);
    expect(canTransition("arrived", "resolved", "teacher", true)).toBe(false);
  });

  it("rejects graph-invalid transitions regardless of role", () => {
    expect(canTransition("resolved", "arrived", "admin")).toBe(false);
    expect(canTransition("cancelled", "acknowledged", "admin")).toBe(false);
    expect(canTransition("arrived", "missing", "admin")).toBe(false);
  });
});

describe("eventTypeForTransition", () => {
  it("maps every non-pending status to its event type", () => {
    expect(eventTypeForTransition("acknowledged")).toBe("acknowledged");
    expect(eventTypeForTransition("arrived")).toBe("arrived");
    expect(eventTypeForTransition("missing")).toBe("missing");
    expect(eventTypeForTransition("resolved")).toBe("resolved");
    expect(eventTypeForTransition("cancelled")).toBe("cancelled");
  });
});
