"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LostFoundCreateForm() {
  const router = useRouter();
  const [form, setForm] = useState({ roomNumber: "", guestName: "", description: "", storageBin: "" });
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/lost-found", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({ roomNumber: "", guestName: "", description: "", storageBin: "" });
    setLoading(false);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-2xl border border-border bg-card p-4 md:grid-cols-2">
      <input
        placeholder="Room number"
        value={form.roomNumber}
        onChange={(e) => setForm({ ...form, roomNumber: e.target.value })}
        className="rounded-xl border border-border px-3 py-2 text-sm"
      />
      <input
        placeholder="Guest name"
        value={form.guestName}
        onChange={(e) => setForm({ ...form, guestName: e.target.value })}
        className="rounded-xl border border-border px-3 py-2 text-sm"
      />
      <input
        placeholder="Description *"
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
        className="rounded-xl border border-border px-3 py-2 text-sm md:col-span-2"
        required
      />
      <input
        placeholder="Storage bin"
        value={form.storageBin}
        onChange={(e) => setForm({ ...form, storageBin: e.target.value })}
        className="rounded-xl border border-border px-3 py-2 text-sm"
      />
      <button type="submit" disabled={loading} className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50">
        {loading ? "Saving..." : "Log Found Item"}
      </button>
    </form>
  );
}
