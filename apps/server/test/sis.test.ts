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

/** Determinism and shape tests for the mock SIS provider. */

import { describe, expect, it } from "vitest";
import { MockSisProvider } from "../src/sis/mock.js";

describe("MockSisProvider determinism", () => {
  it("produces identical classes for two instances of the same school", async () => {
    const first = new MockSisProvider("apprentis-auteuil");
    const second = new MockSisProvider("apprentis-auteuil");
    expect(await first.listClasses()).toEqual(await second.listClasses());
  });

  it("produces identical rosters for two instances of the same school", async () => {
    const first = new MockSisProvider("apprentis-auteuil");
    const second = new MockSisProvider("apprentis-auteuil");
    const classes = await first.listClasses();
    for (const schoolClass of classes) {
      expect(await first.listStudents(schoolClass.id)).toEqual(
        await second.listStudents(schoolClass.id),
      );
    }
  });

  it("matches the apprentis-auteuil registry profile: 32 classes, 937 students", async () => {
    const provider = new MockSisProvider("apprentis-auteuil");
    const classes = await provider.listClasses();
    expect(classes).toHaveLength(32);
    const total = classes.reduce((sum, schoolClass) => sum + schoolClass.studentCount, 0);
    expect(total).toBe(937);
  });

  it("gives every class at least one student", async () => {
    const provider = new MockSisProvider("apprentis-auteuil");
    const classes = await provider.listClasses();
    for (const schoolClass of classes) {
      expect(schoolClass.studentCount).toBeGreaterThan(0);
      const students = await provider.listStudents(schoolClass.id);
      expect(students.length).toBe(schoolClass.studentCount);
    }
  });

  it("matches the registry profile for the other two schools too", async () => {
    const dominique = await new MockSisProvider("saint-dominique").listClasses();
    expect(dominique).toHaveLength(42);
    expect(dominique.reduce((sum, c) => sum + c.studentCount, 0)).toBe(1228);

    const paul = await new MockSisProvider("saint-paul").listClasses();
    expect(paul).toHaveLength(52);
    expect(paul.reduce((sum, c) => sum + c.studentCount, 0)).toBe(1543);
  });

  it("getStudent finds a student that listStudents also returns, with a consistent class", async () => {
    const provider = new MockSisProvider("apprentis-auteuil");
    const classes = await provider.listClasses();
    const firstClass = classes[0];
    if (firstClass === undefined) throw new Error("expected at least one class");
    const students = await provider.listStudents(firstClass.id);
    const anyStudent = students[0];
    if (anyStudent === undefined) throw new Error("expected at least one student");

    const found = await provider.getStudent(anyStudent.id);
    expect(found).toEqual(anyStudent);
  });

  it("getStudent returns null for an unknown id", async () => {
    const provider = new MockSisProvider("apprentis-auteuil");
    expect(await provider.getStudent("does-not-exist")).toBeNull();
  });

  it("class levels are restricted to the French lycée levels", async () => {
    const provider = new MockSisProvider("apprentis-auteuil");
    const classes = await provider.listClasses();
    const levels = new Set(classes.map((c) => c.level));
    for (const level of levels) {
      expect(["Seconde", "Première", "Terminale"]).toContain(level);
    }
  });
});
