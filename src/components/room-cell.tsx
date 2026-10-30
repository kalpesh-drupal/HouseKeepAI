import { RoomStatus } from "@prisma/client";
import Link from "next/link";
import { ROOM_STATUS_CONFIG, cn } from "@/lib/utils";
import { pmsRoomLabel, type PortalPms } from "@/lib/pms/pms-labels";
import { changeBeddingDue, type StayDate } from "@/lib/stay";

interface RoomCellProps {
  id: string;
  number: string;
  status: RoomStatus;
  isVip?: boolean;
  isRush?: boolean;
  compact?: boolean;
  type?: string;
  assignee?: string | null;
  guestStatus?: string | null;
  arrivalDate?: StayDate;
  departureDate?: StayDate;
  doNotDisturb?: boolean;
  pmsProvider?: PortalPms;
}

export function RoomCell({
  id,
  number,
  status,
  isVip,
  isRush,
  compact,
  type,
  assignee,
  guestStatus,
  arrivalDate,
  departureDate,
  doNotDisturb,
  pmsProvider = null,
}: RoomCellProps) {
  const config = ROOM_STATUS_CONFIG[status];
  const label = pmsRoomLabel(status, guestStatus, pmsProvider);
  const bedding = changeBeddingDue(guestStatus, arrivalDate, departureDate);

  return (
    <Link
      href={`/rooms/${id}`}
      title={label}
      className={cn(
        "group relative flex flex-col items-center justify-center rounded-xl border-2 border-transparent transition hover:scale-105 hover:border-primary hover:shadow-lg",
        config.bg,
        compact ? "h-16 w-16" : type ? "min-h-20 w-24 px-1 py-2" : "h-20 w-20"
      )}
    >
      <span className={cn("text-lg font-bold", config.text)}>{number}</span>
      {bedding && <span className="px-0.5 text-center text-[8px] font-semibold leading-tight text-orange-800">Change the bedding</span>}
      {doNotDisturb && <span className="text-[8px] font-bold text-zinc-800">DND</span>}
      {type ? (
        <span className="line-clamp-2 px-0.5 text-center text-[9px] leading-tight text-muted-foreground">
          {type}
        </span>
      ) : (
        <>
          <span className="text-xs">{config.emoji}</span>
          <span className="mt-0.5 text-[10px] font-medium text-muted-foreground">{label}</span>
        </>
      )}
      {assignee ? (
        <span className="mt-0.5 line-clamp-1 max-w-full px-0.5 text-center text-[9px] font-medium text-primary">
          {assignee}
        </span>
      ) : null}
      {(isVip || isRush) && (
        <div className="absolute -right-1 -top-1 flex gap-0.5">
          {isVip && <span className="rounded-full bg-amber-400 px-1 text-[9px] font-bold text-white">VIP</span>}
          {isRush && <span className="rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">RUSH</span>}
        </div>
      )}
    </Link>
  );
}
