"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LaundryStatus } from "@prisma/client";

const FLOW: LaundryStatus[] = ["DIRTY", "WASHING", "DRYING", "READY", "DELIVERED"];

export function LaundryAdvance({ batchId, status }: { batchId: string; status: LaundryStatus }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const next = FLOW[Math.min(FLOW.indexOf(status) + 1, FLOW.length - 1)];

  if (status === "DELIVERED") {
    return <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800">Delivered</span>;
  }

  return (
    <button
      onClick={async () => {
        setLoading(true);
        await fetch(`/api/laundry/${batchId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ advance: true }),
        });
        setLoading(false);
        router.refresh();
      }}
      disabled={loading}
      className="rounded-xl bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
    >
      {loading ? "..." : `→ ${next}`}
    </button>
  );
}
