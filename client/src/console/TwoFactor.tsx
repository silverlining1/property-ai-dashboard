import { useEffect, useMemo, useState, type FormEvent } from "react";
import { encode } from "uqr";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  confirmMfaSetupAtSignIn,
  disableMfa,
  enableMfa,
  replaceRecoveryCodes,
  startMfaSetup,
  startMfaSetupAtSignIn,
  verifyMfa,
  type MfaChallenge,
  type MfaSetup,
} from "./api";
import { AuthCard, FormError, errorText } from "./AuthCard";
import { useMe, useSession } from "./session";

/** The otpauth URI as a QR code, drawn as SVG from the module grid. Dark on light in either theme, as scanners expect. */
export function QrCode({ value, size = 184 }: { value: string; size?: number }) {
  const { path, n } = useMemo(() => {
    const { data } = encode(value, { ecc: "M", border: 4 });
    let d = "";
    data.forEach((row, y) => row.forEach((dark, x) => dark && (d += `M${x} ${y}h1v1h-1z`)));
    return { path: d, n: data.length };
  }, [value]);
  return (
    <svg role="img" aria-label="QR code for your authenticator app" viewBox={`0 0 ${n} ${n}`} width={size} height={size}
      shapeRendering="crispEdges" className="rounded-md bg-white">
      <path d={path} fill="#000" />
    </svg>
  );
}

/** Groups the setup key in fours so it can be typed by hand. */
const grouped = (secret: string) => secret.match(/.{1,4}/g)?.join(" ") ?? secret;

function CodeField({ id, value, onChange, recovery = false, autoFocus = false }: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  recovery?: boolean;
  autoFocus?: boolean;
}) {
  return recovery ? (
    <Input id={id} required autoFocus={autoFocus} autoComplete="off" spellCheck={false} placeholder="XXXXX-XXXXX"
      value={value} onChange={(e) => onChange(e.target.value)} />
  ) : (
    <Input id={id} required autoFocus={autoFocus} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}"
      maxLength={7} placeholder="123456" value={value} onChange={(e) => onChange(e.target.value)} />
  );
}

/** Scan (or type the key), then confirm with the first code. */
function SetupForm({ setup, onConfirm }: { setup: MfaSetup; onConfirm: (code: string) => Promise<void> }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onConfirm(code);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <ol className="list-decimal pl-5 space-y-1 text-sm text-muted-foreground">
        <li>Open an authenticator app, such as Google Authenticator, Microsoft Authenticator or 1Password.</li>
        <li>Scan this code, or enter the setup key.</li>
        <li>Enter the 6-digit code the app shows.</li>
      </ol>
      <div className="flex justify-center">
        <QrCode value={setup.otpauth_uri} />
      </div>
      <p className="text-xs text-muted-foreground text-center">
        Setup key: <code data-testid="mfa-secret" className="font-mono text-foreground select-all">{grouped(setup.secret)}</code>
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="setup-code">Code from the app</Label>
        <CodeField id="setup-code" value={code} onChange={setCode} />
      </div>
      <FormError error={error} />
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Checking…" : "Turn on two-factor"}
      </Button>
    </form>
  );
}

/** Shown once, right after two-factor is turned on or the codes are replaced. */
export function RecoveryCodes({ codes, onDone, doneLabel = "Done" }: { codes: string[]; onDone: () => void; doneLabel?: string }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = codes.join("\n");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([`PropAI recovery codes\n\n${text}\n\nEach code works once.\n`], { type: "text/plain" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "propai-recovery-codes.txt" });
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        If you lose your phone, each of these codes lets you sign in once. Keep them somewhere safe, such as a password
        manager. They won't be shown again.
      </p>
      <ul data-testid="recovery-codes" className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-md border border-border p-3 font-mono text-sm">
        {codes.map((c) => <li key={c}>{c}</li>)}
      </ul>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={download}>
          Download
        </Button>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        I've saved my recovery codes
      </label>
      <Button className="w-full" disabled={!saved} onClick={onDone}>
        {doneLabel}
      </Button>
    </div>
  );
}

/** The second step of signing in (login or accepting an invitation). Calls onSignedIn once a session exists. */
export function SecondStep({ challenge, onSignedIn, onCancel }: {
  challenge: MfaChallenge;
  onSignedIn: () => Promise<void>;
  onCancel: () => void;
}) {
  return challenge.kind === "verify" ? (
    <VerifyStep challenge={challenge} onSignedIn={onSignedIn} onCancel={onCancel} />
  ) : (
    <RequiredSetupStep challenge={challenge} onSignedIn={onSignedIn} onCancel={onCancel} />
  );
}

function VerifyStep({ challenge, onSignedIn, onCancel }: { challenge: MfaChallenge; onSignedIn: () => Promise<void>; onCancel: () => void }) {
  const [recovery, setRecovery] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Once the code is accepted it's spent: a retry after a failed profile load only retries the load.
  const [verified, setVerified] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (!verified) {
        await verifyMfa(challenge, code);
        setVerified(true);
      }
      await onSignedIn();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title="Two-factor authentication"
      description={recovery ? "Enter one of your recovery codes." : "Enter the 6-digit code from your authenticator app."}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="mfa-code">{recovery ? "Recovery code" : "Code"}</Label>
          <CodeField key={String(recovery)} id="mfa-code" value={code} onChange={setCode} recovery={recovery} autoFocus />
        </div>
        <FormError error={error} />
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Checking…" : "Verify"}
        </Button>
      </form>
      <div className="mt-4 flex justify-between text-sm">
        <button type="button" className="text-primary underline-offset-4 hover:underline" disabled={busy}
          onClick={() => { setRecovery(!recovery); setCode(""); setError(null); }}>
          {recovery ? "Use the authenticator app" : "Use a recovery code"}
        </button>
        <button type="button" className="text-muted-foreground underline-offset-4 hover:underline" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </AuthCard>
  );
}

function RequiredSetupStep({ challenge, onSignedIn, onCancel }: { challenge: MfaChallenge; onSignedIn: () => Promise<void>; onCancel: () => void }) {
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    startMfaSetupAtSignIn(challenge).then(
      (s) => live && setSetup(s),
      (err) => live && setError(errorText(err)),
    );
    return () => {
      live = false;
    };
  }, [challenge]);

  async function finish() {
    setError(null);
    setBusy(true);
    try {
      await onSignedIn();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  if (codes) {
    return (
      <AuthCard title="Save your recovery codes">
        <RecoveryCodes codes={codes} onDone={finish} doneLabel={busy ? "Please wait…" : "Continue"} />
        <FormError error={error} />
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Set up two-factor authentication" description="Your organization requires a code from an authenticator app when you sign in.">
      {setup ? (
        <SetupForm setup={setup} onConfirm={async (code) => setCodes(await confirmMfaSetupAtSignIn(challenge, code))} />
      ) : (
        !error && <p className="text-sm text-muted-foreground">Preparing…</p>
      )}
      <FormError error={error} />
      <button type="button" className="mt-4 text-sm text-muted-foreground underline-offset-4 hover:underline" onClick={onCancel}>
        Cancel
      </button>
    </AuthCard>
  );
}

// ---- Account page -------------------------------------------------------------------------------

type Panel = "idle" | "setup" | "codes" | "replace" | "disable";

export function TwoFactorCard() {
  const me = useMe();
  const { refreshMe, updateMfa } = useSession();
  const [panel, setPanel] = useState<Panel>("idle");
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { enabled, required, recovery_codes_left: left } = me.mfa;

  function reset() {
    setPanel("idle");
    setSetup(null);
    setError(null);
  }

  async function begin() {
    setError(null);
    setBusy(true);
    try {
      setSetup(await startMfaSetup());
      setPanel("setup");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function showCodes(newCodes: string[]) {
    setCodes(newCodes);
    setPanel("codes");
    updateMfa({ enabled: true, recovery_codes_left: newCodes.length });
    await refreshMe().catch(() => undefined);
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <h2 className="font-medium">Two-factor authentication</h2>
        <p className="text-sm text-muted-foreground">
          {enabled
            ? `On. Signing in asks for a code from your authenticator app. ${left} recovery code${left === 1 ? "" : "s"} left.`
            : "Off. Add a code from an authenticator app to every sign-in, so a stolen password isn't enough."}
          {required && " Your organization requires it."}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {panel === "idle" && (
          <div className="flex flex-wrap gap-2">
            {!enabled && (
              <Button onClick={begin} disabled={busy}>
                {busy ? "Please wait…" : "Turn on"}
              </Button>
            )}
            {enabled && (
              <Button variant="outline" onClick={() => setPanel("replace")}>
                Replace recovery codes
              </Button>
            )}
            {enabled && !required && (
              <Button variant="ghost" onClick={() => setPanel("disable")}>
                Turn off
              </Button>
            )}
          </div>
        )}
        {panel === "setup" && setup && (
          <>
            <SetupForm setup={setup} onConfirm={async (code) => showCodes(await enableMfa(code))} />
            <Button variant="ghost" size="sm" onClick={reset}>
              Cancel
            </Button>
          </>
        )}
        {panel === "codes" && <RecoveryCodes codes={codes} onDone={reset} />}
        {panel === "replace" && (
          <CodeConfirm
            prompt="Enter a code from your authenticator app. Your current recovery codes stop working."
            action="Replace codes"
            onSubmit={async ({ code }) => showCodes(await replaceRecoveryCodes(code))}
            onCancel={reset}
          />
        )}
        {panel === "disable" && (
          <CodeConfirm
            prompt="Enter your password and a code from your authenticator app (or a recovery code)."
            action="Turn off two-factor"
            withPassword
            onSubmit={async ({ password, code }) => {
              await disableMfa(password, code);
              updateMfa({ enabled: false, recovery_codes_left: 0 });
              await refreshMe().catch(() => undefined);
              reset();
            }}
            onCancel={reset}
          />
        )}
        <FormError error={error} />
      </CardContent>
    </Card>
  );
}

function CodeConfirm({ prompt, action, withPassword = false, onSubmit, onCancel }: {
  prompt: string;
  action: string;
  withPassword?: boolean;
  onSubmit: (v: { password: string; code: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onSubmit({ password, code });
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-muted-foreground">{prompt}</p>
      {withPassword && (
        <div className="space-y-1.5">
          <Label htmlFor="confirm-password">Password</Label>
          <Input id="confirm-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="confirm-code">Code</Label>
        {/* Recovery codes are accepted here too, so this field isn't limited to digits. */}
        <Input id="confirm-code" required autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
      </div>
      <FormError error={error} />
      <div className="flex gap-2">
        <Button type="submit" variant={withPassword ? "destructive" : "default"} disabled={busy}>
          {busy ? "Please wait…" : action}
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
