/**
 * Browser origin prefix for API and backend static routes.
 * Leave unset in dev so requests stay same-origin and Vite proxies `/api` and `/uploads`.
 * In production, set `VITE_API_ORIGIN` when the UI is hosted separately from the API.
 */
export const API_ORIGIN = (import.meta.env.VITE_API_ORIGIN as string | undefined)?.replace(/\/$/, "") ?? "";

export function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API_ORIGIN}${p}`;
}
