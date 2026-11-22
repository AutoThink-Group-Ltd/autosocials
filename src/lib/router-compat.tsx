/**
 * Router-compat shim — bridges react-router-dom v6 call sites to
 * @tanstack/react-router without hand-rewriting every component.
 * This is the same load-bearing pattern used in Klar's dev-copy migration.
 */
import {
  useNavigate as tsNavigate,
  useLocation as tsLocation,
  useParams as tsParams,
  useSearch as tsSearch,
  useRouter,
  Link as TSLink,
  Outlet as TSOutlet,
} from "@tanstack/react-router";
import { useMemo, useCallback, useEffect, useRef, forwardRef, type ComponentProps, type CSSProperties, type ReactNode } from "react";

// ---------- shared URL parsing ----------

/** Drops undefined values so option objects satisfy exactOptionalPropertyTypes. */
function compact<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

function parseTo(to: string): { pathname: string; search: Record<string, string> | undefined; hash: string | undefined } {
  const [beforeHash = "", hashStr] = (to ?? "").split("#");
  const [pathname, searchStr] = beforeHash.split("?");
  return {
    // react-router keeps the current path for search-only ("?a=1") and
    // hash-only ("#section") targets; TanStack's "." means current route.
    pathname: pathname || ".",
    search: searchStr ? Object.fromEntries(new URLSearchParams(searchStr)) : undefined,
    hash: hashStr || undefined,
  };
}

// ---------- useNavigate ----------

type NavigateOptions = { replace?: boolean; state?: unknown };

type NavigateFn = {
  (to: string | number, options?: NavigateOptions): void;
  (delta: number): void;
};

export function useNavigate(): NavigateFn {
  const tsNav = tsNavigate();
  const router = useRouter();
  return useCallback((to: string | number, options?: NavigateOptions) => {
    if (typeof to === "number") {
      router.history.go(to);
      return;
    }
    const { pathname, search, hash } = parseTo(to);
    tsNav(compact({ to: pathname, search, hash, state: options?.state, replace: options?.replace }) as never);
  }, [tsNav, router]) as NavigateFn;
}

// ---------- useLocation ----------

export function useLocation() {
  const loc = tsLocation();
  return useMemo(
    () => ({
      pathname: loc.pathname,
      search: loc.searchStr ? `?${loc.searchStr}` : "",
      hash: loc.hash ?? "",
      state: (loc.state ?? null) as unknown,
      key: loc.pathname + (loc.searchStr ?? ""),
    }),
    [loc.pathname, loc.searchStr, loc.hash, loc.state],
  );
}

// ---------- useParams ----------

export function useParams<T extends Record<string, string | undefined> = Record<string, string | undefined>>(): T {
  return tsParams({ strict: false } as never) as T;
}


// ---------- useSearchParams (react-router-dom compat) ----------

export function useSearchParams(): [URLSearchParams, (init: URLSearchParams | Record<string, string> | ((prev: URLSearchParams) => URLSearchParams), opts?: { replace?: boolean }) => void] {
  const loc = tsLocation();
  const nav = tsNavigate();
  const router = useRouter();
  const params = useMemo(() => new URLSearchParams(loc.searchStr ?? ""), [loc.searchStr]);
  const setParams = useCallback(
    (
      init: URLSearchParams | Record<string, string> | ((prev: URLSearchParams) => URLSearchParams),
      opts?: { replace?: boolean },
    ) => {
      // Functional updaters read the router's live location, not the render
      // snapshot — react-router passes call-time params, and chained updates
      // within one tick must see each other's writes.
      const live = router.state.location;
      const current = new URLSearchParams(live.searchStr ?? "");
      const next =
        typeof init === "function"
          ? init(current)
          : init instanceof URLSearchParams
            ? init
            : new URLSearchParams(init);
      const searchObj: Record<string, string> = {};
      next.forEach((v, k) => { searchObj[k] = v; });
      nav(compact({ to: live.pathname, search: searchObj, replace: opts?.replace }) as never);
    },
    [nav, router],
  );
  return [params, setParams];
}

// ---------- Link ----------

type LinkProps = Omit<ComponentProps<typeof TSLink>, "to"> & {
  to: string;
  replace?: boolean;
  state?: unknown;
  children?: ReactNode;
};

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { to, replace, state, children, ...rest },
  ref,
) {
  const { pathname, search, hash } = parseTo(to);
  return (
    <TSLink
      ref={ref as never}
      {...(compact({ to: pathname, search, hash, replace, state, ...rest }) as ComponentProps<typeof TSLink>)}
    >
      {children}
    </TSLink>
  );
});


// ---------- Navigate ----------

export function Navigate({ to, replace, state }: { to: string; replace?: boolean; state?: unknown }) {
  // One-shot redirect. TanStack's <Navigate> re-fires while the target route's own
  // beforeLoad redirect is pending, which froze the page in a render loop.
  const router = useRouter();
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    const { pathname, search, hash } = parseTo(to);
    void router.navigate(compact({ to: pathname, search, hash, state, replace }) as never);
  }, [router, to, replace, state]);
  return null;
}

// ---------- Outlet ----------

export const Outlet = TSOutlet;

// ---------- NavLink (react-router v6 semantics: end, function className/style/children) ----------

type NavLinkRenderProps = { isActive: boolean; isPending: boolean; isTransitioning: boolean };

export type NavLinkProps = Omit<LinkProps, "className" | "style" | "children"> & {
  end?: boolean;
  caseSensitive?: boolean;
  className?: string | ((props: NavLinkRenderProps) => string | undefined);
  style?: CSSProperties | ((props: NavLinkRenderProps) => CSSProperties | undefined);
  children?: ReactNode | ((props: NavLinkRenderProps) => ReactNode);
};

function trimTrailingSlash(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

export const NavLink = forwardRef<HTMLAnchorElement, NavLinkProps>(function NavLink(
  { to, end, caseSensitive, className, style, children, ...rest },
  ref,
) {
  const loc = tsLocation();
  const target = parseTo(to).pathname;
  const current = trimTrailingSlash(caseSensitive ? loc.pathname : loc.pathname.toLowerCase());
  const wanted = trimTrailingSlash(caseSensitive ? target : target.toLowerCase());
  const isActive =
    current === wanted ||
    (!end && wanted !== "/" && current.startsWith(wanted) && current.charAt(wanted.length) === "/");
  const renderProps: NavLinkRenderProps = { isActive, isPending: false, isTransitioning: false };
  const resolvedClassName = typeof className === "function" ? className(renderProps) : className;
  const resolvedStyle = typeof style === "function" ? style(renderProps) : style;
  const resolvedChildren = typeof children === "function" ? children(renderProps) : children;
  return (
    <Link
      ref={ref}
      to={to}
      {...(resolvedClassName !== undefined ? { className: resolvedClassName } : {})}
      {...(resolvedStyle !== undefined ? { style: resolvedStyle } : {})}
      {...(isActive ? { "aria-current": "page" as const } : {})}
      {...rest}
    >
      {resolvedChildren}
    </Link>
  );
});
