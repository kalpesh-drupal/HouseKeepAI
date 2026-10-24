import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const PREFIX = "v1:";

function encryptionKey() {
  const raw = process.env.PMS_CREDENTIALS_KEY || process.env.NEXTAUTH_SECRET;
  if (!raw) {
    throw new Error("Set PMS_CREDENTIALS_KEY (or NEXTAUTH_SECRET) to store PMS portal passwords.");
  }
  return createHash("sha256").update(raw).digest();
}

/** Encrypt a secret for database storage. Never log the plaintext. */
export function encryptSecret(plaintext: string) {
  const key = encryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptSecret(payload: string) {
  if (!payload.startsWith(PREFIX)) {
    throw new Error("Unrecognized encrypted secret format");
  }
  const [ivB64, tagB64, dataB64] = payload.slice(PREFIX.length).split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Corrupt encrypted secret");
  }
  const key = encryptionKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function maskSecret(value: string | null | undefined) {
  if (!value) return "";
  if (value.length <= 4) return "••••";
  return `••••${value.slice(-2)}`;
}
