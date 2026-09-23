import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { savePublicImage } from "@/lib/save-upload";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contentType = req.headers.get("content-type") || "";
  let roomNumber = "";
  let guestName = "";
  let description = "";
  let storageBin = "";
  let photoUrl: string | null = null;

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      roomNumber = String(form.get("roomNumber") || "");
      guestName = String(form.get("guestName") || "");
      description = String(form.get("description") || "");
      storageBin = String(form.get("storageBin") || "");
      const file = form.get("file");
      if (file instanceof File && file.size > 0) {
        photoUrl = await savePublicImage(file, "lost-found");
      }
    } else {
      const body = await req.json();
      roomNumber = String(body.roomNumber || "");
      guestName = String(body.guestName || "");
      description = String(body.description || "");
      storageBin = String(body.storageBin || "");
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (!description.trim()) return NextResponse.json({ error: "Description required" }, { status: 400 });

  const item = await prisma.lostFoundItem.create({
    data: {
      hotelId: session.user.hotelId,
      roomNumber: roomNumber.trim() || null,
      guestName: guestName.trim() || null,
      description: description.trim(),
      storageBin: storageBin.trim() || null,
      photoUrl,
      foundById: session.user.id,
      status: "STORED",
    },
  });

  return NextResponse.json({ success: true, item });
}
