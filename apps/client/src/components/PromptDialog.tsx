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
 * In-app modal for free-text input, used instead of `window.prompt()`: Capacitor's WKWebView
 * (iOS) does not reliably implement it, which would silently no-op the action on the primary
 * tablet target instead of showing an error.
 */

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { t } from "../i18n/fr.js";

export interface PromptDialogProps {
  message: string;
  confirmLabel?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export function PromptDialog({ message, confirmLabel, onConfirm, onCancel }: PromptDialogProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onConfirm(value);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <form
        className="card w-full max-w-sm space-y-3"
        role="dialog"
        aria-modal="true"
        aria-label={message}
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <p className="text-sm font-medium">{message}</p>
        <input
          ref={inputRef}
          className="input"
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            {t.common.cancel}
          </button>
          <button type="submit" className="btn btn-primary">
            {confirmLabel ?? t.common.save}
          </button>
        </div>
      </form>
    </div>
  );
}
