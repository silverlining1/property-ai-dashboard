import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { acceptInvitation, publicPost, type InvitationPreview } from "./api";
import { AuthCard, FormError, PASSWORD_HINT, errorText } from "./AuthCard";
import { leaveEmailLink } from "./emailLinks";
import { label } from "./format";
import { useSession } from "./session";

export default function AcceptInvite({ token }: { token: string }) {
  const { signedIn } = useSession();
  const preview = useQuery({
    queryKey: ["invitation-preview", token],
    queryFn: () => publicPost<InvitationPreview>("/v1/invitations/preview", { token }),
    // Fetched once per visit and dropped on leaving: a cached copy would outlive the (single-use) invitation.
    staleTime: Infinity,
    gcTime: 0,
  });
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await acceptInvitation(token, password, name);
      await signedIn();
      leaveEmailLink("/approvals");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (preview.isLoading) return <AuthCard title="Checking your invitation…">{null}</AuthCard>;
  if (preview.error || !preview.data) {
    return (
      <AuthCard title="This invitation can't be used" description="It may have expired, been replaced by a newer one, or already been accepted.">
        <p className="text-sm text-muted-foreground">Ask whoever invited you to send a new invitation.</p>
        <Button variant="outline" className="w-full mt-4" onClick={() => leaveEmailLink("/")}>
          Go to sign in
        </Button>
      </AuthCard>
    );
  }

  const inv = preview.data;
  return (
    <AuthCard
      title={`Join ${inv.org_name}`}
      description={`You've been invited as ${label(inv.role).toLowerCase()} with ${inv.email}.`}
    >
      <form onSubmit={submit} className="space-y-4">
        {inv.account_exists ? (
          <p className="text-sm text-muted-foreground">You already have a PropAI account. Enter its password to join.</p>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="name">Your name</Label>
            <Input id="name" value={name} placeholder={inv.name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="password">{inv.account_exists ? "Password" : "Choose a password"}</Label>
          <Input
            id="password"
            type="password"
            required
            minLength={inv.account_exists ? undefined : 12}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={inv.account_exists ? "current-password" : "new-password"}
          />
          {!inv.account_exists && <p className="text-xs text-muted-foreground">{PASSWORD_HINT}</p>}
        </div>
        <FormError error={error} />
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Please wait…" : `Join ${inv.org_name}`}
        </Button>
      </form>
    </AuthCard>
  );
}
