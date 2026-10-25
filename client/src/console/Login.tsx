import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login, signup } from "./api";
import { useSession } from "./session";
import { Logo } from "./Logo";

export default function Login() {
  const { signedIn } = useSession();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [form, setForm] = useState({ org: "", name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") await login(form.email, form.password);
      else await signup(form.org, form.name, form.email, form.password);
      await signedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-3">
          <Logo />
          <h1 className="text-xl font-semibold leading-none tracking-tight">
            {mode === "login" ? "Sign in" : "Create your organization"}
          </h1>
          <CardDescription>
            {mode === "login"
              ? "Review and approve what your AI assistant drafts."
              : "You'll be the owner and can invite your team afterwards."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            {mode === "signup" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="org">Company name</Label>
                  <Input id="org" required minLength={2} value={form.org} onChange={set("org")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="name">Your name</Label>
                  <Input id="name" value={form.name} onChange={set("name")} autoComplete="name" />
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={form.email} onChange={set("email")} autoComplete="email" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={mode === "signup" ? 12 : undefined}
                value={form.password}
                onChange={set("password")}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
              {mode === "signup" && (
                <p className="text-xs text-muted-foreground">At least 12 characters, with upper and lower case letters and a number.</p>
              )}
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {mode === "login" ? "New to PropAI?" : "Already have an account?"}{" "}
            <button
              type="button"
              className="text-primary underline-offset-4 hover:underline"
              onClick={() => {
                setMode(mode === "login" ? "signup" : "login");
                setError(null);
              }}
            >
              {mode === "login" ? "Create an organization" : "Sign in"}
            </button>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
