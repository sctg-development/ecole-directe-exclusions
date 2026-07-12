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
 * Registry of the schools this project is initially deployed for. Each school runs a fully
 * independent Worker + D1 stack (GDPR isolation) — this registry only feeds the deterministic
 * mock SIS provider and the deployment tooling; no student data lives here.
 */

export interface SchoolProfile {
  /** Stable identifier, also the wrangler environment name. */
  id: string;
  name: string;
  classCount: number;
  studentCount: number;
  /** Platform of the teachers' tablets — informs which app store build matters most. */
  teacherPlatform: "android" | "ios";
}

export const SCHOOLS: readonly SchoolProfile[] = [
  {
    id: "apprentis-auteuil",
    name: "Fondation des Apprentis d'Auteuil",
    classCount: 32,
    studentCount: 937,
    teacherPlatform: "android",
  },
  {
    id: "saint-dominique",
    name: "Lycée Saint Dominique",
    classCount: 42,
    studentCount: 1228,
    teacherPlatform: "ios",
  },
  {
    id: "saint-paul",
    name: "Lycée Saint Paul",
    classCount: 52,
    studentCount: 1543,
    teacherPlatform: "ios",
  },
] as const;

export function getSchool(id: string): SchoolProfile | undefined {
  return SCHOOLS.find((school) => school.id === id);
}
