import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePassword } from "./api";
import { FormError, PASSWORD_HINT, errorText } from "./AuthCard";
import { label } from "./format";
import { useMe } from "./session";
import { TwoFactorCard } from "./TwoFactor";

export default function Account() {
  const me = useMe();
  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="text-xl font-semibold">Account</h1>
      <Card>
        <CardContent className="pt-6 text-sm grid grid-cols-[8rem_1fr] gap-y-2">
          <span className="text-muted-foreground">Name</span>
          <span>{me.user.name || "—"}</span>
          <span className="text-muted-foreground">Email</span>
          <span>{me.user.email}</span>
          <span className="text-muted-foreground">Organization</span>
          <span>{me.org.name}</span>
          <span className="text-muted-foreground">Role</span>
          <span>{label(me.role)}</span>
        </CardContent>
      </Card>
      <ChangePassword />
      <TwoFactorCard />
    </div>
  );
}

function ChangePassword() {
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [error, setError] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [k]: e.target.value });
    if (k !== "current") setMismatch(false); // editing either new-password field clears the mismatch
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (form.next !== form.confirm) {
      setMismatch(true);
      return;
    }
    setBusy(true);
    try {
      await changePassword(form.current, form.next);
      setForm({ current: "", next: "", confirm: "" });
      setDone(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <h2 className="font-medium">Change password</h2>
        <p className="text-sm text-muted-foreground">You'll stay signed in here; other devices are signed out.</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="current">Current password</Label>
            <Input id="current" type="password" required value={form.current} onChange={set("current")} autoComplete="current-password" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="next">New password</Label>
            <Input id="next" type="password" required minLength={12} value={form.next} onChange={set("next")} autoComplete="new-password" />
            <p className="text-xs text-muted-foreground">{PASSWORD_HINT}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirm new password</Label>
            <Input
              id="confirm"
              type="password"
              required
              value={form.confirm}
              onChange={set("confirm")}
              autoComplete="new-password"
              aria-invalid={mismatch || undefined}
              aria-describedby={mismatch ? "confirm-error" : undefined}
            />
            <FormError id="confirm-error" error={mismatch ? "The new passwords don't match" : null} />
          </div>
          <FormError error={error} />
          {done && (
            <p role="status" className="text-sm text-muted-foreground">
              Password changed. Other devices have been signed out.
            </p>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? "Please wait…" : "Change password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
