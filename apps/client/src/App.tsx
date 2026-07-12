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
 * App shell: router + query client + auth session. Role-based landing — teachers go straight
 * to the report wizard, the vie scolaire and admins to the live dashboard.
 */

import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Role } from "@exclusions/shared";
import { AuthProvider, useAuth } from "./auth/AuthContext.js";
import { Spinner } from "./components/Feedback.js";
import { Layout } from "./components/Layout.js";
import { RequireAuth, RequireRole, homeForRole } from "./components/Protected.js";
import { Dashboard } from "./pages/Dashboard.js";
import { ExclusionDetail } from "./pages/ExclusionDetail.js";
import { History } from "./pages/History.js";
import { Login } from "./pages/Login.js";
import { ReportExclusion } from "./pages/ReportExclusion.js";
import { Settings } from "./pages/Settings.js";
import { Users } from "./pages/Users.js";
import { initNativePushDeepLinks } from "./push/index.js";

/** Lazy: the charts (recharts) are supervision-only and must not weigh on the teacher flow. */
const Stats = lazy(() => import("./pages/Stats.js").then((module) => ({ default: module.Stats })));

const SUPERVISION_ROLES: readonly Role[] = ["vie-scolaire", "admin"];
const ADMIN_ROLES: readonly Role[] = ["admin"];

/** Sends the signed-in user to their role's landing page ("/" and unknown paths). */
function RootRedirect() {
  const { user } = useAuth();
  if (user === null) return <Navigate to="/login" replace />;
  return <Navigate to={homeForRole(user.role)} replace />;
}

/** Wires native (Capacitor) notification taps to in-app navigation. No-op on the web. */
function NativePushDeepLinks() {
  const navigate = useNavigate();
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void initNativePushDeepLinks((path) => void navigate(path));
  }, [navigate]);
  return null;
}

export function App() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, staleTime: 5_000 },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <NativePushDeepLinks />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <RequireAuth>
                  <Layout />
                </RequireAuth>
              }
            >
              <Route index element={<RootRedirect />} />
              {/* Any role may report (the tab is teacher-only, the route is not). */}
              <Route path="report" element={<ReportExclusion />} />
              <Route
                path="dashboard"
                element={
                  <RequireRole roles={SUPERVISION_ROLES}>
                    <Dashboard />
                  </RequireRole>
                }
              />
              <Route path="history" element={<History />} />
              <Route
                path="stats"
                element={
                  <RequireRole roles={SUPERVISION_ROLES}>
                    <Suspense fallback={<Spinner />}>
                      <Stats />
                    </Suspense>
                  </RequireRole>
                }
              />
              <Route
                path="users"
                element={
                  <RequireRole roles={ADMIN_ROLES}>
                    <Users />
                  </RequireRole>
                }
              />
              <Route path="settings" element={<Settings />} />
              <Route path="exclusions/:id" element={<ExclusionDetail />} />
              <Route path="*" element={<RootRedirect />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
