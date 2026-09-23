"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TicketStatus } from "@prisma/client";

const STATUS_FLOW: TicketStatus[] = ["OPEN", "ASSIGNED", "WORKING", "WAITING_PARTS", "COMPLETED"];

export function MaintenanceStatusButton({ ticketId, currentStatus }: { ticketId: string; currentStatus: TicketStatus }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const currentIndex = STATUS_FLOW.indexOf(currentStatus);
  const nextStatus = STATUS_FLOW[Math.min(currentIndex + 1, STATUS_FLOW.length - 1)];

  async function advanceStatus() {
    if (currentStatus === "COMPLETED") return;
    setLoading(true);
    await fetch(`/api/maintenance/${ticketId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    setLoading(false);
    router.refresh();
  }

  if (currentStatus === "COMPLETED") {
    return <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800">Completed</span>;
  }

  return (
    <button
      onClick={advanceStatus}
      disabled={loading}
      className="rounded-xl bg-primary px-3 py-1 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
    >
      {loading ? "..." : `Move to ${nextStatus.replace(/_/g, " ")}`}
    </button>
  );
}
