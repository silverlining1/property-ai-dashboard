import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login, publicPost, signup, type MfaChallenge } from "./api";
import { AuthCard, FormError, PASSWORD_HINT, errorText } from "./AuthCard";
import { useSession } from "./session";
import { SecondStep } from "./TwoFactor";

type Mode = "login" | "signup" | "forgot";

const TITLES: Record<Mode, string> = { login: "Sign in", signup: "Create your organization", forgot: "Reset your password" };
const DESCRIPTIONS: Record<Mode, string> = {
  login: "Review and approve what your AI assistant drafts.",
  signup: "You'll be the owner and can invite your team afterwards.",
  forgot: "We'll email you a link to choose a new password.",
};

export default function Login() {
  const { signedIn } = useSession();
  const [mode, setMode] = useState<Mode>("login");
  const [form, setForm] = useState({ org: "", name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetSentTo, setResetSentTo] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<MfaChallenge | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  function switchTo(next: Mode) {
    if (busy) return; // a pending request must not land on a different view
    setMode(next);
    setError(null);
    setResetSentTo(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "forgot") {
        const email = form.email;
        await publicPost("/v1/auth/password-reset", { email });
        setResetSentTo(email);
        return;
      }
      if (mode === "login") {
        const pending = await login(form.email, form.password);
        if (pending) {
          setChallenge(pending); // the password checked out; the second step signs in
          return;
        }
      } else {
        await signup(form.org, form.name, form.email, form.password);
      }
      await signedIn();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (challenge) {
    return (
      <SecondStep
        challenge={challenge}
        onSignedIn={signedIn}
        onCancel={() => {
          setChallenge(null);
          setForm({ ...form, password: "" });
        }}
      />
    );
  }

  if (resetSentTo !== null) {
    return (
      <AuthCard title="Check your email" description={`If ${resetSentTo} has a PropAI account, we've sent it a link to reset the password.`}>
        <p className="text-sm text-muted-foreground">The link works once and expires in an hour.</p>
        <Button variant="outline" className="w-full mt-4" onClick={() => switchTo("login")}>
          Back to sign in
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={TITLES[mode]} description={DESCRIPTIONS[mode]}>
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
        {mode !== "forgot" && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              {mode === "login" && (
                <button type="button" className="text-xs text-primary underline-offset-4 hover:underline" disabled={busy} onClick={() => switchTo("forgot")}>
                  Forgot password?
                </button>
              )}
            </div>
            <Input
              id="password"
              type="password"
              required
              minLength={mode === "signup" ? 12 : undefined}
              value={form.password}
              onChange={set("password")}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
            {mode === "signup" && <p className="text-xs text-muted-foreground">{PASSWORD_HINT}</p>}
          </div>
        )}
        <FormError error={error} />
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Please wait…" : mode === "login" ? "Sign in" : mode === "signup" ? "Create account" : "Email me a reset link"}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        {mode === "signup" ? "Already have an account?" : mode === "forgot" ? "Remembered it?" : "New to PropAI?"}{" "}
        <button
          type="button"
          className="text-primary underline-offset-4 hover:underline"
          disabled={busy}
          onClick={() => switchTo(mode === "login" ? "signup" : "login")}
        >
          {mode === "login" ? "Create an organization" : "Sign in"}
        </button>
      </p>
    </AuthCard>
  );
}
