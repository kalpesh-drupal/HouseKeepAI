export function RoomDeskNotes({
  notes,
}: {
  notes: Array<{ id: string; message: string; createdAt: Date | string }>;
}) {
  if (notes.length === 0) return null;

  return (
    <div className="mt-3 space-y-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">Desk message</p>
      {notes.map((note) => (
        <div key={note.id}>
          <p className="text-sm text-amber-950">{note.message}</p>
          <p className="text-xs text-amber-800/80">
            {new Date(note.createdAt).toLocaleString([], {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        </div>
      ))}
    </div>
  );
}
