import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api, canManageTeam, ROLES, type Invitation, type Member, type Role } from "./api";
import { FormError, errorText } from "./AuthCard";
import { ago, label } from "./format";
import { useMe, useSession } from "./session";

const ROLE_HELP: Record<Role, string> = {
  owner: "Everything, including managing owners",
  admin: "Team, connectors, settings and audit log",
  manager: "Approve and send replies",
  staff: "Work orders; sees drafts read-only",
  viewer: "Read-only",
};

const selectClass = "block h-9 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-60";

/** Roles the signed-in user may hand out: only owners can make owners. */
const assignable = (myRole: Role) => ROLES.filter((r) => r !== "owner" || myRole === "owner");

export default function Team() {
  const me = useMe();
  if (!canManageTeam(me.role)) {
    return <p className="text-muted-foreground text-sm">Only owners and admins can manage the team.</p>;
  }
  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-xl font-semibold">Team</h1>
      <RequireTwoFactor />
      <InviteForm />
      <PendingInvitations />
      <Members />
    </div>
  );
}

function RequireTwoFactor() {
  const me = useMe();
  const { refreshMe, updateMfa } = useSession();
  const update = useMutation({
    mutationFn: (require_mfa: boolean) => api("/v1/settings", { method: "PATCH", body: { security: { require_mfa } } }),
    onSuccess: async (_data, require_mfa) => {
      updateMfa({ required: require_mfa });
      await refreshMe().catch(() => undefined);
    },
  });
  const required = update.isPending ? Boolean(update.variables) : me.mfa.required;
  // The API refuses to require it from someone who doesn't have it: they'd be locked out at their next sign-in.
  const blocked = !required && !me.mfa.enabled;

  return (
    <Card>
      <CardContent className="pt-6 space-y-2">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="require-mfa" className="font-medium">
              Require two-factor authentication
            </Label>
            <p className="text-sm text-muted-foreground">
              Everyone must enter a code from an authenticator app (or one of their recovery codes) when signing in.
              Members without it set it up at their next sign-in.
            </p>
            {blocked && (
              <p className="text-sm text-muted-foreground">
                Turn it on for your own account first, on the <a className="text-primary underline-offset-4 hover:underline" href="#/account">Account</a> page.
              </p>
            )}
          </div>
          <Switch id="require-mfa" checked={required} disabled={blocked || update.isPending} onCheckedChange={(v) => update.mutate(v)} />
        </div>
        <FormError error={update.error ? errorText(update.error) : null} />
      </CardContent>
    </Card>
  );
}

function InviteForm() {
  const me = useMe();
  const qc = useQueryClient();
  const [form, setForm] = useState({ email: "", name: "", role: "manager" as Role });
  const [sent, setSent] = useState<string | null>(null);
  const invite = useMutation({
    mutationFn: () => api<Invitation>("/v1/invitations", { method: "POST", body: form }),
    onSuccess: (inv) => {
      setSent(inv.email);
      setForm({ ...form, email: "", name: "" });
      qc.invalidateQueries({ queryKey: ["invitations"] });
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setSent(null);
    invite.mutate();
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <h2 className="font-medium">Invite a teammate</h2>
        <p className="text-sm text-muted-foreground">They'll get an email with a link to join. It expires in 72 hours.</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">Email</Label>
            <Input id="invite-email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-name">Name (optional)</Label>
            <Input id="invite-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-role">Role</Label>
            <select id="invite-role" className={selectClass} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              {assignable(me.role).map((r) => (
                <option key={r} value={r}>
                  {label(r)}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={invite.isPending}>
            {invite.isPending ? "Sending…" : "Send invitation"}
          </Button>
        </form>
        <p className="text-xs text-muted-foreground mt-2">{label(form.role)}: {ROLE_HELP[form.role]}.</p>
        <div className="mt-2">
          <FormError error={invite.error ? errorText(invite.error) : null} />
          {sent && (
            <p role="status" className="text-sm text-muted-foreground">
              Invitation sent to {sent}.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PendingInvitations() {
  const qc = useQueryClient();
  const { data, error } = useQuery({ queryKey: ["invitations"], queryFn: () => api<Invitation[]>("/v1/invitations") });
  const done = () => qc.invalidateQueries({ queryKey: ["invitations"] });
  const revoke = useMutation({ mutationFn: (id: string) => api(`/v1/invitations/${id}`, { method: "DELETE" }), onSuccess: done });
  const resend = useMutation({
    mutationFn: (i: Invitation) => api("/v1/invitations", { method: "POST", body: { email: i.email, name: i.name, role: i.role } }),
    onSuccess: done,
  });

  if (error) return <FormError error={errorText(error)} />;
  if (!data || data.length === 0) return null;
  return (
    <section className="space-y-2" aria-labelledby="pending-heading">
      <h2 id="pending-heading" className="font-medium">
        Pending invitations
      </h2>
      <ul className="divide-y divide-border rounded-md border border-border">
        {data.map((i) => (
          <li key={i.id} data-testid="invitation" className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
            <span className="min-w-0">
              <span className="font-medium">{i.email}</span> <span className="text-muted-foreground">· {label(i.role)}</span>
              {i.expired ? (
                <Badge variant="outline" className="ml-2">Expired</Badge>
              ) : (
                <span className="text-muted-foreground"> · sent {ago(i.created_at)}</span>
              )}
            </span>
            <span className="flex gap-2">
              <Button size="sm" variant="outline" disabled={resend.isPending} onClick={() => resend.mutate(i)}>
                Resend
              </Button>
              <Button size="sm" variant="ghost" disabled={revoke.isPending} onClick={() => revoke.mutate(i.id)}>
                Revoke
              </Button>
            </span>
          </li>
        ))}
      </ul>
      <FormError error={revoke.error ? errorText(revoke.error) : resend.error ? errorText(resend.error) : null} />
    </section>
  );
}

function Members() {
  const me = useMe();
  const { data, isLoading, error } = useQuery({ queryKey: ["members"], queryFn: () => api<Member[]>("/v1/users") });
  if (isLoading) return <p className="text-muted-foreground text-sm">Loading…</p>;
  if (error) return <FormError error={errorText(error)} />;
  return (
    <section className="space-y-2" aria-labelledby="members-heading">
      <h2 id="members-heading" className="font-medium">
        Members
      </h2>
      <ul className="divide-y divide-border rounded-md border border-border">
        {data?.map((m) => <MemberRow key={m.id} member={m} isMe={m.id === me.user.id} myRole={me.role} />)}
      </ul>
    </section>
  );
}

function MemberRow({ member: m, isMe, myRole }: { member: Member; isMe: boolean; myRole: Role }) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const done = () => qc.invalidateQueries({ queryKey: ["members"] });
  const changeRole = useMutation({
    mutationFn: (role: Role) => api(`/v1/users/${m.id}`, { method: "PATCH", body: { role } }),
    onSuccess: done,
  });
  const remove = useMutation({ mutationFn: () => api(`/v1/users/${m.id}`, { method: "DELETE" }), onSuccess: done });
  const [confirmingReset, setConfirmingReset] = useState(false);
  const resetMfa = useMutation({
    mutationFn: () => api(`/v1/users/${m.id}/mfa`, { method: "DELETE" }),
    // Keep the confirmation up until the refreshed list arrives, so the stale row can't offer the reset again.
    onSuccess: async () => {
      await done();
      setConfirmingReset(false);
    },
  });
  // Mirrors the API: only owners change owners, and nobody removes themselves.
  const editable = m.role !== "owner" || myRole === "owner";
  const error = changeRole.error ?? remove.error ?? resetMfa.error;
  const idle = !confirming && !confirmingReset;

  return (
    <li data-testid="member" className="px-3 py-2 text-sm space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0">
          <span className="font-medium">{m.name || m.email}</span>
          {m.name && <span className="text-muted-foreground"> · {m.email}</span>}
          {isMe && <span className="text-muted-foreground"> (you)</span>}
          {m.mfa && (
            <Badge variant="secondary" className="ml-2" title="Two-factor authentication is on">
              2FA
            </Badge>
          )}
        </span>
        <span className="flex items-center gap-2">
          <select
            aria-label={`Role for ${m.email}`}
            className={selectClass}
            value={m.role}
            disabled={!editable || changeRole.isPending}
            onChange={(e) => changeRole.mutate(e.target.value as Role)}
          >
            {(editable ? assignable(myRole) : ROLES).map((r) => (
              <option key={r} value={r}>
                {label(r)}
              </option>
            ))}
          </select>
          {!isMe && editable && m.mfa && idle && (
            <Button size="sm" variant="ghost" onClick={() => setConfirmingReset(true)}>
              Reset 2FA
            </Button>
          )}
          {confirmingReset && (
            <>
              <Button size="sm" variant="destructive" disabled={resetMfa.isPending} onClick={() => resetMfa.mutate()}>
                Confirm reset
              </Button>
              <Button size="sm" variant="ghost" disabled={resetMfa.isPending} onClick={() => setConfirmingReset(false)}>
                Cancel
              </Button>
            </>
          )}
          {!isMe && editable && idle && (
            <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
              Remove
            </Button>
          )}
          {confirming && (
            <>
              <Button size="sm" variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate()}>
                Confirm remove
              </Button>
              <Button size="sm" variant="ghost" disabled={remove.isPending} onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </>
          )}
        </span>
      </div>
      {confirmingReset && (
        <p className="text-xs text-muted-foreground">
          Removes their authenticator and recovery codes and signs them out everywhere, for when they've lost their phone.
        </p>
      )}
      <FormError error={error ? errorText(error) : null} />
    </li>
  );
}
