import { useEffect, useMemo, useRef, useState } from "react";
import {
  Form,
  Input,
  InputNumber,
  Switch,
  ColorPicker,
  Button,
  Space,
  Empty,
  Alert,
  Tag,
  Spin,
} from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { api, unwrap, ApiError } from "../api/client";
import type { components } from "../api/generated/schema";

type TemplateParamConfig = components["schemas"]["TemplateParamConfig"];

interface Props {
  templateKey: string | null;
  /** Demo title/text/image used for preview only; not the production values. */
  title?: string;
  text?: string;
  image?: string;
  /** Persisted template params from the parent form. */
  value?: Record<string, unknown>;
  onChange?: (next: Record<string, unknown>) => void;
}

interface ParamMap {
  [key: string]: TemplateParamConfig;
}

const RENDER_WIDTH = 320;

/**
 * Controlled template preview embedded inside the parent form.
 *
 * - `templateKey` change → fetches param schema only (no auto-render).
 * - User clicks "预览模板" to fetch substituted HTML and display it in an iframe
 *   scaled to fit `RENDER_WIDTH` while preserving the template's aspect ratio.
 * - Custom param edits flow back to parent via `onChange`.
 */
export function TemplatePreview({
  templateKey,
  title = "Real Video",
  text = "这里是测试文案 — 实际生成时会按分镜替换。",
  image = "",
  value,
  onChange,
}: Props) {
  const [paramConfig, setParamConfig] = useState<ParamMap>({});
  const [paramLoading, setParamLoading] = useState(false);
  const [renderLoading, setRenderLoading] = useState(false);
  const [iframeHtml, setIframeHtml] = useState<string | null>(null);
  const [iframeSize, setIframeSize] = useState<{ w: number; h: number } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Fetch param schema only — preview HTML is rendered on demand.
  useEffect(() => {
    if (!templateKey) {
      setParamConfig({});
      setIframeHtml(null);
      return;
    }

    let cancelled = false;
    setParamLoading(true);
    setError(null);
    setIframeHtml(null);
    (async () => {
      try {
        const r = await unwrap(
          api().GET("/api/frame/template/params", {
            params: { query: { template: templateKey } },
          })
        );
        if (cancelled) return;
        const cfg = (r.params ?? {}) as ParamMap;
        setParamConfig(cfg);

        // Seed missing keys in parent value with defaults so the form looks complete.
        if (onChange) {
          const seeded: Record<string, unknown> = { ...(value ?? {}) };
          let dirty = false;
          for (const [k, p] of Object.entries(cfg)) {
            if (!(k in seeded)) {
              seeded[k] = p.default;
              dirty = true;
            }
          }
          if (dirty) onChange(seeded);
        }
      } catch (e) {
        if (!cancelled) setError(`加载模板参数失败：${String(e)}`);
      } finally {
        if (!cancelled) setParamLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateKey]);

  const renderHtml = async () => {
    if (!templateKey) return;
    setRenderLoading(true);
    setError(null);
    try {
      const fullParams: Record<string, unknown> = {};
      for (const [k, p] of Object.entries(paramConfig)) {
        fullParams[k] = (value ?? {})[k] ?? p.default;
      }
      const r = await unwrap(
        api().POST("/api/frame/template/render-html", {
          body: {
            template: templateKey,
            title,
            text,
            image,
            params: fullParams,
          },
        })
      );
      setIframeHtml(r.html);
      setIframeSize({ w: r.width, h: r.height });
    } catch (e) {
      const detail = e instanceof ApiError ? JSON.stringify(e.body) : String(e);
      setError(detail);
    } finally {
      setRenderLoading(false);
    }
  };

  const updateParam = (key: string, v: unknown) => {
    if (!onChange) return;
    onChange({ ...(value ?? {}), [key]: v });
  };

  const paramKeys = useMemo(() => Object.keys(paramConfig), [paramConfig]);
  const hasParams = paramKeys.length > 0;

  if (!templateKey) {
    return <Empty description="选择模板后显示预览" />;
  }

  // Compute consistent scale + height so the iframe fills its container exactly.
  const scale = iframeSize ? RENDER_WIDTH / iframeSize.w : 1;
  const scaledHeight = iframeSize ? iframeSize.h * scale : 0;

  return (
    <Spin spinning={paramLoading}>
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        {hasParams && (
          <Form layout="vertical" size="small">
            {paramKeys.map((key) => {
              const p = paramConfig[key];
              const current = (value ?? {})[key] ?? p.default;
              return (
                <Form.Item
                  key={key}
                  label={
                    <span>
                      {key} <Tag>{p.type}</Tag>
                    </span>
                  }
                  style={{ marginBottom: 8 }}
                >
                  {renderParamInput(p, current, (v) => updateParam(key, v))}
                </Form.Item>
              );
            })}
          </Form>
        )}

        <Button
          type="primary"
          icon={<ReloadOutlined />}
          loading={renderLoading}
          onClick={renderHtml}
          block
        >
          预览模板
        </Button>

        {error && (
          <Alert
            type="error"
            showIcon
            message="错误"
            description={error}
            closable
            onClose={() => setError(null)}
          />
        )}

        {iframeHtml && iframeSize && (
          <div
            style={{
              width: RENDER_WIDTH,
              height: scaledHeight,
              border: "1px dashed #d9d9d9",
              borderRadius: 6,
              overflow: "hidden",
              background: "#fafafa",
              alignSelf: "center",
            }}
          >
            <iframe
              ref={iframeRef}
              srcDoc={iframeHtml}
              sandbox="allow-same-origin"
              style={{
                width: iframeSize.w,
                height: iframeSize.h,
                border: 0,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
              }}
              title="frame-preview"
            />
          </div>
        )}
      </Space>
    </Spin>
  );
}

function renderParamInput(
  p: TemplateParamConfig,
  value: unknown,
  onChange: (v: unknown) => void
) {
  switch (p.type) {
    case "number":
      return (
        <InputNumber
          value={value as number}
          onChange={(v) => onChange(v ?? 0)}
          style={{ width: "100%" }}
        />
      );
    case "color":
      return (
        <ColorPicker
          value={value as string}
          onChange={(c) => onChange(c.toHexString())}
          showText
        />
      );
    case "bool":
      return (
        <Switch
          checked={Boolean(value)}
          onChange={(v) => onChange(v)}
        />
      );
    default:
      return (
        <Input
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}
