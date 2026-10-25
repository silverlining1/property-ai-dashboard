// Client for the PropAI platform API.
//
// Session handling: the access token lives only in memory. The refresh token is an HttpOnly,
// SameSite=Strict cookie set by the API (we identify as a web client with X-PropAI-Client), so no
// script on this page can read it. On load, or when an access token expires, we call /v1/auth/refresh.

export const API_URL: string = (() => {
  const configured = import.meta.env.VITE_PROPAI_API_URL as string | undefined;
  if (configured) return configured.replace(/\/$/, "");
  const { protocol, hostname } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") return `${protocol}//${hostname}:8000`;
  return `https://api.${hostname}`;
})();

const WEB_CLIENT = { "X-PropAI-Client": "web" };

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Tokens = { access_token: string; org_id: string; role: string };

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
// Bumped on sign-out. A token response that belongs to an earlier session (a refresh still in flight when
// the user signed out) is dropped instead of quietly signing them back in.
let sessionEpoch = 0;
const listeners = new Set<(signedIn: boolean) => void>();

export function onSessionChange(fn: (signedIn: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setAccessToken(token: string | null) {
  const changed = (token === null) !== (accessToken === null);
  accessToken = token;
  if (changed) listeners.forEach((fn) => fn(token !== null));
}

async function errorFrom(res: Response): Promise<ApiError> {
  let message = res.statusText || `Request failed (${res.status})`;
  try {
    const body = await res.json();
    if (typeof body?.detail === "string") message = body.detail;
    else if (Array.isArray(body?.detail)) message = body.detail.map((d: { msg?: string }) => d.msg).join("; ");
  } catch {
    // non-JSON error body
  }
  return new ApiError(res.status, message);
}

async function authRequest(path: string, body?: unknown): Promise<Tokens> {
  const epoch = sessionEpoch;
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { ...WEB_CLIENT, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw await errorFrom(res);
  const tokens = (await res.json()) as Tokens;
  if (epoch !== sessionEpoch) throw new ApiError(401, "Signed out");
  setAccessToken(tokens.access_token);
  return tokens;
}

/** Restore or extend the session from the refresh cookie. Resolves false if it could not be refreshed;
 *  the session is only ended when the server rejects the cookie (401), not on a network failure. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= authRequest("/v1/auth/refresh")
    .then(() => true)
    .catch((err) => {
      if (err instanceof ApiError && err.status === 401) setAccessToken(null);
      return false;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export const login = (email: string, password: string) => authRequest("/v1/auth/login", { email, password });

export const signup = (org_name: string, name: string, email: string, password: string) =>
  authRequest("/v1/auth/signup", { org_name, name, email, password });

/** Ends the session only once the server has cleared the refresh cookie; otherwise throws, so the UI
 *  never shows "signed out" while a reload would silently sign the user back in. */
export async function logout(): Promise<void> {
  // Let a refresh that is already running land first, so its Set-Cookie can't arrive after (and undo) ours.
  await refreshing;
  const res = await fetch(`${API_URL}/v1/auth/logout`, { method: "POST", credentials: "include", headers: WEB_CLIENT });
  if (!res.ok) throw await errorFrom(res);
  sessionEpoch += 1;
  refreshing = null;
  setAccessToken(null);
}

/** Authenticated JSON request; refreshes the access token once on 401. */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const send = () =>
    fetch(`${API_URL}${path}`, {
      method: init.method ?? "GET",
      headers: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  let res = await send();
  if (res.status === 401) {
    if (!(await refreshSession())) throw await errorFrom(res);
    res = await send();
    if (res.status === 401) setAccessToken(null); // fresh token still refused: the session is gone
  }
  if (!res.ok) throw await errorFrom(res);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

// ---- API shapes ---------------------------------------------------------------------------------

export type Role = "owner" | "admin" | "manager" | "staff" | "viewer";

export interface Me {
  user: { id: string; email: string; name: string };
  org: { id: string; name: string; plan: string };
  role: Role;
}

export interface ConversationSummary {
  id: string;
  channel: string;
  subject: string;
  intent: string | null;
  urgency: string | null;
  status: string;
  contact_id: string | null;
  contact_name: string;
  last_message_at: string;
}

export interface ConversationDetail extends ConversationSummary {
  messages: { id: string; direction: "inbound" | "outbound"; body: string; created_at: string }[];
}

export interface ApprovalAction {
  type: string;
  [key: string]: unknown;
}

export interface Approval {
  id: string;
  conversation_id: string;
  state: "pending" | "approved" | "revision_requested" | "held" | "sent" | "failed";
  round: number;
  draft: string;
  actions: ApprovalAction[];
  reason: string;
  expires_at: string | null;
  created_at: string;
  conversation?: ConversationSummary;
  inbound?: { body: string; created_at: string };
}

export const canDecide = (role: Role | undefined) => role === "owner" || role === "admin" || role === "manager";
