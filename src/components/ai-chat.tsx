"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

const SUGGESTIONS = [
  "Which rooms should be cleaned first?",
  "Show today's slowest rooms.",
  "Why is room 108 delayed?",
  "How many towels should I order?",
  "Which rooms have failed inspections?",
  "Show maintenance trends.",
  "Suggest staff assignments.",
];

type Message = { role: "user" | "assistant"; content: string };

export function AiChat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "I'm your HouseKeepAI operations assistant. Ask me about cleaning priority, slow rooms, inventory reorders, maintenance risks, or staff assignments.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function ask(question: string) {
    if (!question.trim() || loading) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setLoading(true);

    const res = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    const data = await res.json();
    setMessages((prev) => [...prev, { role: "assistant", content: data.answer || "I couldn't process that." }]);
    setLoading(false);
  }

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card">
      <div className="border-b border-border p-4">
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => ask(s)}
              className="rounded-full border border-border bg-muted px-3 py-1 text-xs hover:border-primary hover:bg-accent"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[420px] space-y-4 overflow-y-auto p-6">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm ${
                m.role === "user" ? "bg-primary text-white" : "bg-muted text-foreground"
              }`}
            >
              {m.role === "assistant" && (
                <div className="mb-1 flex items-center gap-1 text-xs font-medium text-primary">
                  <Sparkles className="h-3 w-3" /> AI Assistant
                </div>
              )}
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Analyzing hotel operations data...
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="flex gap-2 border-t border-border p-4"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a manager question..."
          className="flex-1 rounded-xl border border-border px-4 py-3 text-sm outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-primary px-5 py-3 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
        >
          Ask
        </button>
      </form>
    </div>
  );
}
