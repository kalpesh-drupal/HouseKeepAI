/**
 * Fetch a one-time login code from IMAP (SynXis / Duo email OTP).
 * Uses a dedicated bot mailbox — never a personal inbox in production.
 */
import { ImapFlow } from "imapflow";

export type ImapOtpConfig = {
  host: string;
  port?: number;
  user: string;
  password: string;
  mailbox?: string;
  /** Only consider mail newer than this many ms (default 10 minutes). */
  maxAgeMs?: number;
  /** How long to poll for a new code (default 90s). */
  waitMs?: number;
};

const CODE_PATTERNS = [
  /\b(?:pass\s*code|passcode|code|verification|otp|duo|security)\s*(?:is|:)?\s*([0-9]{4,8})\b/i,
  /\b([0-9]{6})\b/,
  /\b([0-9]{4,8})\b/,
];

function extractCode(text: string): string | null {
  const cleaned = text.replace(/\s+/g, " ");
  for (const re of CODE_PATTERNS) {
    const m = cleaned.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

function imapErrorMessage(err: unknown, user: string, host: string): string {
  const e = err as {
    message?: string;
    responseText?: string;
    responseStatus?: string;
    authenticationFailed?: boolean;
    code?: string;
  };
  const detail = [e.responseStatus, e.responseText || e.message, e.code].filter(Boolean).join(" — ");
  if (e.authenticationFailed || /auth|login|credentials|invalid credentials/i.test(detail)) {
    return `IMAP login failed for ${user} @ ${host}. Use a Gmail App Password (not the normal password) and confirm IMAP is enabled. (${detail})`;
  }
  return `IMAP error for ${user} @ ${host}: ${detail || "unknown error"}`;
}

/**
 * Poll IMAP for a recent message containing a numeric OTP.
 * Prefers unread mail; falls back to the newest messages in the mailbox.
 */
export async function fetchEmailOtp(config: ImapOtpConfig): Promise<string> {
  const host = config.host.trim();
  const user = config.user.trim();
  const password = config.password;
  if (!host || !user || !password) {
    throw new Error("IMAP host, username, and password are required to read the SynXis email code.");
  }

  const port = config.port && config.port > 0 ? config.port : 993;
  const mailbox = config.mailbox?.trim() || "INBOX";
  const maxAgeMs = config.maxAgeMs ?? 10 * 60 * 1000;
  const waitMs = config.waitMs ?? 90_000;
  const deadline = Date.now() + waitMs;
  const since = new Date(Date.now() - maxAgeMs);

  console.info(`[email-otp] connecting host=${host} port=${port} user=${user} mailbox=${mailbox}`);

  const client = new ImapFlow({
    host,
    port,
    secure: port === 993,
    auth: { user, pass: password },
    logger: false,
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
  });

  try {
    try {
      await client.connect();
    } catch (err) {
      console.error("[email-otp] connect failed", err);
      throw new Error(imapErrorMessage(err, user, host));
    }

    let lock;
    try {
      lock = await client.getMailboxLock(mailbox);
    } catch (err) {
      console.error("[email-otp] mailbox lock failed", err);
      throw new Error(
        `IMAP could not open mailbox "${mailbox}" for ${user}. ${imapErrorMessage(err, user, host)}`
      );
    }

    try {
      let attempt = 0;
      while (Date.now() < deadline) {
        attempt += 1;
        try {
          const code = await scanMailbox(client, since);
          if (code) {
            console.info(`[email-otp] code found on attempt=${attempt}`);
            return code;
          }
        } catch (err) {
          // SEARCH can NO/BAD on some servers — keep polling with fallback strategies
          console.warn(`[email-otp] scan attempt=${attempt} failed:`, imapErrorMessage(err, user, host));
        }
        await new Promise((r) => setTimeout(r, 4000));
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }

  throw new Error(
    `No SynXis passcode email found in time for ${user}. Confirm SEND PASSCODE mailed this inbox (check spam), IMAP App Password is saved on PMS, and mailbox is ${mailbox}.`
  );
}

async function listRecentUids(client: ImapFlow, since: Date): Promise<number[]> {
  // Strategy 1: UNSEEN
  try {
    const unseen = await client.search({ seen: false }, { uid: true });
    if (Array.isArray(unseen) && unseen.length) {
      return [...unseen].sort((a, b) => b - a).slice(0, 20);
    }
  } catch {
    // continue
  }

  // Strategy 2: SINCE date
  try {
    const sinceUids = await client.search({ since }, { uid: true });
    if (Array.isArray(sinceUids) && sinceUids.length) {
      return [...sinceUids].sort((a, b) => b - a).slice(0, 20);
    }
  } catch {
    // continue
  }

  // Strategy 3: newest UIDs from mailbox status (no SEARCH)
  const exists = client.mailbox && typeof client.mailbox === "object" ? Number(client.mailbox.exists || 0) : 0;
  if (exists > 0) {
    const from = Math.max(1, exists - 24);
    const uids: number[] = [];
    try {
      for await (const msg of client.fetch(`${from}:*`, { uid: true }, { uid: false })) {
        if (msg.uid) uids.push(msg.uid);
      }
    } catch {
      // last resort: sequential sequence numbers as UIDs often align on Gmail poorly —
      // try fetching by sequence with uid:true mapping
      try {
        for await (const msg of client.fetch(`${from}:*`, { uid: true })) {
          if (msg.uid) uids.push(msg.uid);
        }
      } catch {
        return [];
      }
    }
    return [...new Set(uids)].sort((a, b) => b - a).slice(0, 20);
  }

  return [];
}

async function scanMailbox(client: ImapFlow, since: Date): Promise<string | null> {
  const recent = await listRecentUids(client, since);
  if (recent.length === 0) return null;

  const sinceMs = since.getTime();
  for (const uid of recent) {
    const msg = await client.fetchOne(uid, { source: true, envelope: true }, { uid: true }).catch(() => null);
    if (!msg || !("source" in msg) || !msg.source) continue;

    const envelope = "envelope" in msg ? msg.envelope : null;
    const date = envelope?.date ? new Date(envelope.date).getTime() : 0;
    if (date && date < sinceMs) continue;

    const subject = envelope?.subject || "";
    const from =
      envelope?.from
        ?.map((a) => {
          const addr = a as { address?: string; mailbox?: string; host?: string };
          if (addr.address) return addr.address;
          if (addr.mailbox && addr.host) return `${addr.mailbox}@${addr.host}`;
          return "";
        })
        .filter(Boolean)
        .join(" ") || "";
    const raw = Buffer.isBuffer(msg.source) ? msg.source.toString("utf8") : String(msg.source);
    const blob = `${subject}\n${from}\n${raw}`;

    const authish =
      /duo|synxis|sabre|aven|verif|pass\s*code|passcode|security|one.?time|login|hospitality/i.test(blob);
    const code = extractCode(blob);
    if (code && (authish || /^\d{6}$/.test(code))) {
      await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true }).catch(() => undefined);
      return code;
    }
  }
  return null;
}
