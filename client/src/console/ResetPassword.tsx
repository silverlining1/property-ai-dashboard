import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPassword } from "./api";
import { AuthCard, FormError, PASSWORD_HINT, errorText } from "./AuthCard";
import { leaveEmailLink } from "./emailLinks";

export default function ResetPassword({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setMismatch(true);
      return;
    }
    setBusy(true);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <AuthCard title="Password changed" description="You've been signed out everywhere. Sign in with your new password.">
        <Button className="w-full" onClick={() => leaveEmailLink("/")}>
          Sign in
        </Button>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Choose a new password" description="Changing it signs you out on every device.">
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="password">New password</Label>
          <Input id="password" type="password" required minLength={12} value={password} onChange={(e) => { setPassword(e.target.value); setMismatch(false); }} autoComplete="new-password" />
          <p className="text-xs text-muted-foreground">{PASSWORD_HINT}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm">Confirm new password</Label>
          <Input
            id="confirm"
            type="password"
            required
            value={confirm}
            onChange={(e) => { setConfirm(e.target.value); setMismatch(false); }}
            autoComplete="new-password"
            aria-invalid={mismatch || undefined}
            aria-describedby={mismatch ? "confirm-error" : undefined}
          />
          <FormError id="confirm-error" error={mismatch ? "The passwords don't match" : null} />
        </div>
        <FormError error={error} />
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Please wait…" : "Change password"}
        </Button>
      </form>
    </AuthCard>
  );
}
