// Typed client for the MiniWallet API. All requests go to the same-origin
// `/api/*` path, which Next.js rewrites server-side to the NestJS backend.

export type TransactionStatus =
  | "PENDING_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "SETTLED";

export type SuspiciousReason = "HIGH_AMOUNT" | "VELOCITY" | "STRUCTURING";

export interface PublicUser {
  userId: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface LoginResponse {
  accessToken: string;
}

export interface Account {
  userId: string;
  balanceAvailable: string;
  pendingIncoming: string;
  pendingOutgoing: string;
}

export interface Transaction {
  transactionId: string;
  senderId: string;
  receiverId: string;
  amount: string;
  status: TransactionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PagedTransactions {
  data: Transaction[];
  page: number;
  limit: number;
  total: number;
}

export interface TransferResult {
  transactionId: string;
  senderId: string;
  receiverId: string;
  amount: string;
  status: TransactionStatus;
}

export interface SuspiciousTransaction {
  transactionId: string;
  senderId: string;
  receiverId: string;
  amount: string;
  status: TransactionStatus;
  createdAt: string;
  reasons: SuspiciousReason[];
}

/** Normalized error carrying the API's semantic `code`. */
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const BASE = "/api";

// Module-level auth state so callers don't thread the token through every call.
let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** Skip the global 401 handler (used during login where 401 is expected). */
  skipAuthRedirect?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { ...options.headers };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError("NETWORK_ERROR", "No se pudo conectar con el servidor.", 0);
  }

  const text = await res.text();
  const payload = text ? safeParse(text) : null;

  if (!res.ok) {
    const code =
      (payload && typeof payload.code === "string" && payload.code) || "ERROR";
    const message =
      (payload && normalizeMessage(payload.message)) || res.statusText;
    if (res.status === 401 && !options.skipAuthRedirect) onUnauthorized?.();
    throw new ApiError(code, message, res.status);
  }

  return payload as T;
}

function safeParse(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeMessage(message: unknown): string | null {
  if (typeof message === "string") return message;
  if (Array.isArray(message)) return message.join(" ");
  return null;
}

export const api = {
  register: (body: { email: string; password: string; name: string }) =>
    request<PublicUser>("/auth/register", { method: "POST", body }),

  login: (body: { email: string; password: string }) =>
    request<LoginResponse>("/auth/login", {
      method: "POST",
      body,
      skipAuthRedirect: true,
    }),

  me: () => request<PublicUser>("/auth/me"),

  account: () => request<Account>("/accounts/me"),

  transactions: (page = 1, limit = 20) =>
    request<PagedTransactions>(`/transactions?page=${page}&limit=${limit}`),

  transfer: (
    body: { receiverId: string; amount: string },
    idempotencyKey: string,
  ) =>
    request<TransferResult>("/transfers", {
      method: "POST",
      body,
      headers: { "Idempotency-Key": idempotencyKey },
    }),

  suspicious: () =>
    request<SuspiciousTransaction[]>("/admin/transactions/suspicious"),

  approve: (id: string) =>
    request<{ transactionId: string; status: TransactionStatus }>(
      `/admin/transactions/${id}/approve`,
      { method: "POST" },
    ),

  reject: (id: string) =>
    request<{ transactionId: string; status: TransactionStatus }>(
      `/admin/transactions/${id}/reject`,
      { method: "POST" },
    ),
};
