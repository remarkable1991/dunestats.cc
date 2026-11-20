import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useCallback } from "react";

type Scalar = string | number | boolean | null;

/** Mirror one search-param in the URL with a useState-like API (default values are stripped from the URL). */
export function useSearchState<T extends Scalar>(key: string, def: T): [T, (v: T | ((prev: T) => T)) => void] {
  const raw = useRouterState({ select: (s) => (s.location.search as Record<string, unknown>)[key] });
  const navigate = useNavigate();
  const value = coerce(raw, def);
  const set = useCallback((v: T | ((prev: T) => T)) => {
    void navigate({
      to: ".",
      replace: true,
      resetScroll: false,
      search: ((prev: Record<string, unknown>) => {
        const cur = coerce(prev[key], def);
        const next = typeof v === "function" ? (v as (p: T) => T)(cur) : v;
        const out = { ...prev };
        if (next === def || next === "" || next === null) delete out[key];
        else out[key] = next;
        return out;
      }) as never,
    });
  }, [key, def, navigate]);
  return [value, set];
}

function coerce<T extends Scalar>(raw: unknown, def: T): T {
  if (raw === undefined || raw === null) return def;
  if (typeof def === "number") { const n = Number(raw); return (Number.isFinite(n) ? n : def) as T; }
  if (typeof def === "boolean") return (raw === true || raw === "true") as T;
  if (def === null) { const n = Number(raw); return (typeof raw === "number" || Number.isFinite(n) ? n : raw) as T; }
  return String(raw) as T;
}
