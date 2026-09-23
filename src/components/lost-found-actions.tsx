"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LostFoundStatus } from "@prisma/client";

export function LostFoundActions({ itemId, status }: { itemId: string; status: LostFoundStatus }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function setStatus(next: LostFoundStatus) {
    setLoading(true);
    await fetch(`/api/lost-found/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="flex gap-2">
      {status !== "CLAIMED" && (
        <button
          onClick={() => setStatus("CLAIMED")}
          disabled={loading}
          className="rounded-lg bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          Claimed
        </button>
      )}
      {status !== "DISPOSED" && (
        <button
          onClick={() => setStatus("DISPOSED")}
          disabled={loading}
          className="rounded-lg border border-border px-3 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
        >
          Dispose
        </button>
      )}
      {status !== "STORED" && (
        <button
          onClick={() => setStatus("STORED")}
          disabled={loading}
          className="rounded-lg border border-border px-3 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
        >
          Restock
        </button>
      )}
    </div>
  );
}
