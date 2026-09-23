import { requireAuth } from "@/lib/session";
import { getHotelUsers, getMessages } from "@/lib/queries";
import { prisma } from "@/lib/prisma";
import { MessageComposer } from "@/components/message-composer";
import { ROLE_LABELS } from "@/lib/utils";
import Link from "next/link";

export default async function MobileMessagesPage() {
  const session = await requireAuth(undefined, "/login?callbackUrl=/m/messages");
  const [messages, users, rooms] = await Promise.all([
    getMessages(session.user.hotelId, session.user.id),
    getHotelUsers(session.user.hotelId),
    prisma.room.findMany({
      where: { hotelId: session.user.hotelId },
      select: { id: true, number: true },
      orderBy: { number: "asc" },
    }),
  ]);

  const recipients = users.filter((u) => u.id !== session.user.id);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Team chat</h2>
        <p className="text-sm text-muted-foreground">Message housekeepers, front desk, maintenance, and managers.</p>
      </div>

      <MessageComposer users={recipients} rooms={rooms} />

      <div className="space-y-3">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">No messages yet.</p>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {msg.sender.name}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    {ROLE_LABELS[msg.sender.role]}
                  </span>
                </p>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <p className="text-sm">{msg.content}</p>
              {msg.roomId && (
                <Link href={`/m/rooms/${msg.roomId}`} className="mt-2 inline-block text-xs text-primary">
                  Open room →
                </Link>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
