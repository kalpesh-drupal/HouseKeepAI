"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { GuestRequestStatus } from "@prisma/client";

export function GuestRequestActions({ requestId, status }: { requestId: string; status: GuestRequestStatus }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function update(body: Record<string, unknown>) {
    setLoading(true);
    await fetch(`/api/guest-requests/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="flex gap-2">
      {status === "OPEN" && (
        <button
          onClick={() => update({ assignToMe: true })}
          disabled={loading}
          className="rounded-lg bg-primary px-3 py-1 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-50"
        >
          Assign to Me
        </button>
      )}
      {status !== "COMPLETED" && (
        <button
          onClick={() => update({ status: "COMPLETED" })}
          disabled={loading}
          className="rounded-lg bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          Complete
        </button>
      )}
    </div>
  );
}
