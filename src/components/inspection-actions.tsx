"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";

export function InspectionActions({ inspectionId }: { inspectionId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  async function handleAction(action: string) {
    setLoading(action);
    await fetch(`/api/inspections/${inspectionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setLoading(null);
    router.refresh();
  }

  return (
    <div className="flex gap-3">
      <button
        onClick={() => handleAction("approve")}
        disabled={loading !== null}
        className="rounded-xl bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
      >
        {loading === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Approve"}
      </button>
      <button
        onClick={() => handleAction("reject")}
        disabled={loading !== null}
        className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
      >
        {loading === "reject" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reject"}
      </button>
    </div>
  );
}
