"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Hotel, Loader2 } from "lucide-react";

const DEFAULT_ROOMS = 8;

function buildRoomsByFloor(floors: number, previous: number[], fillWith = DEFAULT_ROOMS) {
  const next: number[] = [];
  for (let i = 0; i < floors; i++) {
    next.push(Math.min(40, Math.max(1, previous[i] ?? fillWith)));
  }
  return next;
}

export function OnboardingForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hotelName, setHotelName] = useState("");
  const [floors, setFloors] = useState(3);
  const [defaultRooms, setDefaultRooms] = useState(DEFAULT_ROOMS);
  const [roomsByFloor, setRoomsByFloor] = useState<number[]>([8, 8, 8]);
  const [importRoomsLater, setImportRoomsLater] = useState(false);
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function updateFloorCount(value: number) {
    const n = Math.min(50, Math.max(1, value || 1));
    setFloors(n);
    setRoomsByFloor((prev) => buildRoomsByFloor(n, prev, defaultRooms));
  }

  function applyDefaultToAll() {
    const count = Math.min(40, Math.max(1, defaultRooms || 1));
    setDefaultRooms(count);
    setRoomsByFloor(Array.from({ length: floors }, () => count));
  }

  function setFloorRooms(index: number, value: number) {
    const count = Math.min(40, Math.max(0, value || 0));
    setRoomsByFloor((prev) => prev.map((r, i) => (i === index ? count : r)));
  }

  const totalRooms = importRoomsLater ? 0 : roomsByFloor.reduce((sum, n) => sum + n, 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!importRoomsLater && totalRooms < 1) {
      setError("Add at least one room, or choose to import rooms from a housekeeping list later");
      return;
    }
    setLoading(true);
    setError("");
    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hotelName,
        floors: importRoomsLater ? Math.max(floors, 1) : floors,
        roomsByFloor: importRoomsLater ? [] : roomsByFloor,
        roomsPerFloor: defaultRooms,
        importRoomsLater,
        ownerName,
        email,
        password,
      }),
    });
    const data = await res.json();
    if (!data.success) {
      setLoading(false);
      setError(data.error || "Setup failed");
      return;
    }

    const login = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (login?.error) {
      setError("Hotel created but login failed — try signing in manually");
      router.push("/login");
      return;
    }
    router.push(data.nextStep === "/upload" ? "/upload?mode=build" : "/dashboard");
    router.refresh();
  }

  return (
    <form
      onSubmit={submit}
      className="mx-auto max-w-lg space-y-4 rounded-2xl border border-border bg-card p-8 shadow-sm"
    >
      <div className="mb-2 flex items-center gap-3">
        <div className="rounded-xl bg-primary p-2 text-white">
          <Hotel className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Set up your hotel</h1>
          <p className="text-sm text-muted-foreground">
            Create your property, floors, rooms, and owner account
          </p>
        </div>
      </div>

      <input
        required
        placeholder="Hotel name"
        value={hotelName}
        onChange={(e) => setHotelName(e.target.value)}
        className="w-full rounded-xl border border-border px-4 py-3 text-sm"
      />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Number of floors</label>
          <input
            type="number"
            min={1}
            max={50}
            value={floors}
            disabled={importRoomsLater}
            onChange={(e) => updateFloorCount(Number(e.target.value))}
            className="w-full rounded-xl border border-border px-4 py-3 text-sm disabled:opacity-50"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Default rooms / floor</label>
          <div className="flex gap-2">
            <input
              type="number"
              min={1}
              max={40}
              value={defaultRooms}
              disabled={importRoomsLater}
              onChange={(e) => setDefaultRooms(Number(e.target.value))}
              className="w-full rounded-xl border border-border px-4 py-3 text-sm disabled:opacity-50"
            />
            <button
              type="button"
              onClick={applyDefaultToAll}
              disabled={importRoomsLater}
              className="shrink-0 rounded-xl border border-border px-3 text-xs font-medium hover:bg-muted disabled:opacity-50"
            >
              Apply all
            </button>
          </div>
        </div>
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
        <input
          type="checkbox"
          className="mt-1"
          checked={importRoomsLater}
          onChange={(e) => setImportRoomsLater(e.target.checked)}
        />
        <span>
          <span className="font-semibold">Build rooms from housekeeping report</span>
          <span className="mt-0.5 block text-emerald-900/80">
            Skip manual room counts. After creating the property you will upload a report to permanently save room
            numbers and room types.
          </span>
        </span>
      </label>

      {!importRoomsLater && (
      <div className="rounded-2xl border border-border bg-muted/40 p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">Rooms per floor</p>
            <p className="text-xs text-muted-foreground">Set a different count for each floor if needed</p>
          </div>
          <p className="text-xs font-medium text-muted-foreground">{totalRooms} rooms total</p>
        </div>
        <div className="grid max-h-64 gap-2 overflow-auto sm:grid-cols-2">
          {roomsByFloor.map((count, index) => (
            <label key={index} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
              <span className="w-16 shrink-0 text-xs font-medium text-muted-foreground">
                Floor {index + 1}
              </span>
              <input
                type="number"
                min={0}
                max={40}
                value={count}
                onChange={(e) => setFloorRooms(index, Number(e.target.value))}
                className="w-full rounded-lg border border-border px-2 py-1.5 text-sm"
              />
            </label>
          ))}
        </div>
      </div>
      )}

      <input
        required
        placeholder="Owner full name"
        value={ownerName}
        onChange={(e) => setOwnerName(e.target.value)}
        className="w-full rounded-xl border border-border px-4 py-3 text-sm"
      />
      <input
        required
        type="email"
        placeholder="Owner email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded-xl border border-border px-4 py-3 text-sm"
      />
      <input
        required
        type="password"
        minLength={8}
        placeholder="Password (min 8 chars)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full rounded-xl border border-border px-4 py-3 text-sm"
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-medium text-white hover:bg-blue-800 disabled:opacity-50"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        Create hotel {importRoomsLater ? "(then build rooms from report)" : `(${totalRooms} rooms)`}
      </button>
    </form>
  );
}
