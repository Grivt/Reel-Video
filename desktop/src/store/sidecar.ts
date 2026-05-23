import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export type SidecarStatus = "starting" | "ready" | "failed";

export interface SidecarInfo {
  status: SidecarStatus;
  base_url: string | null;
  error: string | null;
  ffmpeg_path: string | null;
}

interface SidecarStore extends SidecarInfo {
  pollHandle: number | null;
  startPolling: () => void;
  stopPolling: () => void;
}

export const useSidecar = create<SidecarStore>((set, get) => ({
  status: "starting",
  base_url: null,
  error: null,
  ffmpeg_path: null,
  pollHandle: null,

  startPolling: () => {
    if (get().pollHandle !== null) return;

    const tick = async () => {
      try {
        const info = await invoke<SidecarInfo>("get_sidecar_info");
        set({
          status: info.status,
          base_url: info.base_url,
          error: info.error,
          ffmpeg_path: info.ffmpeg_path,
        });
        if (info.status === "ready") {
          get().stopPolling();
        }
      } catch (e) {
        set({ error: String(e) });
      }
    };

    void tick();
    const handle = window.setInterval(tick, 800);
    set({ pollHandle: handle });
  },

  stopPolling: () => {
    const h = get().pollHandle;
    if (h !== null) {
      window.clearInterval(h);
      set({ pollHandle: null });
    }
  },
}));

export function getApiBaseUrl(): string {
  const url = useSidecar.getState().base_url;
  if (!url) {
    throw new Error("Sidecar not ready: base URL unavailable");
  }
  return url;
}
