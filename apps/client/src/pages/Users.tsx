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
 * Admin-only user management: account list with role badges and disabled state, creation
 * form, inline role editing, disable/enable and password reset. Accounts are never deleted
 * (audit integrity) — only disabled.
 */

import { useState } from "react";
import type { FormEvent } from "react";
import type { Role, User } from "@exclusions/shared";
import { MIN_PASSWORD_LENGTH, ROLE_LABELS_FR } from "@exclusions/shared";
import { useCreateUser, useResetUserPassword, useUpdateUser, useUsers } from "../api/queries.js";
import { EmptyState, ErrorState, Spinner } from "../components/Feedback.js";
import { PromptDialog } from "../components/PromptDialog.js";
import { t } from "../i18n/fr.js";

const ROLES = Object.keys(ROLE_LABELS_FR) as Role[];

const ROLE_BADGE_CLASSES: Record<Role, string> = {
  teacher: "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  "vie-scolaire": "bg-brand-100 text-brand-900 dark:bg-brand-900 dark:text-brand-100",
  admin: "bg-purple-100 text-purple-900 dark:bg-purple-950 dark:text-purple-300",
};

interface Message {
  kind: "success" | "error";
  text: string;
}

function RoleBadge({ role }: { role: Role }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${ROLE_BADGE_CLASSES[role]}`}
    >
      {ROLE_LABELS_FR[role]}
    </span>
  );
}

function CreateUserForm({ onMessage }: { onMessage: (message: Message) => void }) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<Role>("teacher");
  const [password, setPassword] = useState("");
  const createUser = useCreateUser();

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      onMessage({ kind: "error", text: t.users.passwordTooShort });
      return;
    }
    createUser.mutate(
      { email: email.trim(), displayName: displayName.trim(), role, password },
      {
        onSuccess: () => {
          onMessage({ kind: "success", text: t.users.created });
          setEmail("");
          setDisplayName("");
          setRole("teacher");
          setPassword("");
        },
        onError: () => onMessage({ kind: "error", text: t.common.error }),
      },
    );
  };

  return (
    <form className="card mb-6 space-y-3" onSubmit={handleSubmit}>
      <h2 className="text-lg font-semibold">{t.users.create}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-neutral-500">{t.users.email}</span>
          <input
            className="input"
            type="email"
            autoComplete="off"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-neutral-500">
            {t.users.displayName}
          </span>
          <input
            className="input"
            type="text"
            required
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-neutral-500">{t.users.role}</span>
          <select
            className="input"
            value={role}
            onChange={(event) => setRole(event.target.value as Role)}
          >
            {ROLES.map((entry) => (
              <option key={entry} value={entry}>
                {ROLE_LABELS_FR[entry]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-neutral-500">
            {t.users.password}
          </span>
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <span className="mt-1 block text-xs text-neutral-500">{t.users.passwordHint}</span>
        </label>
      </div>
      <button type="submit" className="btn btn-primary" disabled={createUser.isPending}>
        {t.users.create}
      </button>
    </form>
  );
}

function UserRow({
  account,
  busy,
  onChangeRole,
  onToggleDisabled,
  onResetPassword,
}: {
  account: User;
  busy: boolean;
  onChangeRole: (role: Role) => void;
  onToggleDisabled: () => void;
  onResetPassword: () => void;
}) {
  return (
    <li className={`card ${account.disabled ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-semibold">
            {account.displayName}
            <RoleBadge role={account.role} />
            {account.disabled ? (
              <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-900 dark:bg-red-950 dark:text-red-300">
                {t.users.disabled}
              </span>
            ) : null}
          </p>
          <p className="truncate text-sm text-neutral-500">{account.email}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="input min-h-10 w-auto"
            aria-label={t.users.role}
            value={account.role}
            disabled={busy}
            onChange={(event) => onChangeRole(event.target.value as Role)}
          >
            {ROLES.map((entry) => (
              <option key={entry} value={entry}>
                {ROLE_LABELS_FR[entry]}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-secondary min-h-10"
            disabled={busy}
            onClick={onResetPassword}
          >
            {t.users.resetPassword}
          </button>
          <button
            type="button"
            className={`btn min-h-10 ${account.disabled ? "btn-secondary" : "btn-danger"}`}
            disabled={busy}
            onClick={onToggleDisabled}
          >
            {account.disabled ? t.users.enable : t.users.disable}
          </button>
        </div>
      </div>
    </li>
  );
}

export function Users() {
  const [message, setMessage] = useState<Message | null>(null);
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const { data, isPending, isError, refetch } = useUsers();
  const updateUser = useUpdateUser();
  const resetPassword = useResetUserPassword();

  const handleChangeRole = (account: User, role: Role) => {
    if (role === account.role) return;
    updateUser.mutate(
      { id: account.id, role },
      {
        onSuccess: () => setMessage({ kind: "success", text: t.users.updated }),
        onError: () => setMessage({ kind: "error", text: t.common.error }),
      },
    );
  };

  const handleToggleDisabled = (account: User) => {
    updateUser.mutate(
      { id: account.id, disabled: !account.disabled },
      {
        onSuccess: () => setMessage({ kind: "success", text: t.users.updated }),
        onError: () => setMessage({ kind: "error", text: t.common.error }),
      },
    );
  };

  const handleResetPasswordConfirm = (password: string) => {
    const target = resetTarget;
    setResetTarget(null);
    if (target === null) return;
    const trimmed = password.trim();
    if (trimmed.length < MIN_PASSWORD_LENGTH) {
      setMessage({ kind: "error", text: t.users.passwordTooShort });
      return;
    }
    resetPassword.mutate(
      { id: target.id, password: trimmed },
      {
        onSuccess: () => setMessage({ kind: "success", text: t.users.passwordReset }),
        onError: () => setMessage({ kind: "error", text: t.common.error }),
      },
    );
  };

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">{t.users.title}</h1>

      <CreateUserForm onMessage={setMessage} />

      {message !== null ? (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={`mb-3 ${
            message.kind === "error"
              ? "text-red-700 dark:text-red-400"
              : "text-emerald-700 dark:text-emerald-400"
          }`}
        >
          {message.text}
        </p>
      ) : null}

      {isPending ? (
        <Spinner />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : data.length === 0 ? (
        <EmptyState title={t.users.empty} />
      ) : (
        <ul className="space-y-2">
          {data.map((account) => (
            <UserRow
              key={account.id}
              account={account}
              busy={updateUser.isPending || resetPassword.isPending}
              onChangeRole={(role) => handleChangeRole(account, role)}
              onToggleDisabled={() => handleToggleDisabled(account)}
              onResetPassword={() => setResetTarget(account)}
            />
          ))}
        </ul>
      )}
      {resetTarget !== null ? (
        <PromptDialog
          message={t.users.resetPasswordPrompt}
          confirmLabel={t.users.resetPasswordConfirm}
          onCancel={() => setResetTarget(null)}
          onConfirm={handleResetPasswordConfirm}
        />
      ) : null}
    </div>
  );
}
