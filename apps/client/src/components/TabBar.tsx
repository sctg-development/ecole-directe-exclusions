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

/** Bottom tab bar with large touch targets; entries depend on the signed-in role. */

import { NavLink } from "react-router";
import type { Role } from "@exclusions/shared";
import { t } from "../i18n/fr.js";

interface Tab {
  to: string;
  label: string;
  icon: keyof typeof ICON_PATHS;
}

/** 24×24 stroke icon paths (inline so the PWA stays fully self-contained). */
const ICON_PATHS = {
  report: "M12 5v14M5 12h14",
  dashboard: "M3 13h6V3H3v10Zm0 8h6v-6H3v6Zm8 0h10V11H11v10Zm0-18v6h10V3H11Z",
  history: "M12 8v4l3 3M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9Z",
  stats: "M4 20V10m6 10V4m6 16v-7m4 7H2",
  users:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87M15 3.13a4 4 0 0 1 0 7.75",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7.5 7.5 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7.5 7.5 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.07-.4.1-.8.1-1.2Z",
} as const;

function tabsForRole(role: Role): Tab[] {
  if (role === "teacher") {
    return [
      { to: "/report", label: t.tabs.report, icon: "report" },
      { to: "/history", label: t.tabs.history, icon: "history" },
      { to: "/settings", label: t.tabs.settings, icon: "settings" },
    ];
  }
  const tabs: Tab[] = [
    { to: "/dashboard", label: t.tabs.dashboard, icon: "dashboard" },
    { to: "/history", label: t.tabs.history, icon: "history" },
    { to: "/stats", label: t.tabs.stats, icon: "stats" },
  ];
  if (role === "admin") {
    tabs.push({ to: "/users", label: t.tabs.users, icon: "users" });
  }
  tabs.push({ to: "/settings", label: t.tabs.settings, icon: "settings" });
  return tabs;
}

export function TabBar({ role }: { role: Role }) {
  const tabs = tabsForRole(role);
  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div className="mx-auto flex max-w-3xl">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-xs font-medium ${
                isActive
                  ? "text-brand-700 dark:text-brand-300"
                  : "text-neutral-500 dark:text-neutral-400"
              }`
            }
          >
            <svg
              viewBox="0 0 24 24"
              className="size-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d={ICON_PATHS[tab.icon]} />
            </svg>
            {tab.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
