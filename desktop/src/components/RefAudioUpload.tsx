import { useState } from "react";
import { Upload, Button, Space, Alert, Typography, Tag, message } from "antd";
import { UploadOutlined, DeleteOutlined } from "@ant-design/icons";
import type { UploadProps } from "antd";
import { useTranslation } from "react-i18next";
import { useSidecar } from "../store/sidecar";

const { Text } = Typography;

interface Props {
  /** Server-relative path (e.g. "temp/ref_audio_xxx.mp3") to send to the backend. */
  value?: string | null;
  onChange?: (path: string | null) => void;
}

/**
 * Upload a reference audio clip for voice cloning (ComfyUI TTS workflows).
 * Posts to /api/files/upload via plain fetch (openapi-fetch wants JSON, but this
 * endpoint is multipart) and stores the returned project-relative path.
 */
export function RefAudioUpload({ value, onChange }: Props) {
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const baseUrl = useSidecar((s) => s.base_url);

  const uploadProps: UploadProps = {
    accept: ".mp3,.wav,.flac,.m4a,.aac,.ogg",
    showUploadList: false,
    maxCount: 1,
    beforeUpload: async (file) => {
      if (!baseUrl) {
        message.error(t("refAudio.backendNotReady"));
        return Upload.LIST_IGNORE;
      }
      setUploading(true);
      setErr(null);
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("kind", "ref_audio");
        const resp = await fetch(`${baseUrl.replace(/\/$/, "")}/api/files/upload`, {
          method: "POST",
          body: fd,
        });
        if (!resp.ok) {
          const txt = await resp.text();
          throw new Error(`HTTP ${resp.status}: ${txt}`);
        }
        const data = (await resp.json()) as { path: string };
        onChange?.(data.path);
        // Build a playable preview URL from a local Blob (the uploaded file itself).
        setPreviewUrl(URL.createObjectURL(file));
        message.success(t("refAudio.uploadSuccess"));
      } catch (e) {
        setErr(String(e));
      } finally {
        setUploading(false);
      }
      return Upload.LIST_IGNORE;
    },
  };

  const clear = () => {
    onChange?.(null);
    setPreviewUrl(null);
    setErr(null);
  };

  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      <Space>
        <Upload {...uploadProps}>
          <Button icon={<UploadOutlined />} loading={uploading}>
            {t("refAudio.upload")}
          </Button>
        </Upload>
        {value && (
          <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={clear}>
            {t("refAudio.clear")}
          </Button>
        )}
      </Space>
      {value && (
        <div>
          <Tag color="success">{t("refAudio.uploaded")}</Tag>
          <Text type="secondary" style={{ fontSize: 12 }} copyable>
            {value}
          </Text>
        </div>
      )}
      {previewUrl && <audio src={previewUrl} controls style={{ width: "100%" }} />}
      {err && (
        <Alert
          type="error"
          showIcon
          message={t("refAudio.uploadFailed")}
          description={err}
          closable
          onClose={() => setErr(null)}
        />
      )}
    </Space>
  );
}
