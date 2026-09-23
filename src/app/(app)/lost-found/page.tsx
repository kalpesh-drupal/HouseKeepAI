import { requireAuth } from "@/lib/session";
import { getLostFoundItems } from "@/lib/queries";
import { LostFoundActions } from "@/components/lost-found-actions";
import { LostFoundCreateForm } from "@/components/lost-found-create-form";
import Link from "next/link";

export default async function LostFoundPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; room?: string; status?: string }>;
}) {
  const session = await requireAuth();
  const params = await searchParams;
  const items = await getLostFoundItems(session.user.hotelId, params);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Lost & Found</h1>
        <p className="text-muted-foreground">Search by guest, room, or description</p>
      </div>

      <form className="flex flex-wrap gap-3">
        <input
          name="q"
          defaultValue={params.q}
          placeholder="Search guest / description"
          className="rounded-xl border border-border px-4 py-2 text-sm"
        />
        <input
          name="room"
          defaultValue={params.room}
          placeholder="Room"
          className="w-28 rounded-xl border border-border px-4 py-2 text-sm"
        />
        <select name="status" defaultValue={params.status || ""} className="rounded-xl border border-border px-4 py-2 text-sm">
          <option value="">All statuses</option>
          <option value="STORED">Stored</option>
          <option value="CLAIMED">Claimed</option>
          <option value="DISPOSED">Disposed</option>
        </select>
        <button type="submit" className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-blue-800">
          Search
        </button>
        <Link href="/lost-found" className="rounded-xl border border-border px-4 py-2 text-sm hover:bg-muted">
          Clear
        </Link>
      </form>

      <LostFoundCreateForm />

      <div className="space-y-3">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-12 text-center text-muted-foreground">No items found</div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold">{item.description}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Room {item.roomNumber || "—"} · Guest {item.guestName || "—"} · Bin {item.storageBin || "—"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Found by {item.foundBy?.name || "Unknown"} on {new Date(item.foundAt).toLocaleDateString()} · {item.status}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {item.photoUrl && (
                    <a href={item.photoUrl} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.photoUrl} alt="" className="h-16 w-16 rounded-lg object-cover" />
                    </a>
                  )}
                  <LostFoundActions itemId={item.id} status={item.status} />
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
