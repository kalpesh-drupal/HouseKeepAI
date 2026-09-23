import { requireAuth } from "@/lib/session";
import { getMessages, getHotelUsers } from "@/lib/queries";
import { prisma } from "@/lib/prisma";
import { ROLE_LABELS } from "@/lib/utils";
import { MessageComposer } from "@/components/message-composer";
import Link from "next/link";

export default async function MessagesPage() {
  const session = await requireAuth();
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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Messaging</h1>
        <p className="text-muted-foreground">
          Channels, room links, and staff-to-staff chat
        </p>
      </div>

      <MessageComposer users={recipients} rooms={rooms} />

      <div className="rounded-2xl border border-border bg-card">
        {messages.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">No messages yet</div>
        ) : (
          <div className="divide-y divide-border">
            {messages.map((msg) => (
              <div key={msg.id} className="p-6">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{msg.sender.name}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{ROLE_LABELS[msg.sender.role]}</span>
                    {msg.channel !== "GENERAL" && (
                      <span className="text-xs text-muted-foreground">· {msg.channel.replace(/_/g, " ")}</span>
                    )}
                    {!msg.read && msg.receiverId === session.user.id && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-800">NEW</span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(msg.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm">{msg.content}</p>
                {msg.roomId && (
                  <Link href={`/rooms/${msg.roomId}`} className="mt-2 inline-block text-sm text-primary hover:underline">
                    View linked room →
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
