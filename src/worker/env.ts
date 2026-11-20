/** Bindings available to the Worker. Emulated locally by wrangler dev. */
export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  ASSETS: Fetcher;
  APP_URL: string;
  SESSION_SECRET?: string;
}
