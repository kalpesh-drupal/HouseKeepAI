"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CleaningStatus, RoomStatus, UserRole } from "@prisma/client";
import { Loader2 } from "lucide-react";
import { offlineAwareFetch } from "@/lib/offline/queue";
import { canChooseCleanOutcome } from "@/lib/mobile-routes";
import { canInspectRooms, canSetRoomHkStatus } from "@/lib/utils";

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
  const deskCanSet = canSetRoomHkStatus(userRole);
  const showOutcome = canChooseCleanOutcome(status, cleaningStatus);
  const awaitingInspection = status === RoomStatus.READY_TO_INSPECT || cleaningStatus === CleaningStatus.NEEDS_INSPECTION;

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
      action: "mark_clean",
      label: "Mark clean",
      show:
        showOutcome ||
        (awaitingInspection && canInspectRooms(userRole)) ||
        (deskCanSet && status !== RoomStatus.OUT_OF_INVENTORY),
    },
    {
      action: "mark_dirty",
      label: "Mark dirty",
      show: deskCanSet && status !== RoomStatus.VACANT_DIRTY && status !== RoomStatus.OUT_OF_INVENTORY,
    },
    {
      action: "ready_to_inspect",
      label: "Ready to inspect",
      show: showOutcome,
    },
    {
      action: "send_back",
      label: "Send back dirty",
      show: awaitingInspection && canInspectRooms(userRole),
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
