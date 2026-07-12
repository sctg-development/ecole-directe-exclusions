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
 * Profile, password change, push notification opt-in and logout. The push toggle degrades
 * gracefully with a French message when the platform does not support notifications
 * (e.g. iOS Safari outside the installed PWA).
 */

import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router";
import { MIN_PASSWORD_LENGTH, ROLE_LABELS_FR } from "@exclusions/shared";
import { changePassword } from "../api/endpoints.js";
import { ApiError } from "../api/http.js";
import { useAuth } from "../auth/AuthContext.js";
import { t } from "../i18n/fr.js";
import { disablePush, enablePush, isPushEnabled } from "../push/index.js";

interface Message {
  kind: "success" | "error";
  text: string;
}

function FeedbackText({ message }: { message: Message | null }) {
  if (message === null) return null;
  return (
    <p
      role={message.kind === "error" ? "alert" : "status"}
      className={
        message.kind === "error"
          ? "text-red-700 dark:text-red-400"
          : "text-emerald-700 dark:text-emerald-400"
      }
    >
      {message.text}
    </p>
  );
}

function PushSection() {
  const [enabled, setEnabled] = useState(isPushEnabled);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const toggle = async () => {
    setBusy(true);
    setMessage(null);
    if (enabled) {
      await disablePush();
      setEnabled(false);
    } else {
      const result = await enablePush();
      if (result.ok) {
        setEnabled(true);
      } else {
        setMessage({ kind: "error", text: result.message });
      }
    }
    setBusy(false);
  };

  return (
    <section className="card space-y-3">
      <h2 className="text-lg font-semibold">{t.settings.notifications}</h2>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        {enabled ? t.settings.pushEnabled : t.settings.pushDisabled}
      </p>
      <FeedbackText message={message} />
      <button
        type="button"
        className={`btn ${enabled ? "btn-secondary" : "btn-primary"}`}
        disabled={busy}
        onClick={() => void toggle()}
      >
        {enabled ? t.settings.disablePush : t.settings.enablePush}
      </button>
    </section>
  );
}

function PasswordSection() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setMessage({ kind: "error", text: t.users.passwordTooShort });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await changePassword({ currentPassword, newPassword });
      setMessage({ kind: "success", text: t.settings.passwordChanged });
      setCurrentPassword("");
      setNewPassword("");
    } catch (error) {
      const wrongCurrent =
        error instanceof ApiError &&
        (error.code === "invalid_credentials" ||
          error.code === "forbidden" ||
          error.code === "unauthorized");
      setMessage({
        kind: "error",
        text: wrongCurrent ? t.settings.wrongPassword : t.common.error,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <form className="space-y-3" onSubmit={(event) => void handleSubmit(event)}>
        <h2 className="text-lg font-semibold">{t.settings.password}</h2>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-neutral-500">
            {t.settings.currentPassword}
          </span>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-neutral-500">
            {t.settings.newPassword}
          </span>
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
          <span className="mt-1 block text-xs text-neutral-500">{t.settings.passwordHint}</span>
        </label>
        <FeedbackText message={message} />
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {t.common.save}
        </button>
      </form>
    </section>
  );
}

export function Settings() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);

  if (user === null) return null;

  const handleLogout = async () => {
    setLoggingOut(true);
    await logout();
    void navigate("/login", { replace: true });
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t.settings.title}</h1>

      <section className="card">
        <h2 className="mb-2 text-lg font-semibold">{t.settings.profile}</h2>
        <p className="font-medium">{user.displayName}</p>
        <p className="text-sm text-neutral-500">{user.email}</p>
        <p className="mt-1 text-sm text-neutral-500">{ROLE_LABELS_FR[user.role]}</p>
      </section>

      <PushSection />

      <PasswordSection />

      <section className="card space-y-3">
        <button
          type="button"
          className="btn btn-danger w-full"
          disabled={loggingOut}
          onClick={() => void handleLogout()}
        >
          {t.settings.logout}
        </button>
        <p className="text-center text-xs text-neutral-500">
          {t.settings.version} {__APP_VERSION__}
        </p>
      </section>
    </div>
  );
}
