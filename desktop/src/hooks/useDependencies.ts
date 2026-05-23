import { useCallback, useEffect, useState } from "react";
import { api, unwrap } from "../api/client";

export type DependencyName = "ffmpeg" | "ffprobe";

export interface DependencyStatus {
  name: string;
  available: boolean;
  path: string | null;
}

export interface DependenciesInfo {
  platform: "windows" | "macos" | "linux";
  all_ok: boolean;
  missing: string[];
  dependencies: DependencyStatus[];
}

interface UseDependenciesResult {
  data: DependenciesInfo | null;
  loading: boolean;
  error: string | null;
  /** Re-probe — call after the user installs a missing dep to refresh. */
  refresh: () => Promise<void>;
}

/**
 * Probes the sidecar for required CLI dependencies (ffmpeg / ffprobe).
 *
 * Used by the Generate flow to fail fast at click-time if the system is
 * missing ffmpeg — otherwise the user waits through LLM + TTS + image gen
 * for several minutes before the final compose step crashes.
 */
export function useDependencies(autoProbe = true): UseDependenciesResult {
  const [data, setData] = useState<DependenciesInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // The OpenAPI client may not have been regenerated yet, so we hit the
      // endpoint via the raw client base URL too as a fallback.
      const c = api();
      const resp = await unwrap(
        // @ts-expect-error — schema may not be regen'd for /health/dependencies yet
        c.GET("/health/dependencies")
      );
      setData(resp as DependenciesInfo);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoProbe) void refresh();
  }, [autoProbe, refresh]);

  return { data, loading, error, refresh };
}
