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
 * Dashboard cards must offer exactly the lifecycle actions `canTransition` allows for the
 * signed-in role — the UI can never propose a move the server would reject.
 */

import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Exclusion, ExclusionStatus } from "@exclusions/shared";
import { EXCLUSION_TRANSITIONS, canTransition } from "@exclusions/shared";
import { ExclusionCard } from "../src/components/ExclusionCard.js";

function makeExclusion(status: ExclusionStatus): Exclusion {
  return {
    id: `e-${status}`,
    studentId: "s-1",
    studentName: "DUPONT Alice",
    classId: "c-1",
    className: "2nde A",
    teacherId: "u-teacher",
    teacherName: "M. Durand",
    reason: "disruption",
    comment: null,
    status,
    createdAt: "2026-07-09T08:30:00.000Z",
    acknowledgedAt: null,
    arrivedAt: null,
    missingAt: null,
    resolvedAt: null,
    cancelledAt: null,
    updatedAt: "2026-07-09T08:30:00.000Z",
  };
}

function renderCard(status: ExclusionStatus, onTransition = vi.fn()) {
  const view = render(
    <MemoryRouter>
      <ExclusionCard
        exclusion={makeExclusion(status)}
        role="vie-scolaire"
        userId="u-vs"
        now={new Date("2026-07-09T08:35:00.000Z").getTime()}
        onTransition={onTransition}
      />
    </MemoryRouter>,
  );
  return { view, onTransition };
}

/** French action labels expected per status for the vie-scolaire role. */
const EXPECTED_ACTIONS: Record<ExclusionStatus, string[]> = {
  pending: ["Prendre en compte", "Élève arrivé", "Introuvable", "Annuler"],
  acknowledged: ["Élève arrivé", "Introuvable", "Annuler"],
  missing: ["Élève arrivé", "Clôturer"],
  arrived: ["Clôturer"],
  resolved: [],
  cancelled: [],
};

const ALL_STATUSES = Object.keys(EXCLUSION_TRANSITIONS) as ExclusionStatus[];

describe("ExclusionCard actions (role vie-scolaire)", () => {
  for (const status of ALL_STATUSES) {
    it(`offers [${EXPECTED_ACTIONS[status].join(", ")}] on status "${status}"`, () => {
      const { view } = renderCard(status);
      const buttons = within(view.container).queryAllByRole("button");
      expect(buttons.map((button) => button.textContent)).toEqual(EXPECTED_ACTIONS[status]);
      view.unmount();
    });

    it(`matches canTransition for every target on status "${status}"`, () => {
      const { view } = renderCard(status);
      const offered = within(view.container)
        .queryAllByRole("button")
        .map((button) => button.textContent);
      const allowedCount = ALL_STATUSES.filter((to) =>
        canTransition(status, to, "vie-scolaire"),
      ).length;
      expect(offered).toHaveLength(allowedCount);
      view.unmount();
    });
  }

  it("fires the transition immediately for time-critical actions (no dialog)", async () => {
    const user = userEvent.setup();
    const { onTransition } = renderCard("pending");

    await user.click(screen.getByRole("button", { name: "Prendre en compte" }));
    expect(onTransition).toHaveBeenCalledWith("acknowledged");
    expect(screen.queryByRole("dialog")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Élève arrivé" }));
    expect(onTransition).toHaveBeenCalledWith("arrived");
  });

  it("opens a comment dialog and fires the transition on confirm when cancelling", async () => {
    const user = userEvent.setup();
    const { onTransition } = renderCard("pending");

    await user.click(screen.getByRole("button", { name: "Annuler" }));
    expect(screen.getByRole("dialog")).not.toBeNull();

    await user.type(screen.getByRole("textbox"), "Fausse alerte");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(onTransition).toHaveBeenCalledWith("cancelled", "Fausse alerte");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("aborts the transition when the comment dialog is cancelled", async () => {
    const user = userEvent.setup();
    const { onTransition } = renderCard("missing");

    await user.click(screen.getByRole("button", { name: "Clôturer" }));
    await user.click(screen.getByRole("button", { name: "Annuler" }));

    expect(onTransition).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
