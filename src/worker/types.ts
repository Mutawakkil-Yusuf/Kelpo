/** Shared domain types. Schema lives in migrations/0001_initial.sql. */

export type Expiry = "24h" | "7d" | "30d";
export type LinkStatus = "draft" | "active" | "disabled" | "expired" | "deleted";

export interface LinkRow {
  slug: string;
  title: string;
  message: string | null;
  password_salt: string | null;
  password_hash: string | null;
  owner_token_hash: string;
  expected_files: number;
  og_key: string | null;
  account_id: string | null;
  accent_color: string | null;
  logo_url: string | null;
  expires_at: number;
  created_at: number;
  status: LinkStatus;
  view_count: number;
  report_count: number;
}

export interface FileRow {
  id: string;
  link_slug: string;
  r2_key: string;
  thumb_key: string | null;
  name: string;
  content_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  sort_order: number;
  created_at: number;
}

export interface CreateLinkInput {
  title: string;
  message?: string;
  expiry: Expiry;
  hasPassword: boolean;
}

/** Public JSON shape returned to the client. Never includes hashes or owner token. */
export interface PublicLink {
  slug: string;
  title: string;
  message: string | null;
  expiresAt: number;
  requiresPassword: boolean;
  files: Array<{
    id: string;
    name: string;
    contentType: string;
    sizeBytes: number;
    width: number | null;
    height: number | null;
  }>;
}
