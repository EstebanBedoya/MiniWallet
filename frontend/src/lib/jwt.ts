// The API issues a signed (not encrypted) JWT. The `role` claim is not exposed
// by GET /auth/me, so the UI decodes the token payload client-side purely to
// decide whether to show the admin panel. Authorization is still enforced
// server-side by JwtAuthGuard / AdminGuard on every request.

export type UserRole = "USER" | "ADMIN";

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  exp?: number;
}

/** Decode the JWT payload (base64url). Returns null on any malformed token. */
export function decodeJwt(token: string): JwtPayload | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join(""),
    );
    const parsed = JSON.parse(json) as JwtPayload;
    if (!parsed.sub) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** True when the token carries an exp claim already in the past. */
export function isJwtExpired(payload: JwtPayload): boolean {
  if (!payload.exp) return false;
  return payload.exp * 1000 <= Date.now();
}
