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
 * The teacher's 3-step wizard, all on one page, optimized for the under-10-seconds report:
 * class grid → student list (instant filter) → reason + confirm. One tap per step.
 */

import { useMemo, useState } from "react";
import type { Exclusion, ExclusionReason, SchoolClass, Student } from "@exclusions/shared";
import { EXCLUSION_REASONS } from "@exclusions/shared";
import { useClasses, useCreateExclusion, useStudents } from "../api/queries.js";
import { EmptyState, ErrorState, Spinner } from "../components/Feedback.js";
import { t } from "../i18n/fr.js";
import { compareClasses, normalizeText } from "../lib/format.js";

const REASON_ENTRIES = Object.entries(EXCLUSION_REASONS) as [
  ExclusionReason,
  { labelFr: string },
][];

function studentDisplayName(student: Student): string {
  return `${student.lastName.toUpperCase()} ${student.firstName}`;
}

// --- Step 1: class grid ---

function ClassGrid({ onSelect }: { onSelect: (schoolClass: SchoolClass) => void }) {
  const { data, isPending, isError, refetch } = useClasses();
  if (isPending) return <Spinner />;
  if (isError) return <ErrorState onRetry={() => void refetch()} />;
  const classes = [...data].sort(compareClasses);
  return (
    <section aria-label={t.report.stepClass}>
      <h2 className="mb-3 text-lg font-semibold">{t.report.stepClass}</h2>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
        {classes.map((schoolClass) => (
          <button
            key={schoolClass.id}
            type="button"
            className="btn btn-lg flex-col gap-0 bg-white shadow-sm hover:bg-brand-50 dark:bg-neutral-900 dark:hover:bg-neutral-800"
            onClick={() => onSelect(schoolClass)}
          >
            <span className="text-xl font-bold">{schoolClass.name}</span>
            <span className="text-xs font-normal text-neutral-500">{schoolClass.level}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

// --- Step 2: student list with instant client-side filter ---

function StudentList({
  classId,
  onSelect,
}: {
  classId: string;
  onSelect: (student: Student) => void;
}) {
  const { data, isPending, isError, refetch } = useStudents(classId);
  const [filter, setFilter] = useState("");
  const students = useMemo(() => {
    if (!data) return [];
    const needle = normalizeText(filter.trim());
    const all = [...data].sort((a, b) =>
      studentDisplayName(a).localeCompare(studentDisplayName(b), "fr"),
    );
    if (needle === "") return all;
    return all.filter((student) =>
      normalizeText(`${student.firstName} ${student.lastName}`).includes(needle),
    );
  }, [data, filter]);

  if (isPending) return <Spinner />;
  if (isError) return <ErrorState onRetry={() => void refetch()} />;

  return (
    <section aria-label={t.report.stepStudent}>
      <h2 className="mb-3 text-lg font-semibold">{t.report.stepStudent}</h2>
      <input
        className="input mb-3"
        type="search"
        placeholder={t.report.searchStudent}
        aria-label={t.report.searchStudent}
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
      />
      {students.length === 0 ? (
        <EmptyState title={t.report.studentsEmpty} />
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {students.map((student) => (
            <li key={student.id}>
              <button
                type="button"
                className="btn w-full justify-start bg-white text-left shadow-sm hover:bg-brand-50 dark:bg-neutral-900 dark:hover:bg-neutral-800"
                onClick={() => onSelect(student)}
              >
                {studentDisplayName(student)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// --- Step 3: reason + optional comment + one confirm tap ---

function ReasonStep({
  student,
  schoolClass,
  onSubmit,
  submitting,
  submitError,
}: {
  student: Student;
  schoolClass: SchoolClass;
  onSubmit: (reason: ExclusionReason, comment: string) => void;
  submitting: boolean;
  submitError: boolean;
}) {
  const [reason, setReason] = useState<ExclusionReason | null>(null);
  const [comment, setComment] = useState("");

  const commentMissing = reason === "other" && comment.trim() === "";
  const canConfirm = reason !== null && !commentMissing && !submitting;

  return (
    <section aria-label={t.report.stepReason}>
      <h2 className="mb-3 text-lg font-semibold">{t.report.stepReason}</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {REASON_ENTRIES.map(([value, { labelFr }]) => (
          <button
            key={value}
            type="button"
            aria-pressed={reason === value}
            className={`btn btn-lg text-center text-base leading-tight ${
              reason === value
                ? "btn-primary"
                : "bg-white shadow-sm hover:bg-brand-50 dark:bg-neutral-900 dark:hover:bg-neutral-800"
            }`}
            onClick={() => setReason(value)}
          >
            {labelFr}
          </button>
        ))}
      </div>
      <div className="mt-4">
        <label className="mb-1 block font-medium" htmlFor="report-comment">
          {t.report.commentLabel}{" "}
          {reason === "other" ? null : (
            <span className="font-normal text-neutral-500">({t.common.optional})</span>
          )}
        </label>
        <textarea
          id="report-comment"
          className="input min-h-20 py-2"
          maxLength={500}
          placeholder={t.report.commentPlaceholder}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
        />
        {commentMissing ? (
          <p role="alert" className="mt-1 text-sm text-red-700 dark:text-red-400">
            {t.report.commentRequired}
          </p>
        ) : null}
      </div>
      {submitError ? (
        <p role="alert" className="mt-3 text-red-700 dark:text-red-400">
          {t.common.error}
        </p>
      ) : null}
      <button
        type="button"
        className="btn btn-lg btn-primary mt-4 w-full"
        disabled={!canConfirm}
        onClick={() => {
          if (reason !== null) onSubmit(reason, comment.trim());
        }}
      >
        {submitting
          ? t.report.submitting
          : `${t.report.confirm} — ${studentDisplayName(student)} (${schoolClass.name})`}
      </button>
    </section>
  );
}

// --- Success screen ---

function SuccessScreen({ exclusion, onReset }: { exclusion: Exclusion; onReset: () => void }) {
  return (
    <div className="card mt-6 border border-emerald-300 text-center dark:border-emerald-800">
      <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950">
        <svg
          viewBox="0 0 24 24"
          className="size-8 text-emerald-600"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 12l5 5L20 6" />
        </svg>
      </div>
      <h2 className="text-xl font-bold">{t.report.successTitle}</h2>
      <p className="mt-1 text-neutral-600 dark:text-neutral-400">
        {exclusion.studentName} — {exclusion.className}
      </p>
      <p className="mt-1 text-neutral-500">{t.report.successBody}</p>
      <button type="button" className="btn btn-lg btn-primary mt-5 w-full" onClick={onReset}>
        {t.report.newExclusion}
      </button>
    </div>
  );
}

// --- The wizard ---

export function ReportExclusion() {
  const [schoolClass, setSchoolClass] = useState<SchoolClass | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const mutation = useCreateExclusion();

  const reset = () => {
    setSchoolClass(null);
    setStudent(null);
    mutation.reset();
  };

  const handleSubmit = (reason: ExclusionReason, comment: string) => {
    if (schoolClass === null || student === null) return;
    mutation.mutate({
      studentId: student.id,
      classId: schoolClass.id,
      reason,
      ...(comment !== "" ? { comment } : {}),
    });
  };

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">{t.report.title}</h1>

      {mutation.isSuccess ? (
        <SuccessScreen exclusion={mutation.data} onReset={reset} />
      ) : (
        <>
          {/* Breadcrumb of confirmed choices — one tap to go back a step. */}
          {schoolClass !== null ? (
            <div className="mb-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="chip chip-active"
                onClick={() => {
                  setSchoolClass(null);
                  setStudent(null);
                }}
              >
                {schoolClass.name} · {t.report.changeClass}
              </button>
              {student !== null ? (
                <button type="button" className="chip chip-active" onClick={() => setStudent(null)}>
                  {studentDisplayName(student)} · {t.report.changeStudent}
                </button>
              ) : null}
            </div>
          ) : null}

          {schoolClass === null ? (
            <ClassGrid
              onSelect={(selected) => {
                setSchoolClass(selected);
                setStudent(null);
              }}
            />
          ) : student === null ? (
            <StudentList classId={schoolClass.id} onSelect={setStudent} />
          ) : (
            <ReasonStep
              student={student}
              schoolClass={schoolClass}
              onSubmit={handleSubmit}
              submitting={mutation.isPending}
              submitError={mutation.isError}
            />
          )}
        </>
      )}
    </div>
  );
}
