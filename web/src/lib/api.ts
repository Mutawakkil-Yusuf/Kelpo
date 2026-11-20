import type { PublicLink } from "../../../src/worker/types";
import { apiUrl } from "./config";
import { getAccessToken, getOwnerToken } from "./session";

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
    xhr.send(form);
  });
}

export const api = {
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
