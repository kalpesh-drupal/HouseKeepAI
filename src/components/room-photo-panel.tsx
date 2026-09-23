"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Camera, Loader2 } from "lucide-react";

type Photo = {
  id: string;
  url: string;
  type: string;
  caption: string | null;
  createdAt: string | Date;
};

export function RoomPhotoPanel({
  roomId,
  photos,
}: {
  roomId: string;
  photos: Photo[];
}) {
  const router = useRouter();
  const [type, setType] = useState<"before" | "after" | "general" | "maintenance">("before");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    form.append("type", type);
    const res = await fetch(`/api/rooms/${roomId}/photos`, { method: "POST", body: form });
    const data = await res.json();
    setLoading(false);
    e.target.value = "";
    if (!data.success) {
      setError(data.error || "Upload failed");
      return;
    }
    router.refresh();
  }

  const before = photos.filter((p) => p.type === "before");
  const after = photos.filter((p) => p.type === "after");
  const other = photos.filter((p) => p.type !== "before" && p.type !== "after");

  return (
    <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Cleaning Photos</h2>
          <p className="text-sm text-muted-foreground">Before / after verification for quality assurance</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
            className="rounded-xl border border-border px-3 py-2 text-sm"
          >
            <option value="before">Before</option>
            <option value="after">After</option>
            <option value="general">General</option>
            <option value="maintenance">Maintenance</option>
          </select>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-blue-800">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            Upload
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} disabled={loading} />
          </label>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid gap-4 md:grid-cols-2">
        <PhotoGroup title="Before" items={before} />
        <PhotoGroup title="After" items={after} />
      </div>
      {other.length > 0 && <PhotoGroup title="Other" items={other} />}
    </div>
  );
}

function PhotoGroup({ title, items }: { title: string; items: Photo[] }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium text-muted-foreground">{title} ({items.length})</h3>
      {items.length === 0 ? (
        <div className="flex h-28 items-center justify-center rounded-xl border border-dashed border-border text-xs text-muted-foreground">
          No {title.toLowerCase()} photos
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {items.slice(0, 4).map((p) => (
            <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-xl border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.caption || title} className="h-28 w-full object-cover transition group-hover:scale-105" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
