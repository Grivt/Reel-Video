import { useEffect, useMemo, useState } from "react";
import { api, unwrap } from "../api/client";
import type { components } from "../api/generated/schema";

type TemplateInfo = components["schemas"]["TemplateInfo"];
type WorkflowInfo = components["schemas"]["WorkflowInfo"];
type BGMInfo = components["schemas"]["BGMInfo"];
type TTSVoiceInfo = components["schemas"]["TTSVoiceInfo"];

export type TemplateType = "static" | "image" | "video";

interface Resources {
  templates: TemplateInfo[];
  ttsWorkflows: WorkflowInfo[];
  mediaWorkflows: WorkflowInfo[];
  bgmFiles: BGMInfo[];
  ttsVoices: TTSVoiceInfo[];
}

export interface UseResourcesResult extends Partial<Resources> {
  loading: boolean;
  error: string | null;
  reload: () => void;
  // Helper: templates grouped by type.
  templatesByType: Record<TemplateType, TemplateInfo[]>;
}

const EMPTY_GROUPS: Record<TemplateType, TemplateInfo[]> = {
  static: [],
  image: [],
  video: [],
};

export function useResources(): UseResourcesResult {
  const [data, setData] = useState<Resources | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const c = api();
        const [tpl, tts, media, bgm, voices] = await Promise.all([
          unwrap(c.GET("/api/resources/templates")),
          unwrap(c.GET("/api/resources/workflows/tts")),
          unwrap(c.GET("/api/resources/workflows/media")),
          unwrap(c.GET("/api/resources/bgm")),
          unwrap(c.GET("/api/resources/tts/voices")),
        ]);
        if (cancelled) return;
        setData({
          templates: tpl.templates,
          ttsWorkflows: tts.workflows,
          mediaWorkflows: media.workflows,
          bgmFiles: bgm.bgm_files,
          ttsVoices: voices.voices,
        });
      } catch (e) {
        if (cancelled) return;
        setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tick]);

  const templatesByType = useMemo<Record<TemplateType, TemplateInfo[]>>(() => {
    if (!data?.templates) return EMPTY_GROUPS;
    const groups: Record<TemplateType, TemplateInfo[]> = {
      static: [],
      image: [],
      video: [],
    };
    for (const t of data.templates) {
      const type = (t.template_type ?? "image") as TemplateType;
      if (type in groups) groups[type].push(t);
      else groups.image.push(t);
    }
    return groups;
  }, [data?.templates]);

  return {
    ...data,
    loading,
    error,
    reload: () => setTick((t) => t + 1),
    templatesByType,
  };
}
