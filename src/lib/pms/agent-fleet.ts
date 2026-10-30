import { PmsProvider } from "@prisma/client";

const PORTAL_PROVIDERS = [PmsProvider.SKYTOUCH, PmsProvider.SYNXIS] as const;

/**
 * Which portal types this worker logs into.
 * Unset = both. Example: PMS_AGENT_PROVIDERS=SKYTOUCH
 */
export function agentProviders(): PmsProvider[] {
  const raw = process.env.PMS_AGENT_PROVIDERS?.trim();
  if (!raw) return [...PORTAL_PROVIDERS];
  const wanted = new Set(raw.split(",").map((part) => part.trim().toUpperCase()));
  const list = PORTAL_PROVIDERS.filter((provider) => wanted.has(provider));
  return list.length ? [...list] : [...PORTAL_PROVIDERS];
}

function slotCount() {
  const n = Number(process.env.PMS_AGENT_SLOTS || "1");
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

function slotIndex(): number | null {
  const raw = process.env.PMS_AGENT_SLOT;
  if (raw == null || raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

/** `all`, or `0/4` when this process owns one slice of hotels. */
export function agentSlotLabel(): string {
  const slots = slotCount();
  const slot = slotIndex();
  if (slots <= 1 || slot == null || slot >= slots) return "all";
  return `${slot}/${slots}`;
}

/**
 * Stable split so two workers with the same SLOTS and different SLOT
 * never log into the same hotel. Unset SLOT or SLOTS means this process owns every hotel.
 */
export function agentOwnsHotel(hotelId: string): boolean {
  const slots = slotCount();
  const slot = slotIndex();
  if (slots <= 1 || slot == null || slot >= slots) return true;
  let hash = 2166136261;
  for (let i = 0; i < hotelId.length; i++) {
    hash ^= hotelId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % slots === slot;
}
