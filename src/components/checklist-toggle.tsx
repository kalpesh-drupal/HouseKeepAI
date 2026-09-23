"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { offlineAwareFetch } from "@/lib/offline/queue";

export function ChecklistToggle({ itemId, completed, needsAttention }: { itemId: string; completed: boolean; needsAttention: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function toggle(field: "completed" | "needsAttention") {
    setLoading(true);
    await offlineAwareFetch(`/api/checklist/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => toggle("completed")}
        disabled={loading}
        className={`rounded-lg px-3 py-1 text-sm ${completed ? "bg-green-100 text-green-800" : "bg-muted"}`}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : completed ? "✓ Complete" : "Mark Complete"}
      </button>
      <button
        onClick={() => toggle("needsAttention")}
        disabled={loading}
        className={`rounded-lg px-3 py-1 text-sm ${needsAttention ? "bg-yellow-100 text-yellow-800" : "bg-muted"}`}
      >
        ⚠ Needs Attention
      </button>
    </div>
  );
}
