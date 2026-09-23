"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function InventoryAdjust({ itemId, quantity }: { itemId: string; quantity: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function adjust(delta: number) {
    setLoading(true);
    await fetch(`/api/inventory/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delta }),
    });
    setLoading(false);
    router.refresh();
  }

  async function setQuantity(value: number) {
    setLoading(true);
    await fetch(`/api/inventory/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: value }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => adjust(-1)}
        disabled={loading || quantity <= 0}
        className="rounded-lg border border-border px-2 py-1 text-sm hover:bg-muted disabled:opacity-40"
      >
        −
      </button>
      <input
        type="number"
        defaultValue={quantity}
        key={quantity}
        onBlur={(e) => {
          const val = Number(e.target.value);
          if (!Number.isNaN(val) && val !== quantity) setQuantity(val);
        }}
        className="w-16 rounded-lg border border-border px-2 py-1 text-center text-sm"
      />
      <button
        onClick={() => adjust(1)}
        disabled={loading}
        className="rounded-lg border border-border px-2 py-1 text-sm hover:bg-muted disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}
