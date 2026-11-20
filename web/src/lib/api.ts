import type { PublicLink } from "../../../src/worker/types";
import { getSession } from "./auth";
import { apiUrl } from "./config";
import { getAccessToken, getOpenId, getOwnerToken } from "./session";

export type { PublicLink };

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  init?: RequestInit,
  options?: { slug?: string },
): Promise<T> {
  const headers = new Headers(init?.headers);
  const owner = getOwnerToken();
  if (owner) headers.set("X-Kelpo-Owner", owner);
  const access = options?.slug ? getAccessToken(options.slug) : "";
  if (access) headers.set("X-Kelpo-Access", access);
  const session = getSession();
  if (session) headers.set("Authorization", `Bearer ${session}`);
  headers.set("X-Kelpo-Session", getOpenId());

  const response = await fetch(apiUrl(path), { ...init, headers });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(response.status, body.error || "Request failed");
  }
  return (await response.json()) as T;
}

export interface UploadedFile {
  id: string;
  name: string;
  sizeBytes: number;
  contentType: string;
}

function upload(
  slug: string,
  file: File,
  thumbnail: Blob | null,
  onProgress: (fraction: number) => void,
  ogCard: Blob | null = null,
): Promise<UploadedFile> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", apiUrl(`/api/links/${slug}/files`));
    xhr.setRequestHeader("X-Kelpo-Owner", getOwnerToken());
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      let body: UploadedFile & { error?: string } = {} as UploadedFile;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // handled below
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(new ApiError(xhr.status, body.error || "Upload failed"));
    };
    xhr.onerror = () => reject(new ApiError(0, "No connection. Check your data and try again."));

    const form = new FormData();
    form.append("file", file, file.name);
    if (thumbnail) form.append("thumb", thumbnail, "preview.webp");
    if (ogCard) form.append("og", ogCard, "og-card.png");
    xhr.send(form);
  });
}

export interface DashboardData {
  account: { id: string; email: string; plan: string };
  links: Array<{
    slug: string;
    title: string;
    status: string;
    expires_at: number;
    created_at: number;
    view_count: number;
    report_count: number;
    opens: number;
  }>;
  brand: { accentColor: string | null; logoUrl: string | null };
}

export interface Pin {
  id: string;
  file_id: string;
  x: number;
  y: number;
  message: string;
  author: string;
  created_at: number;
}

export const api = {
  signup(input: { email: string; password: string; ownerToken?: string }) {
    return request<{ token: string; account: { id: string; email: string; plan: string } }>(
      "/api/auth/signup",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
    );
  },

  login(input: { email: string; password: string }) {
    return request<{ token: string; account: { id: string; email: string; plan: string } }>(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
    );
  },

  me() {
    return request<DashboardData>("/api/auth/me");
  },

  saveBrand(input: { accentColor: string | null; logoUrl: string | null }) {
    return request<{ ok: boolean }>("/api/auth/brand", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  },

  revoke(slug: string) {
    return request<{ ok: boolean }>(`/api/links/${slug}/revoke`, { method: "POST" });
  },

  extend(slug: string, expiry: "24h" | "7d" | "30d") {
    return request<{ expiresAt: number }>(`/api/links/${slug}/extend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expiry }),
    });
  },

  getBrand(slug: string) {
    return request<{ accentColor: string | null; logoUrl: string | null }>(
      `/api/links/${slug}/brand`,
    );
  },

  stats(slug: string) {
    return request<{ opens: number; downloads: number; zips: number }>(
      `/api/links/${slug}/stats`,
    );
  },

  getPins(slug: string) {
    return request<{ pins: Pin[] }>(`/api/links/${slug}/pins`, undefined, { slug });
  },

  addPin(slug: string, pin: { fileId: string; x: number; y: number; message: string; author: string }) {
    return request<{ id: string }>(`/api/links/${slug}/pins`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pin),
    }, { slug });
  },

  joinWaitlist(email: string) {
    return request<{ ok: boolean }>("/api/auth/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
  },

  createLink(input: {
    title: string;
    message?: string;
    expiry: "24h" | "7d" | "30d";
    hasPassword: boolean;
    password?: string;
    fileCount: number;
  }) {
    return request<{ slug: string; expiresAt: number; ownerToken: string }>("/api/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  },

  uploadFile: upload,

  finalize(slug: string) {
    return request<{ url: string; link: PublicLink }>(`/api/links/${slug}/finalize`, {
      method: "POST",
    });
  },

  getLink(slug: string) {
    return request<PublicLink>(`/api/links/${slug}`, undefined, { slug });
  },

  unlock(slug: string, password: string) {
    return request<{ ok: boolean; accessToken: string }>(
      `/api/links/${slug}/unlock`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      },
      { slug },
    );
  },

  getLikes() {
    return request<{ count: number }>("/api/like");
  },

  like() {
    return request<{ count: number }>("/api/like", { method: "POST" });
  },

  report(slug: string, reason: string) {
    return request<{ ok: boolean }>(
      `/api/links/${slug}/report`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      },
      { slug },
    );
  },
};
