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

/** The 3-step report wizard: class grid → filtered student list → reason → one confirm tap. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Exclusion, SchoolClass, Student } from "@exclusions/shared";
import type * as EndpointsModule from "../src/api/endpoints.js";
import { createExclusion, listClasses, listStudents } from "../src/api/endpoints.js";
import { ReportExclusion } from "../src/pages/ReportExclusion.js";

vi.mock("../src/api/endpoints.js", async (importOriginal) => {
  const actual = await importOriginal<typeof EndpointsModule>();
  return {
    ...actual,
    listClasses: vi.fn(),
    listStudents: vi.fn(),
    createExclusion: vi.fn(),
  };
});

const CLASSES: SchoolClass[] = [
  // Intentionally out of order: the grid must sort by level (Seconde first), then name.
  { id: "c-ts1", name: "T S1", level: "Terminale", studentCount: 30 },
  { id: "c-2a", name: "2nde A", level: "Seconde", studentCount: 32 },
];

const STUDENTS: Student[] = [
  { id: "s-bob", firstName: "Bob", lastName: "Martin", classId: "c-2a", className: "2nde A" },
  { id: "s-alice", firstName: "Alice", lastName: "Dupont", classId: "c-2a", className: "2nde A" },
];

const CREATED: Exclusion = {
  id: "e-1",
  studentId: "s-bob",
  studentName: "MARTIN Bob",
  classId: "c-2a",
  className: "2nde A",
  teacherId: "u-1",
  teacherName: "M. Durand",
  reason: "other",
  comment: "Bavardage continu",
  status: "pending",
  createdAt: "2026-07-09T08:30:00.000Z",
  acknowledgedAt: null,
  arrivedAt: null,
  missingAt: null,
  resolvedAt: null,
  cancelledAt: null,
  updatedAt: "2026-07-09T08:30:00.000Z",
};

function renderWizard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ReportExclusion />
    </QueryClientProvider>,
  );
}

describe("ReportExclusion wizard", () => {
  beforeEach(() => {
    vi.mocked(listClasses).mockReset().mockResolvedValue(CLASSES);
    vi.mocked(listStudents).mockReset().mockResolvedValue(STUDENTS);
    vi.mocked(createExclusion).mockReset().mockResolvedValue(CREATED);
  });

  it("sorts the class grid by level then name", async () => {
    renderWizard();
    const seconde = await screen.findByRole("button", { name: /2nde A/ });
    const terminale = screen.getByRole("button", { name: /T S1/ });
    // "2nde A" (Seconde) must appear before "T S1" (Terminale) in the document.
    expect(
      seconde.compareDocumentPosition(terminale) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("filters students instantly on the client", async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(await screen.findByRole("button", { name: /2nde A/ }));

    await screen.findByRole("button", { name: /DUPONT Alice/ });
    expect(screen.getByRole("button", { name: /MARTIN Bob/ })).toBeTruthy();

    await user.type(screen.getByRole("searchbox"), "mar");
    expect(screen.queryByRole("button", { name: /DUPONT Alice/ })).toBeNull();
    expect(screen.getByRole("button", { name: /MARTIN Bob/ })).toBeTruthy();
    expect(vi.mocked(listStudents)).toHaveBeenCalledWith("c-2a");
  });

  it("requires a comment for reason 'other' and submits the exact payload", async () => {
    const user = userEvent.setup();
    renderWizard();

    // Step 1: class.
    await user.click(await screen.findByRole("button", { name: /2nde A/ }));
    // Step 2: student.
    await user.click(await screen.findByRole("button", { name: /MARTIN Bob/ }));
    // Step 3: reason "other" → comment becomes mandatory.
    await user.click(screen.getByRole("button", { name: "Autre motif" }));

    const confirm = screen.getByRole("button", {
      name: /Confirmer l'exclusion/,
    }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain("commentaire est obligatoire");

    await user.type(screen.getByLabelText(/Commentaire/), "Bavardage continu");
    expect(confirm.disabled).toBe(false);
    // The recap on the confirm button names the student and the class.
    expect(confirm.textContent).toContain("MARTIN Bob");
    expect(confirm.textContent).toContain("2nde A");

    await user.click(confirm);

    expect(vi.mocked(createExclusion)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createExclusion)).toHaveBeenCalledWith({
      studentId: "s-bob",
      classId: "c-2a",
      reason: "other",
      comment: "Bavardage continu",
    });

    // Success screen with the reset button.
    await screen.findByText("Exclusion signalée");
    await user.click(screen.getByRole("button", { name: "Nouvelle exclusion" }));
    await screen.findByText(/Choisissez la classe/);
  });

  it("omits the comment field entirely when left empty for a standard reason", async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(await screen.findByRole("button", { name: /2nde A/ }));
    await user.click(await screen.findByRole("button", { name: /DUPONT Alice/ }));
    await user.click(screen.getByRole("button", { name: "Perturbation du cours" }));
    await user.click(screen.getByRole("button", { name: /Confirmer l'exclusion/ }));

    expect(vi.mocked(createExclusion)).toHaveBeenCalledWith({
      studentId: "s-alice",
      classId: "c-2a",
      reason: "disruption",
    });
  });
});
