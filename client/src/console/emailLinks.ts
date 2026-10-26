// Invitation and password-reset emails link to #/accept-invite?token=… and #/reset-password?token=….
// The secret sits in the URL fragment, which browsers never send to servers or in Referer headers.
import { useEffect, useState } from "react";

export type EmailLink = { page: "accept-invite" | "reset-password"; token: string };

function read(): EmailLink | null {
  const m = window.location.hash.match(/^#\/(accept-invite|reset-password)\?(.*)$/);
  const token = m && new URLSearchParams(m[2]).get("token");
  return m && token ? { page: m[1] as EmailLink["page"], token } : null;
}

export function useEmailLink(): EmailLink | null {
  const [link, setLink] = useState(read);
  useEffect(() => {
    const onChange = () => setLink(read());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return link;
}

/** Removes the single-use token from the address bar and history, without leaving the page. */
export function forgetEmailLinkToken(to = "/") {
  window.history.replaceState(null, "", `#${to}`);
}

/** Leaves a link page, replacing the history entry so the single-use token isn't kept in history. */
export function leaveEmailLink(to = "/") {
  forgetEmailLinkToken(to);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}
