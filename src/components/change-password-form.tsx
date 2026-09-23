"use client";

import { FormEvent, useState } from "react";

export function ChangePasswordForm({ compact = false }: { compact?: boolean }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(null);
    if (newPassword !== confirm) {
      setError("New passwords do not match");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/account/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok || !data.success) {
      setError(data.error || "Could not change password");
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirm("");
    setDone("Password updated");
  }

  return (
    <form onSubmit={submit} className={compact ? "space-y-3" : "space-y-3 rounded-2xl border border-border bg-card p-6"}>
      {!compact && <h2 className="font-semibold">Change my password</h2>}
      <input
        type="password"
        required
        placeholder="Current password"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        className="w-full rounded-xl border border-border px-3 py-2 text-sm"
        autoComplete="current-password"
      />
      <input
        type="password"
        required
        minLength={8}
        placeholder="New password (min 8 characters)"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        className="w-full rounded-xl border border-border px-3 py-2 text-sm"
        autoComplete="new-password"
      />
      <input
        type="password"
        required
        minLength={8}
        placeholder="Confirm new password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        className="w-full rounded-xl border border-border px-3 py-2 text-sm"
        autoComplete="new-password"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {done && <p className="text-sm text-emerald-700">{done}</p>}
      <button
        type="submit"
        disabled={loading}
        className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {loading ? "Saving…" : "Update password"}
      </button>
    </form>
  );
}
