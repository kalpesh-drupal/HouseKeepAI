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
  /\b(?:code|passcode|verification|otp|duo|security)\s*(?:is|:)?\s*([0-9]{4,8})\b/i,
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

/**
 * Poll IMAP for a recent message containing a numeric OTP.
 * Prefers unread mail; falls back to recent messages in the mailbox.
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

  const client = new ImapFlow({
    host,
    port,
    secure: port === 993,
    auth: { user, pass: password },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock(mailbox);
    try {
      while (Date.now() < deadline) {
        const code = await scanMailbox(client, since);
        if (code) return code;
        await new Promise((r) => setTimeout(r, 4000));
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }

  throw new Error(
    "No SynXis/Duo email code found in time. Check the bot inbox, spam folder, and that SynXis sent an email OTP."
  );
}

async function scanMailbox(client: ImapFlow, since: Date): Promise<string | null> {
  // Newest first among recent messages
  const uids = await client.search({ since }, { uid: true });
  if (!uids || uids.length === 0) return null;

  const recent = [...uids].sort((a, b) => b - a).slice(0, 15);
  for (const uid of recent) {
    const msg = await client.fetchOne(
      uid,
      { source: true, envelope: true },
      { uid: true }
    );
    if (!msg || !("source" in msg) || !msg.source) continue;

    const envelope = "envelope" in msg ? msg.envelope : null;
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

    // Prefer messages that look like auth mail
    const authish = /duo|synxis|sabre|verif|passcode|security|one.?time|login/i.test(blob);
    const code = extractCode(blob);
    if (code && (authish || /^\d{6}$/.test(code))) {
      // Mark seen so we don't reuse stale codes next time
      await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true }).catch(() => undefined);
      return code;
    }
  }
  return null;
}
