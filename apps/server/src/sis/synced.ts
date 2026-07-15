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
 * SisProvider backed by the D1 tables populated by the /sync/* endpoints (see
 * apps/server/src/routes/sync.ts). Selected by SIS_PROVIDER = "synced" once a school's data is
 * actually flowing in from the external sync worker.
 */

import type { SchoolClass, Student } from "@exclusions/shared";
import { listClasses } from "../db/classes.js";
import { getStudent, listStudentsByClass } from "../db/students.js";
import type { SisProvider } from "./provider.js";

export class SyncedSisProvider implements SisProvider {
  constructor(private readonly db: D1Database) {}

  listClasses(): Promise<SchoolClass[]> {
    return listClasses(this.db);
  }

  listStudents(classId: string): Promise<Student[]> {
    return listStudentsByClass(this.db, classId);
  }

  getStudent(studentId: string): Promise<Student | null> {
    return getStudent(this.db, studentId);
  }
}
