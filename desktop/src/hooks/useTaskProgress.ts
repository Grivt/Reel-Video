import { useEffect, useState } from "react";
import { api, unwrap } from "../api/client";
import type { components } from "../api/generated/schema";

type Task = components["schemas"]["Task"];

interface UseTaskProgressOptions {
  taskId: string | null;
  intervalMs?: number;
}

export interface UseTaskProgressResult {
  task: Task | null;
  loading: boolean;
  error: string | null;
}

/**
 * Polls /api/tasks/{taskId} until the task reaches a terminal status.
 * Set `taskId` to null to stop polling.
 */
export function useTaskProgress({
  taskId,
  intervalMs = 1500,
}: UseTaskProgressOptions): UseTaskProgressResult {
  const [task, setTask] = useState<Task | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!taskId) {
      setTask(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const tick = async () => {
      try {
        const t = await unwrap(
          api().GET("/api/tasks/{task_id}", {
            params: { path: { task_id: taskId } },
          })
        );
        if (cancelled) return;
        setTask(t);
        const terminal =
          t.status === "completed" ||
          t.status === "failed" ||
          t.status === "cancelled";
        if (terminal) {
          setLoading(false);
          clearInterval(handle);
        }
      } catch (e) {
        if (cancelled) return;
        setError(String(e));
        setLoading(false);
        clearInterval(handle);
      }
    };

    void tick();
    const handle = window.setInterval(tick, intervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(handle);
    };
  }, [taskId, intervalMs]);

  return { task, loading, error };
}
