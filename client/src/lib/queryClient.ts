import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { get, set, del } from "idb-keyval";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

// IndexedDB cache persistence for instant UI loading
const CACHE_KEY = "npay-query-cache";
const CACHE_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours max cache age

// Keys that should be persisted for instant load
const PERSISTABLE_PREFIXES = [
  "/api/balance",
  "/api/xp",
  "/senador/balance",
];

function shouldPersistQuery(queryKey: unknown): boolean {
  if (!Array.isArray(queryKey) || queryKey.length === 0) return false;
  const key = queryKey[0];
  if (typeof key !== "string") return false;
  return PERSISTABLE_PREFIXES.some(prefix => key.startsWith(prefix));
}

interface CachedQuery {
  queryKey: unknown[];
  data: unknown;
  timestamp: number;
}

interface PersistedCache {
  queries: CachedQuery[];
  savedAt: number;
}

// Internal function to actually persist the cache
async function doPeristCache(): Promise<void> {
  try {
    const cache = queryClient.getQueryCache();
    const queries: CachedQuery[] = [];
    
    for (const query of cache.getAll()) {
      if (
        query.state.status === "success" &&
        query.state.data !== undefined &&
        shouldPersistQuery(query.queryKey)
      ) {
        queries.push({
          queryKey: query.queryKey as unknown[],
          data: query.state.data,
          timestamp: query.state.dataUpdatedAt,
        });
      }
    }
    
    if (queries.length > 0) {
      const persisted: PersistedCache = {
        queries,
        savedAt: Date.now(),
      };
      await set(CACHE_KEY, persisted);
      console.log(`[QueryCache] Persisted ${queries.length} queries to IndexedDB`);
    }
  } catch (error) {
    console.error("[QueryCache] Failed to persist cache:", error);
  }
}

// Save query cache to IndexedDB (debounced for subscription updates)
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
export function persistQueryCache(): void {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => doPeristCache(), 1000);
}

// Flush cache immediately (for use after hydration)
export async function flushQueryCache(): Promise<void> {
  if (saveTimeout) clearTimeout(saveTimeout);
  await doPeristCache();
}

// Restore query cache from IndexedDB on startup
export async function hydrateQueryCache(): Promise<void> {
  try {
    const persisted = await get<PersistedCache>(CACHE_KEY);
    
    if (!persisted || !persisted.queries) {
      console.log("[QueryCache] No persisted cache found");
      return;
    }
    
    // Check if cache is too old
    if (Date.now() - persisted.savedAt > CACHE_MAX_AGE) {
      console.log("[QueryCache] Persisted cache too old, clearing");
      await del(CACHE_KEY);
      return;
    }
    
    let hydratedCount = 0;
    const balanceQueriesToInvalidate: unknown[][] = [];
    
    for (const cached of persisted.queries) {
      // Hydrate ALL cached data for instant UI (offline-first)
      // Set data with original timestamp so React Query knows the true age
      queryClient.setQueryData(cached.queryKey, cached.data, {
        updatedAt: cached.timestamp,
      });
      hydratedCount++;
      
      // Track balance queries for immediate invalidation (force refetch when online)
      const keyStr = String(cached.queryKey[0]);
      if (keyStr.includes('/api/balance') || keyStr.includes('/api/dashboard')) {
        balanceQueriesToInvalidate.push(cached.queryKey);
      }
    }
    
    console.log(`[QueryCache] Hydrated ${hydratedCount}/${persisted.queries.length} queries from IndexedDB`);
    
    // Invalidate balance queries to force a fresh fetch (user expects up-to-date balances)
    // This shows cached data instantly while fetching fresh data in background
    for (const queryKey of balanceQueriesToInvalidate) {
      queryClient.invalidateQueries({ queryKey });
    }
    
    if (balanceQueriesToInvalidate.length > 0) {
      console.log(`[QueryCache] Invalidated ${balanceQueriesToInvalidate.length} balance queries for background refresh`);
    }
  } catch (error) {
    console.error("[QueryCache] Failed to hydrate cache:", error);
  }
}

// Subscribe to cache updates for persistence
queryClient.getQueryCache().subscribe((event) => {
  if (
    event.type === "updated" &&
    event.query.state.status === "success" &&
    shouldPersistQuery(event.query.queryKey)
  ) {
    persistQueryCache();
  }
});
