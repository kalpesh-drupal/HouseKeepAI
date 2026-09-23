import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { answerAiQuestion, buildAiInsights } from "@/lib/ai";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const insights = await buildAiInsights(session.user.hotelId);
  return NextResponse.json({ insights });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { question } = await req.json();
  if (!question?.trim()) return NextResponse.json({ error: "Question required" }, { status: 400 });

  const result = await answerAiQuestion(session.user.hotelId, question);
  return NextResponse.json(result);
}
