/**
 * There's no login system yet, so a watch is only addressable by the email
 * the user typed when creating it. Remembering that email locally lets the
 * alerts bell poll for the same person's alerts without asking again on
 * every visit — it's a convenience, not an identity/auth mechanism.
 */
const STORAGE_KEY = "satquery_watch_email";

export function getStoredWatchEmail(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredWatchEmail(email: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, email);
  } catch {
    /* private browsing / storage disabled - watch still gets created, it just won't be remembered */
  }
}
