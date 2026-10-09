"use client";

import { LockKeyhole, Sparkles } from "lucide-react";
import { FormEvent, useState } from "react";

export function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ username, password }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Accesso non riuscito.");
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.assign(next?.startsWith("/") ? next : "/");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Accesso non riuscito.");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-mark" aria-hidden="true">
          <Sparkles size={18} />
        </div>
        <p className="eyebrow">AETERNA OS / ACCESSO</p>
        <h1>Il tuo centro operativo.</h1>
        <p className="auth-intro">Accedi per continuare nello spazio di lavoro AETERNA.</p>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            <span>Username</span>
            <input
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error && (
            <p className="task-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="button button-primary auth-submit"
            type="submit"
            disabled={isSubmitting}
          >
            <LockKeyhole size={15} /> {isSubmitting ? "Verifica in corso..." : "Accedi"}
          </button>
        </form>
        <p className="auth-footnote">
          La sessione resta protetta in un cookie HttpOnly e non viene salvata nel browser storage.
        </p>
      </div>
    </div>
  );
}
