/** Tokens live in the tab session, not cookies. The Worker and the app are on
 *  different sites, so cookies would be third-party and unreliable. */

const OWNER_KEY = "kelpo_owner";
const accessKey = (slug: string) => `kelpo_access_${slug}`;

function read(key: string): string {
  try {
    return sessionStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function write(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Private mode can block storage; the link still works without a saved token.
  }
}

export const getOwnerToken = () => read(OWNER_KEY);
export const setOwnerToken = (token: string) => write(OWNER_KEY, token);
export const getAccessToken = (slug: string) => read(accessKey(slug));
export const setAccessToken = (slug: string, token: string) => write(accessKey(slug), token);
