/** Bindings available to the Worker. Emulated locally by wrangler dev. */
export interface Env {
  DB: D1Database;
  APP_URL: string;
  /** Origin of the Vite app (Vercel in production), used in share links. */
  PUBLIC_APP_URL?: string;
  /** Comma-separated origins allowed to call the API from a browser. */
  ALLOWED_ORIGIN?: string;
  SESSION_SECRET?: string;
  /** Supabase Storage holds the originals; D1 holds the metadata. */
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  STORAGE_BUCKET: string;
}
