"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ApplyAiAssignmentsButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function apply() {
    setLoading(true);
    setResult(null);
    const res = await fetch("/api/ai/assign", { method: "POST" });
    const data = await res.json();
    setLoading(false);
    if (data.success) {
      setResult(`Assigned ${data.assigned} room(s) using AI suggestions.`);
      router.refresh();
    } else {
      setResult(data.error || "Failed to apply assignments");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        onClick={apply}
        disabled={loading}
        className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
      >
        {loading ? "Applying..." : "Apply AI Staff Assignments"}
      </button>
      {result && <span className="text-sm text-muted-foreground">{result}</span>}
    </div>
  );
}
