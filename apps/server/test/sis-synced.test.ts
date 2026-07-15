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

/** `SyncedSisProvider` against the test D1 binding, seeded directly via the db/ layer. */

import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { upsertClasses } from "../src/db/classes.js";
import { upsertStudents } from "../src/db/students.js";
import { SyncedSisProvider } from "../src/sis/synced.js";

describe("SyncedSisProvider", () => {
  it("returns nothing before anything has been synced", async () => {
    const provider = new SyncedSisProvider(env.DB);
    expect(await provider.listClasses()).toEqual([]);
    expect(await provider.getStudent("does-not-exist")).toBeNull();
  });

  it("reflects classes and students upserted via the sync db layer", async () => {
    const now = new Date().toISOString();
    await upsertClasses(
      env.DB,
      [{ id: "cls-synced-1", name: "Synced 1", level: "Terminale", studentCount: 1 }],
      now,
    );
    await upsertStudents(
      env.DB,
      [
        {
          id: "stu-synced-1",
          firstName: "Ada",
          lastName: "Lovelace",
          classId: "cls-synced-1",
          className: "Synced 1",
        },
      ],
      now,
    );

    const provider = new SyncedSisProvider(env.DB);
    const classes = await provider.listClasses();
    expect(classes.some((schoolClass) => schoolClass.id === "cls-synced-1")).toBe(true);

    const students = await provider.listStudents("cls-synced-1");
    expect(students).toEqual([
      {
        id: "stu-synced-1",
        firstName: "Ada",
        lastName: "Lovelace",
        classId: "cls-synced-1",
        className: "Synced 1",
      },
    ]);

    const found = await provider.getStudent("stu-synced-1");
    expect(found).toEqual(students[0]);
  });
});
