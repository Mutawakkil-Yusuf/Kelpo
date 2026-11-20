/** Sender-only session. Recipients never need this and are never prompted for it. */

const SESSION_KEY = "kelpo_session";

export function getSession(): string {
  try {
    return sessionStorage.getItem(SESSION_KEY) || "";
  } catch {
    return "";
  }
}

export function setSession(token: string): void {
  try {
    sessionStorage.setItem(SESSION_KEY, token);
  } catch {
    // Private browsing: the dashboard simply won't stay signed in.
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}
