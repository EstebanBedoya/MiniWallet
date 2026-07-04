"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  api,
  ApiError,
  setAuthToken,
  setUnauthorizedHandler,
  type PublicUser,
} from "@/lib/api";
import { decodeJwt, isJwtExpired, type UserRole } from "@/lib/jwt";

const TOKEN_KEY = "miniwallet.token";

interface AuthState {
  token: string | null;
  user: PublicUser | null;
  role: UserRole | null;
  userId: string | null;
  isAdmin: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Avoid clearing the session twice if several requests 401 at once.
  const clearing = useRef(false);

  const clearSession = useCallback(() => {
    if (clearing.current) return;
    clearing.current = true;
    setToken(null);
    setUser(null);
    setRole(null);
    setUserId(null);
    setAuthToken(null);
    if (typeof window !== "undefined") localStorage.removeItem(TOKEN_KEY);
    // Reset the guard on the next tick so a later real logout still works.
    setTimeout(() => (clearing.current = false), 0);
  }, []);

  // Apply a token: decode role/userId, sync the api client, and confirm with /me.
  const applyToken = useCallback(
    async (nextToken: string) => {
      const payload = decodeJwt(nextToken);
      if (!payload || isJwtExpired(payload)) {
        clearSession();
        return;
      }
      clearing.current = false;
      setAuthToken(nextToken);
      setToken(nextToken);
      setRole(payload.role);
      setUserId(payload.sub);
      if (typeof window !== "undefined") localStorage.setItem(TOKEN_KEY, nextToken);
      try {
        const me = await api.me();
        setUser(me);
      } catch (err) {
        // A 401 means the stored token is stale/invalid → drop the session.
        if (err instanceof ApiError && err.status === 401) {
          clearSession();
          return;
        }
        // Any other failure (transient 5xx / network): the token is still valid
        // and role/userId already came from the JWT, so keep the session usable.
        // Only the display profile is missing; surface it rather than swallowing.
        console.warn("No se pudo cargar el perfil (/auth/me):", err);
      }
    },
    [clearSession],
  );

  // Register the global 401 handler once.
  useEffect(() => {
    setUnauthorizedHandler(() => clearSession());
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  // Bootstrap session from a persisted token on first mount.
  useEffect(() => {
    const stored =
      typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
    if (stored) {
      // Bootstrap the session from persisted storage on mount (accepted Effect use).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      applyToken(stored).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [applyToken]);

  const login = useCallback(
    async (email: string, password: string) => {
      const { accessToken } = await api.login({ email, password });
      await applyToken(accessToken);
    },
    [applyToken],
  );

  const register = useCallback(
    async (email: string, password: string, name: string) => {
      await api.register({ email, password, name });
      // Register does not return a token — log in immediately after.
      await login(email, password);
    },
    [login],
  );

  const logout = useCallback(() => clearSession(), [clearSession]);

  const value = useMemo<AuthState>(
    () => ({
      token,
      user,
      role,
      userId,
      isAdmin: role === "ADMIN",
      loading,
      login,
      register,
      logout,
    }),
    [token, user, role, userId, loading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
