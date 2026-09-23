import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

export async function savePublicImage(file: File, folder: string) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image uploads are allowed");
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("Max file size is 8MB");
  }

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const safeExt = ["jpg", "jpeg", "png", "webp", "gif"].includes(ext) ? ext : "jpg";
  const filename = `${Date.now()}-${randomUUID().slice(0, 8)}.${safeExt}`;
  const dir = path.join(process.cwd(), "public", "uploads", folder);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), Buffer.from(await file.arrayBuffer()));
  return `/uploads/${folder}/${filename}`;
}
