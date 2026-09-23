import { requireAuth } from "@/lib/session";
import { getLostFoundItems } from "@/lib/queries";
import { MobileLostFoundForm } from "@/components/mobile-lost-found-form";

export default async function MobileLostFoundPage() {
  const session = await requireAuth(undefined, "/login?callbackUrl=/m/lost-found");
  const items = await getLostFoundItems(session.user.hotelId);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Lost & Found</h2>
        <p className="text-sm text-muted-foreground">Log items with a photo. Front desk can see these too.</p>
      </div>

      <MobileLostFoundForm />

      <div className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No items logged yet.</p>
        ) : (
          items.slice(0, 30).map((item) => (
            <div key={item.id} className="rounded-2xl border border-border bg-card p-4">
              {item.photoUrl && (
                <a href={item.photoUrl} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.photoUrl} alt="" className="mb-3 h-36 w-full rounded-xl object-cover" />
                </a>
              )}
              <p className="font-medium">{item.description}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Room {item.roomNumber || "—"} · {item.guestName || "No guest"} · {item.status}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {item.foundBy?.name || "Staff"} · {new Date(item.foundAt).toLocaleString()}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
