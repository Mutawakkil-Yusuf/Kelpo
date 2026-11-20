export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatExpiry(timestamp: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

export function timeLeft(timestamp: number): string {
  const minutes = Math.max(0, Math.floor((timestamp - Date.now()) / 60000));
  if (minutes <= 0) return "Ended";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days) return `${days}d ${hours}h left`;
  if (hours) return `${hours}h ${mins}m left`;
  return `${mins}m left`;
}

export function previewUrl(id: string): string {
  return `/api/files/${encodeURIComponent(id)}?preview=1`;
}

export function downloadUrl(id: string): string {
  return `/api/files/${encodeURIComponent(id)}`;
}
