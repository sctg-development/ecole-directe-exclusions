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
 * APLIM Charlemagne / École Directe SIS adapter.
 *
 * TODO: APLIM does not expose a public API yet. When it does, implement this provider with
 * the school's API credentials (new wrangler secrets) and map its class/student payloads to
 * the shared `SchoolClass`/`Student` types. Until then, `SIS_PROVIDER=mock` is the way.
 */

import type { SchoolClass, Student } from "@exclusions/shared";
import type { SisProvider } from "./provider.js";

export class AplimSisProvider implements SisProvider {
  listClasses(): Promise<SchoolClass[]> {
    return Promise.reject(new Error("AplimSisProvider is not implemented yet (no APLIM API)"));
  }

  listStudents(_classId: string): Promise<Student[]> {
    return Promise.reject(new Error("AplimSisProvider is not implemented yet (no APLIM API)"));
  }

  getStudent(_studentId: string): Promise<Student | null> {
    return Promise.reject(new Error("AplimSisProvider is not implemented yet (no APLIM API)"));
  }
}
