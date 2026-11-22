export function RoomDeskNotes({
  notes,
}: {
  notes: Array<{ id: string; message: string; createdAt: Date | string }>;
}) {
  const latest = notes.reduce<(typeof notes)[number] | null>((best, note) => {
    if (!best) return note;
    return new Date(note.createdAt).getTime() > new Date(best.createdAt).getTime() ? note : best;
  }, null);
  if (!latest) return null;

  return (
    <div className="mt-3 space-y-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">Desk message</p>
      <p className="text-sm text-amber-950">{latest.message}</p>
      <p className="text-xs text-amber-800/80">
        {new Date(latest.createdAt).toLocaleString([], {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}
      </p>
    </div>
  );
}
