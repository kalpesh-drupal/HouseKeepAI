"use client";

import { signIn, getSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Hotel, Loader2 } from "lucide-react";
import { isMobileLoginRequest, mobileHomeForRole } from "@/lib/mobile-home";
import { isMobileViewport } from "@/lib/mobile-routes";

const DEMO_ACCOUNTS = [
  { role: "Owner", email: "owner@hotel.com" },
  { role: "General Manager", email: "gm@hotel.com" },
  { role: "Front Desk", email: "frontdesk@hotel.com" },
  { role: "Executive Housekeeper", email: "ehk@hotel.com" },
  { role: "Housekeeper", email: "housekeeper@hotel.com" },
  { role: "Maintenance", email: "maintenance@hotel.com" },
  { role: "Inspector", email: "inspector@hotel.com" },
];

function desktopCallbackUrl(raw: string | null) {
  if (raw && raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/m")) return raw;
  return "/dashboard";
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("Invalid email or password");
      return;
    }

    const session = await getSession();
    const mobile =
      isMobileLoginRequest(searchParams.get("mobile"), searchParams.get("callbackUrl")) ||
      isMobileViewport();
    router.push(mobile ? mobileHomeForRole(session?.user?.role) : desktopCallbackUrl(searchParams.get("callbackUrl")));
    router.refresh();
  }

  function quickLogin(demoEmail: string) {
    setEmail(demoEmail);
    setPassword("password123");
  }

  return (
    <div className="flex min-h-screen">
      <div className="hidden flex-1 bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-white/10 p-3 backdrop-blur">
              <Hotel className="h-8 w-8" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">HouseKeepAI</h1>
              <p className="text-blue-200">Hotel Operations Platform</p>
            </div>
          </div>
          <div className="mt-16 max-w-md">
            <h2 className="text-4xl font-bold leading-tight">From check-out to room readiness</h2>
            <p className="mt-4 text-lg text-blue-200">
              Real-time room status, housekeeping workflows, inspections, maintenance, and team messaging — all in one place.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="rounded-xl bg-white/10 p-4 backdrop-blur">🟥 Dirty → 🟨 Cleaning → 🟩 Clean → 🟦 Inspected</div>
          <div className="rounded-xl bg-white/10 p-4 backdrop-blur">Role-based views for every team member</div>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <h1 className="text-2xl font-bold">HouseKeepAI</h1>
            <p className="text-muted-foreground">Sign in to open your mobile dashboard</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-border bg-white px-4 py-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                placeholder="you@hotel.com"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-border bg-white px-4 py-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                required
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-medium text-white transition hover:bg-blue-800 disabled:opacity-50"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Sign in
            </button>
          </form>

          <div className="mt-8">
            <p className="mb-3 text-sm font-medium text-muted-foreground">Quick demo login (password: password123)</p>
            <div className="grid gap-2">
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  onClick={() => quickLogin(account.email)}
                  className="rounded-xl border border-border bg-white px-4 py-2 text-left text-sm transition hover:border-primary hover:bg-accent"
                >
                  <span className="font-medium">{account.role}</span>
                  <span className="ml-2 text-muted-foreground">{account.email}</span>
                </button>
              ))}
            </div>
          </div>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            New property?{" "}
            <a href="/onboarding" className="text-primary hover:underline">
              Create hotel
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}
