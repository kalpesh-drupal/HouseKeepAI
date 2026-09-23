"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Camera } from "lucide-react";

export function MobilePhotoUpload({ roomId }: { roomId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function upload(type: "before" | "after", file: File) {
    setLoading(true);
    const form = new FormData();
    form.append("file", file);
    form.append("type", type);
    await fetch(`/api/rooms/${roomId}/photos`, { method: "POST", body: form });
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {(["before", "after"] as const).map((type) => (
        <label
          key={type}
          className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-border bg-card px-3 py-4 text-sm font-medium"
        >
          <Camera className="h-5 w-5 text-primary" />
          {loading ? "..." : type === "before" ? "Photo Before" : "Photo After"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            disabled={loading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(type, f);
            }}
          />
        </label>
      ))}
    </div>
  );
}
