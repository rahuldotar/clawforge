"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { setAuth } from "@/lib/auth";
import { login } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100";

type AuthMode = { methods: string[] };

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [authMethods, setAuthMethods] = useState<string[]>([]);

  const expired = searchParams.get("expired") === "1";

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/auth/mode`)
      .then((res) => res.json())
      .then((data: AuthMode) => setAuthMethods(data.methods ?? []))
      .catch(() => setAuthMethods(["password"]));
  }, []);

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await login(email, password);

      setAuth({
        accessToken: data.accessToken,
        orgId: data.orgId,
        userId: data.userId,
        email: data.email ?? email,
        role: data.roles?.[0] ?? "admin",
      });

      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleSsoLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grantType: "id_token",
          idToken: "dev-token",
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Login failed (${res.status}): ${text}`);
      }

      const data = await res.json();
      setAuth({
        accessToken: data.accessToken,
        orgId: data.orgId,
        userId: data.userId,
        email: data.email ?? email,
        role: data.role ?? "admin",
      });

      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  const showPasswordLogin = authMethods.includes("password");

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm">
        <div className="bg-card rounded-lg border border-border p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-primary mb-1">ClawForge</h1>
          <p className="text-sm text-muted-foreground mb-6">Admin Console</p>

          {expired && (
            <div className="mb-4 p-3 rounded-md text-sm bg-amber-500/10 text-amber-600 border border-amber-500/20">
              Session expired. Please sign in again.
            </div>
          )}

          {showPasswordLogin ? (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium mb-1">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="admin@example.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium mb-1">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Enter your password"
                />
              </div>

              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {loading ? "Signing in..." : "Sign in"}
              </button>

              {authMethods.includes("sso") && (
                <button
                  type="button"
                  onClick={handleSsoLogin as unknown as () => void}
                  disabled={loading}
                  className="w-full px-4 py-2 border border-border text-foreground rounded-md text-sm font-medium hover:bg-secondary disabled:opacity-50 transition-colors"
                >
                  Sign in with SSO
                </button>
              )}
            </form>
          ) : (
            <form onSubmit={handleSsoLogin} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium mb-1">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="admin@example.com"
                />
              </div>

              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {loading ? "Signing in..." : "Sign in with SSO"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
