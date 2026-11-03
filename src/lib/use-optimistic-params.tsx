"use client";

import {
  createContext,
  useContext,
  useOptimistic,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";

type OptimisticParams = {
  /** The query as the user last set it, not as the server last answered. */
  params: URLSearchParams;
  /** Show `next` at once and navigate to it. */
  navigate: (next: URLSearchParams) => void;
  /** True while the server is rendering the result. */
  pending: boolean;
};

const OptimisticParamsContext = createContext<OptimisticParams | null>(null);

/**
 * Every filter, sort and view toggle here is URL state: a click pushes a new
 * query and the server renders the result. useSearchParams only changes once
 * that render arrives, so for the whole round trip the control just pressed
 * still showed the old choice — a chip stayed unpressed, and a sort
 * <select>, being controlled, visibly snapped back to the old option until
 * the page caught up.
 *
 * useOptimistic shows the new query at once and lets go of it when the
 * navigation settles: on success the real params agree with it, and if the
 * navigation fails the real ones come back by themselves. Nothing is written
 * anywhere but the URL, so there is no false success to show.
 */
function useOptimisticParamsState(basePath: string): OptimisticParams {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [params, setParams] = useOptimistic<URLSearchParams, URLSearchParams>(
    searchParams,
    (_current, next) => next
  );
  const [pending, startTransition] = useTransition();

  const navigate = (next: URLSearchParams) => {
    const query = next.toString();
    startTransition(() => {
      setParams(next);
      router.push(query ? `${basePath}?${query}` : basePath, {
        scroll: false,
      });
    });
  };

  return { params, navigate, pending };
}

/**
 * One optimistic query for every control on a page. Separate copies raced:
 * pick a category, change the sort before the first result arrived, and the
 * sort built its URL from params that did not have the category yet — the
 * second click quietly undid the first.
 */
export function OptimisticParamsProvider({
  basePath,
  children,
}: {
  basePath: string;
  children: ReactNode;
}) {
  const value = useOptimisticParamsState(basePath);
  return (
    <OptimisticParamsContext.Provider value={value}>
      {children}
    </OptimisticParamsContext.Provider>
  );
}

/** The page's shared optimistic query, or a private one outside a provider. */
export function useOptimisticParams(basePath: string): OptimisticParams {
  const shared = useContext(OptimisticParamsContext);
  const own = useOptimisticParamsState(basePath);
  return shared ?? own;
}
