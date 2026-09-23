"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const ITEM_TYPES = ["Sheets", "Blankets", "Towels", "Bath Mats", "Pillow Cases", "Robes"];

export function LaundryCreateForm() {
  const router = useRouter();
  const [itemType, setItemType] = useState("Sheets");
  const [quantity, setQuantity] = useState(20);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/laundry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemType, quantity }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Item</label>
        <select value={itemType} onChange={(e) => setItemType(e.target.value)} className="rounded-xl border border-border px-3 py-2 text-sm">
          {ITEM_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Qty</label>
        <input
          type="number"
          min={1}
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
          className="w-24 rounded-xl border border-border px-3 py-2 text-sm"
        />
      </div>
      <button type="submit" disabled={loading} className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50">
        {loading ? "Adding..." : "Add Dirty Batch"}
      </button>
    </form>
  );
}
