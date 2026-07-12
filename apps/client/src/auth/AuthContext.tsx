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
 * Session state: hydrates `/me` on boot when tokens are present, exposes `login`/`logout`,
 * and resets to anonymous when the HTTP layer reports an unrecoverable 401.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { User } from "@exclusions/shared";
import * as endpoints from "../api/endpoints.js";
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  onUnauthorized,
  setTokens,
} from "../api/http.js";

interface AuthContextValue {
  /** The signed-in user, or null when anonymous. */
  user: User | null;
  /** True while the boot-time `/me` hydration is in flight. */
  loading: boolean;
  /** @throws {ApiError} with code `invalid_credentials` or `rate_limited` on failure. */
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** True when a stored token pair suggests we were signed in (checked once, at mount). */
function hasStoredSession(): boolean {
  return getAccessToken() !== null || getRefreshToken() !== null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // Lazily seeded from storage so the "no session" case never needs a synchronous
  // setState call inside the effect below (react-hooks/set-state-in-effect).
  const [loading, setLoading] = useState(hasStoredSession);

  // Hydrate the session on boot: a stored token pair means we were signed in.
  useEffect(() => {
    if (!hasStoredSession()) return;
    let cancelled = false;
    endpoints
      .me()
      .then((me) => {
        if (!cancelled) setUser(me);
      })
      .catch(() => {
        // apiFetch already cleared the tokens if the refresh failed.
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Session expired mid-use (refresh token revoked or expired) → back to the login screen.
  useEffect(() => onUnauthorized(() => setUser(null)), []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await endpoints.login({ email, password });
    setTokens(response.accessToken, response.refreshToken);
    setUser(response.user);
    return response.user;
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = getRefreshToken();
    if (refreshToken !== null) {
      // Best-effort server-side revocation; the local session is dropped regardless.
      try {
        await endpoints.logout(refreshToken);
      } catch {
        // Ignored: offline logout must still work.
      }
    }
    clearTokens();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);

  return <AuthContext value={value}>{children}</AuthContext>;
}

/** Current session. Must be used under an `AuthProvider`. */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === null) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
