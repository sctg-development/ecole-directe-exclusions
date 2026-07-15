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
 * Regenerates the realistic test-school fixture (8 classes, 247 students, 12 teachers) used by
 * both `npm run seed:test-school` (local dev) and `test/sync.test.ts` (automated tests at
 * realistic scale). No dependencies, Node >= 22 — deterministic (fixed PRNG seed), so re-running
 * this produces byte-identical output; only run it again if you deliberately want to change the
 * fixture shape.
 *
 * Usage:
 *   node scripts/generate-test-school-fixture.mjs
 *
 * Writes:
 *   test/fixtures/test-school.classes.json
 *   test/fixtures/test-school.students.json
 *   test/fixtures/test-school.teachers.json
 */

import console from "node:console";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(SCRIPT_DIR, "..", "test", "fixtures");

const STUDENT_COUNT = 247;
const TEACHER_COUNT = 12;

/** xmur3-style string hash producing a 32-bit PRNG seed (same technique as src/sis/mock.ts). */
function hashSeed(input) {
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
function mulberry32(seed) {
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
];

// 8 classes across the 3 French lycée levels, mixing a couple of technological sections for
// realism (see docs/ARCHITECTURE.md's SIS adapters section for the same flavor of naming).
const CLASS_PLANS = [
  { id: "cls-fixture-01", name: "2nde 1", level: "Seconde" },
  { id: "cls-fixture-02", name: "2nde 2", level: "Seconde" },
  { id: "cls-fixture-03", name: "2nde 3", level: "Seconde" },
  { id: "cls-fixture-04", name: "1re G1", level: "Première" },
  { id: "cls-fixture-05", name: "1re G2", level: "Première" },
  { id: "cls-fixture-06", name: "1re STMG", level: "Première" },
  { id: "cls-fixture-07", name: "Tle G1", level: "Terminale" },
  { id: "cls-fixture-08", name: "Tle STI2D", level: "Terminale" },
];

/** Splits `total` into `parts` chunks differing by at most 1 (same technique as src/sis/mock.ts). */
function splitEvenly(total, parts) {
  const base = Math.floor(total / parts);
  const remainder = total % parts;
  return Array.from({ length: parts }, (_, index) => base + (index < remainder ? 1 : 0));
}

function buildClassesAndStudents() {
  const random = mulberry32(hashSeed("test-school-fixture"));
  const sizes = splitEvenly(STUDENT_COUNT, CLASS_PLANS.length);

  const classes = [];
  const students = [];
  let studentSerial = 0;

  CLASS_PLANS.forEach((plan, index) => {
    const size = sizes[index];
    for (let i = 0; i < size; i++) {
      studentSerial += 1;
      students.push({
        id: `stu-fixture-${String(studentSerial).padStart(4, "0")}`,
        firstName: FIRST_NAMES[Math.floor(random() * FIRST_NAMES.length)],
        lastName: LAST_NAMES[Math.floor(random() * LAST_NAMES.length)],
        classId: plan.id,
        className: plan.name,
      });
    }
    classes.push({ id: plan.id, name: plan.name, level: plan.level, studentCount: size });
  });

  return { classes, students };
}

// A fixed, documented test password — this fixture is local-dev/test-only data, never deployed.
const TEACHER_PASSWORD = "enseignant-test-2026";

const TEACHER_NAMES = [
  ["Nathalie", "Perrot"],
  ["Julien", "Faucher"],
  ["Sophie", "Renard"],
  ["Marc", "Delattre"],
  ["Claire", "Aubert"],
  ["Vincent", "Lemoine"],
  ["Isabelle", "Charrier"],
  ["Olivier", "Brunet"],
  ["Sandrine", "Guillot"],
  ["Thierry", "Marchal"],
  ["Aurélie", "Cordier"],
  ["David", "Pelletier"],
];

/** Strips accents for the email local-part (z.email() rejects non-ASCII); displayName keeps them. */
function toAsciiSlug(name) {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function buildTeachers() {
  return TEACHER_NAMES.slice(0, TEACHER_COUNT).map(([firstName, lastName], index) => ({
    email: `${toAsciiSlug(firstName)}.${toAsciiSlug(lastName)}@lycee-test.example.org`,
    displayName: `${firstName} ${lastName}`,
    role: "teacher",
    password: TEACHER_PASSWORD,
    id: `teacher-fixture-${String(index + 1).padStart(2, "0")}`,
  }));
}

const { classes, students } = buildClassesAndStudents();
const teachers = buildTeachers();

if (classes.length !== 8) throw new Error(`expected 8 classes, got ${classes.length}`);
if (students.length !== STUDENT_COUNT) {
  throw new Error(`expected ${STUDENT_COUNT} students, got ${students.length}`);
}
if (teachers.length !== TEACHER_COUNT) {
  throw new Error(`expected ${TEACHER_COUNT} teachers, got ${teachers.length}`);
}

await mkdir(FIXTURES_DIR, { recursive: true });
await writeFile(
  join(FIXTURES_DIR, "test-school.classes.json"),
  `${JSON.stringify(classes, null, 2)}\n`,
);
await writeFile(
  join(FIXTURES_DIR, "test-school.students.json"),
  `${JSON.stringify(students, null, 2)}\n`,
);
await writeFile(
  join(FIXTURES_DIR, "test-school.teachers.json"),
  `${JSON.stringify(teachers, null, 2)}\n`,
);

console.log(
  `Wrote ${classes.length} classes, ${students.length} students, ${teachers.length} teachers ` +
    `to ${FIXTURES_DIR}`,
);
