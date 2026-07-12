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
 * Deterministic mock SIS. Seeded from `SCHOOL_ID` (mulberry32 PRNG), it always produces the
 * same classes and rosters for a school, with realistic French class names across
 * Seconde/Première/Terminale (including techno and pro sections) and French student names.
 * Class count and total student count match the school's `SCHOOLS` registry entry.
 */

import { getSchool } from "@exclusions/shared";
import type { SchoolClass, Student } from "@exclusions/shared";
import type { SisProvider } from "./provider.js";

/** xmur3-style string hash producing a 32-bit PRNG seed. */
function hashSeed(input: string): number {
  let h = 1779033703 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/** mulberry32: tiny, fast, deterministic PRNG. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST_NAMES = [
  "Adam",
  "Alice",
  "Ambre",
  "Anna",
  "Arthur",
  "Axel",
  "Camille",
  "Chloé",
  "Clément",
  "Elena",
  "Emma",
  "Enzo",
  "Ethan",
  "Gabriel",
  "Hugo",
  "Inès",
  "Jade",
  "Jeanne",
  "Jules",
  "Julia",
  "Léa",
  "Léna",
  "Léo",
  "Lina",
  "Louis",
  "Louise",
  "Lucas",
  "Maël",
  "Manon",
  "Margaux",
  "Mathis",
  "Mila",
  "Mohamed",
  "Nathan",
  "Nina",
  "Noah",
  "Rayan",
  "Robin",
  "Romane",
  "Rose",
  "Sacha",
  "Sarah",
  "Théo",
  "Timéo",
  "Tom",
  "Yanis",
  "Zoé",
  "Élise",
  "Émile",
  "Éva",
];

const LAST_NAMES = [
  "Martin",
  "Bernard",
  "Thomas",
  "Petit",
  "Robert",
  "Richard",
  "Durand",
  "Dubois",
  "Moreau",
  "Laurent",
  "Simon",
  "Michel",
  "Lefebvre",
  "Leroy",
  "Roux",
  "David",
  "Bertrand",
  "Morel",
  "Fournier",
  "Girard",
  "Bonnet",
  "Dupont",
  "Lambert",
  "Fontaine",
  "Rousseau",
  "Vincent",
  "Muller",
  "Lefèvre",
  "Faure",
  "André",
  "Mercier",
  "Blanc",
  "Guérin",
  "Boyer",
  "Garnier",
  "Chevalier",
  "François",
  "Legrand",
  "Gauthier",
  "Garcia",
  "Perrin",
  "Robin",
  "Clément",
  "Morin",
  "Nicolas",
  "Henry",
  "Roussel",
  "Mathieu",
  "Gautier",
  "Masson",
  "Marchand",
  "Duval",
  "Denis",
  "Dumont",
  "Marie",
  "Lemaire",
  "Noël",
  "Meyer",
  "Dufour",
  "Meunier",
];

const TECHNO_SERIES = ["STMG", "STI2D", "ST2S", "STL"];
const PRO_SPECIALTIES = ["MELEC", "Commerce", "ASSP", "Cuisine", "SN", "Logistique"];

interface ClassPlan {
  name: string;
  level: string;
}

/** Splits `total` into `parts` chunks differing by at most 1. */
function splitEvenly(total: number, parts: number): number[] {
  const base = Math.floor(total / parts);
  const remainder = total % parts;
  return Array.from({ length: parts }, (_, index) => base + (index < remainder ? 1 : 0));
}

/**
 * Deterministic class naming: each level mixes general classes with techno (Première and
 * Terminale only — the French "seconde générale et technologique" is a common trunk) and
 * professional sections.
 */
function planClasses(classCount: number): ClassPlan[] {
  const [secondeCount, premiereCount, terminaleCount] = splitEvenly(classCount, 3) as [
    number,
    number,
    number,
  ];
  const plans: ClassPlan[] = [];

  const addLevel = (
    level: string,
    count: number,
    generalName: (index: number) => string,
    technoName: ((index: number) => string) | null,
    proName: (index: number) => string,
  ): void => {
    const proCount = count >= 5 ? Math.max(1, Math.round(count * 0.15)) : 0;
    const technoCount =
      technoName !== null && count >= 4 ? Math.max(1, Math.round(count * 0.25)) : 0;
    const generalCount = count - proCount - technoCount;
    for (let i = 0; i < generalCount; i++) plans.push({ name: generalName(i), level });
    for (let i = 0; i < technoCount; i++) {
      if (technoName !== null) plans.push({ name: technoName(i), level });
    }
    for (let i = 0; i < proCount; i++) plans.push({ name: proName(i), level });
  };

  addLevel(
    "Seconde",
    secondeCount,
    (i) => `2nde ${i + 1}`,
    null,
    (i) =>
      `2nde Pro ${PRO_SPECIALTIES[i % PRO_SPECIALTIES.length]}${i >= PRO_SPECIALTIES.length ? ` ${Math.floor(i / PRO_SPECIALTIES.length) + 1}` : ""}`,
  );
  addLevel(
    "Première",
    premiereCount,
    (i) => `1re G${i + 1}`,
    (i) =>
      `1re ${TECHNO_SERIES[i % TECHNO_SERIES.length]}${i >= TECHNO_SERIES.length ? ` ${Math.floor(i / TECHNO_SERIES.length) + 1}` : ""}`,
    (i) =>
      `1re Pro ${PRO_SPECIALTIES[i % PRO_SPECIALTIES.length]}${i >= PRO_SPECIALTIES.length ? ` ${Math.floor(i / PRO_SPECIALTIES.length) + 1}` : ""}`,
  );
  addLevel(
    "Terminale",
    terminaleCount,
    (i) => `Tle G${i + 1}`,
    (i) =>
      `Tle ${TECHNO_SERIES[i % TECHNO_SERIES.length]}${i >= TECHNO_SERIES.length ? ` ${Math.floor(i / TECHNO_SERIES.length) + 1}` : ""}`,
    (i) =>
      `Tle Pro ${PRO_SPECIALTIES[i % PRO_SPECIALTIES.length]}${i >= PRO_SPECIALTIES.length ? ` ${Math.floor(i / PRO_SPECIALTIES.length) + 1}` : ""}`,
  );
  return plans;
}

interface MockData {
  classes: SchoolClass[];
  studentsByClass: Map<string, Student[]>;
  studentsById: Map<string, Student>;
}

/** Generation is pure and seeded, so one cache entry per school is safe forever. */
const dataCache = new Map<string, MockData>();

/** Unknown school ids (local experiments) still get a deterministic small school. */
const FALLBACK_PROFILE = { classCount: 12, studentCount: 300 };

function buildData(schoolId: string): MockData {
  const school = getSchool(schoolId) ?? { id: schoolId, ...FALLBACK_PROFILE };
  const random = mulberry32(hashSeed(schoolId));
  const plans = planClasses(school.classCount);
  const sizes = splitEvenly(school.studentCount, school.classCount);

  const classes: SchoolClass[] = [];
  const studentsByClass = new Map<string, Student[]>();
  const studentsById = new Map<string, Student>();
  let studentSerial = 0;

  plans.forEach((plan, index) => {
    const classId = `cls-${String(index + 1).padStart(3, "0")}`;
    const size = sizes[index] ?? 0;
    const students: Student[] = [];
    for (let i = 0; i < size; i++) {
      studentSerial += 1;
      const student: Student = {
        id: `stu-${String(studentSerial).padStart(4, "0")}`,
        firstName: FIRST_NAMES[Math.floor(random() * FIRST_NAMES.length)] ?? "Camille",
        lastName: LAST_NAMES[Math.floor(random() * LAST_NAMES.length)] ?? "Martin",
        classId,
        className: plan.name,
      };
      students.push(student);
      studentsById.set(student.id, student);
    }
    classes.push({ id: classId, name: plan.name, level: plan.level, studentCount: size });
    studentsByClass.set(classId, students);
  });

  return { classes, studentsByClass, studentsById };
}

export class MockSisProvider implements SisProvider {
  private readonly data: MockData;

  constructor(schoolId: string) {
    let data = dataCache.get(schoolId);
    if (data === undefined) {
      data = buildData(schoolId);
      dataCache.set(schoolId, data);
    }
    this.data = data;
  }

  listClasses(): Promise<SchoolClass[]> {
    return Promise.resolve(this.data.classes.map((schoolClass) => ({ ...schoolClass })));
  }

  listStudents(classId: string): Promise<Student[]> {
    const students = this.data.studentsByClass.get(classId) ?? [];
    return Promise.resolve(students.map((student) => ({ ...student })));
  }

  getStudent(studentId: string): Promise<Student | null> {
    const student = this.data.studentsById.get(studentId);
    return Promise.resolve(student ? { ...student } : null);
  }
}
