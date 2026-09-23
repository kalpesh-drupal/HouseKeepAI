"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { VoiceNoteInput } from "@/components/voice-note-input";

export function RoomNotesEditor({
  roomId,
  guestNotes,
  frontDeskNotes,
}: {
  roomId: string;
  guestNotes: string | null;
  frontDeskNotes: string | null;
}) {
  const router = useRouter();
  const [guest, setGuest] = useState(guestNotes || "");
  const [frontDesk, setFrontDesk] = useState(frontDeskNotes || "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await fetch(`/api/rooms/${roomId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_notes", guestNotes: guest, frontDeskNotes: frontDesk }),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-6">
      <h2 className="font-semibold">Notes (text or voice)</h2>
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">Guest notes</p>
        <VoiceNoteInput value={guest} onChange={setGuest} placeholder="Guest preferences..." />
      </div>
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">Front desk notes</p>
        <VoiceNoteInput value={frontDesk} onChange={setFrontDesk} placeholder="Ops notes..." />
      </div>
      <button
        onClick={save}
        disabled={saving}
        className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save notes"}
      </button>
    </div>
  );
}
