"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CleaningStatus, RoomStatus, UserRole } from "@prisma/client";
import { Loader2 } from "lucide-react";
import { offlineAwareFetch } from "@/lib/offline/queue";

interface RoomActionsProps {
  roomId: string;
  status: RoomStatus;
  cleaningStatus: CleaningStatus;
  userRole: UserRole;
  isVip?: boolean;
  isRush?: boolean;
}

const MANAGER_ROLES: UserRole[] = [
  UserRole.FRONT_DESK,
  UserRole.GENERAL_MANAGER,
  UserRole.OWNER,
  UserRole.EXECUTIVE_HOUSEKEEPER,
];

export function RoomActions({
  roomId,
  status,
  cleaningStatus,
  userRole,
  isVip,
  isRush,
}: RoomActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const canManage = MANAGER_ROLES.includes(userRole);

  async function performAction(action: string) {
    setLoading(action);
    await offlineAwareFetch(`/api/rooms/${roomId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setLoading(null);
    router.refresh();
  }

  const buttons: { action: string; label: string; show: boolean }[] = [
    {
      action: "start_cleaning",
      label: "Start Cleaning",
      show: status === RoomStatus.VACANT_DIRTY || cleaningStatus === CleaningStatus.NOT_STARTED,
    },
    {
      action: "finish_cleaning",
      label: "Finish Cleaning",
      show: status === RoomStatus.CLEANING || cleaningStatus === CleaningStatus.IN_PROGRESS,
    },
    {
      action: "request_inspection",
      label: "Request Inspection",
      show: status === RoomStatus.VACANT_CLEAN || cleaningStatus === CleaningStatus.COMPLETED,
    },
    { action: "report_issue", label: "Report Issue", show: true },
    { action: "block_ooo", label: "Out of Order", show: canManage && status !== RoomStatus.OUT_OF_ORDER },
    { action: "mark_rush", label: "Rush Clean", show: canManage && !isRush },
    { action: "clear_rush", label: "Clear Rush", show: canManage && !!isRush },
    { action: "mark_vip", label: isVip ? "Clear VIP" : "Mark VIP", show: canManage },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2 className="mb-4 font-semibold">Actions</h2>
      <div className="flex flex-wrap gap-3">
        {buttons
          .filter((b) => b.show)
          .map((btn) => (
            <button
              key={btn.action}
              onClick={() => performAction(btn.action)}
              disabled={loading !== null}
              className="flex items-center gap-2 rounded-xl border border-border bg-white px-4 py-2 text-sm font-medium transition hover:border-primary hover:bg-accent disabled:opacity-50"
            >
              {loading === btn.action && <Loader2 className="h-4 w-4 animate-spin" />}
              {btn.label}
            </button>
          ))}
      </div>
    </div>
  );
}
