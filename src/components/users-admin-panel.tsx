"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { UserRole } from "@prisma/client";
import { ROLE_LABELS } from "@/lib/utils";

type StaffUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
};

export function UsersAdminPanel({ users: initial }: { users: StaffUser[] }) {
  const router = useRouter();
  const [users, setUsers] = useState(initial);
  const [form, setForm] = useState({ name: "", email: "", role: "HOUSEKEEPER" as UserRole, password: "password123" });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setLoading(false);
    if (!data.success) {
      setMessage(data.error || "Failed");
      return;
    }
    setUsers((prev) => [...prev, data.user].sort((a, b) => a.name.localeCompare(b.name)));
    setForm({ name: "", email: "", role: "HOUSEKEEPER", password: "password123" });
    setMessage("User created");
    router.refresh();
  }

  async function resetPassword(user: StaffUser) {
    const password = window.prompt(`New password for ${user.name} (${user.email})\nMinimum 8 characters.`, "");
    if (password == null) return;
    if (password.length < 8) {
      setMessage("Password must be at least 8 characters");
      return;
    }
    const res = await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    setMessage(data.success ? `Password updated for ${user.email}` : data.error || "Could not reset password");
  }

  async function updateUser(id: string, patch: Record<string, unknown>) {
    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (data.success) {
      setUsers((prev) => prev.map((u) => (u.id === id ? data.user : u)));
      router.refresh();
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={createUser} className="grid gap-3 rounded-2xl border border-border bg-card p-6 md:grid-cols-2">
        <h2 className="md:col-span-2 font-semibold">Add staff user</h2>
        <input
          required
          placeholder="Full name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="rounded-xl border border-border px-3 py-2 text-sm"
        />
        <input
          required
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="rounded-xl border border-border px-3 py-2 text-sm"
        />
        <select
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
          className="rounded-xl border border-border px-3 py-2 text-sm"
        >
          {Object.values(UserRole).map((r) => (
            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
          ))}
        </select>
        <input
          type="password"
          placeholder="Temp password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          className="rounded-xl border border-border px-3 py-2 text-sm"
        />
        <button type="submit" disabled={loading} className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white md:col-span-2">
          {loading ? "Creating..." : "Create user"}
        </button>
        {message && <p className="md:col-span-2 text-sm text-muted-foreground">{message}</p>}
      </form>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((u) => (
              <tr key={u.id} className={!u.active ? "opacity-50" : ""}>
                <td className="px-4 py-3 font-medium">{u.name}</td>
                <td className="px-4 py-3">{u.email}</td>
                <td className="px-4 py-3">
                  <select
                    value={u.role}
                    onChange={(e) => updateUser(u.id, { role: e.target.value })}
                    className="rounded-lg border border-border px-2 py-1 text-xs"
                  >
                    {Object.values(UserRole).map((r) => (
                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">{u.active ? "Active" : "Inactive"}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => updateUser(u.id, { active: !u.active })}
                      className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-muted"
                    >
                      {u.active ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      onClick={() => resetPassword(u)}
                      className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-muted"
                    >
                      Reset password
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
