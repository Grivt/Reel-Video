import { useState } from "react";
import { Input, Button, Space, Alert, message } from "antd";
import { SoundOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { api, unwrap, ApiError } from "../api/client";
import { useSidecar } from "../store/sidecar";

interface Props {
  /** "local" or "comfyui" */
  mode: "local" | "comfyui" | null | undefined;
  voice?: string | null;
  speed?: number | null;
  workflow?: string | null;
  refAudio?: string | null;
}

/**
 * Click-to-preview the current TTS settings — bound to /api/tts/synthesize.
 * Plays the returned audio inline. Works for both local Edge TTS and ComfyUI
 * workflows (uses whichever fields are bound by the caller).
 */
export function TTSPreview({ mode, voice, speed, workflow, refAudio }: Props) {
  const { t } = useTranslation();
  const [text, setText] = useState(() => t("tts.defaultText"));
  const [audio, setAudio] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const baseUrl = useSidecar((s) => s.base_url);

  const onPreview = async () => {
    if (!text.trim()) {
      message.warning(t("tts.pleaseInputText"));
      return;
    }
    setBusy(true);
    setErr(null);
    setAudio(null);
    try {
      const resp = await unwrap(
        api().POST("/api/tts/synthesize", {
          body: {
            text,
            inference_mode: mode ?? undefined,
            voice: mode === "local" ? voice ?? undefined : undefined,
            speed: mode === "local" ? speed ?? undefined : undefined,
            workflow: mode === "comfyui" ? workflow ?? undefined : undefined,
            ref_audio: mode === "comfyui" ? refAudio ?? undefined : undefined,
          },
        })
      );
      setAudio(audioUrl(resp.audio_path, baseUrl));
    } catch (e) {
      setErr(
        e instanceof ApiError ? JSON.stringify(e.body) : String(e)
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      <Input.TextArea
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t("tts.inputPlaceholder")}
      />
      <Button
        icon={<SoundOutlined />}
        loading={busy}
        onClick={onPreview}
        block
      >
        {t("tts.preview")}
      </Button>
      {err && (
        <Alert
          type="error"
          showIcon
          message={t("tts.previewFailed")}
          description={err}
          closable
          onClose={() => setErr(null)}
        />
      )}
      {audio && <audio src={audio} controls style={{ width: "100%" }} />}
    </Space>
  );
}

function audioUrl(path: string | null | undefined, base: string | null): string {
  if (!path) return "";
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  if (!base) return path;
  const norm = path.replace(/\\/g, "/");
  const idx = norm.indexOf("output/");
  const rel = idx >= 0 ? norm.slice(idx + "output/".length) : norm.split("/").pop() ?? norm;
  return `${base.replace(/\/$/, "")}/api/files/${rel}`;
}
