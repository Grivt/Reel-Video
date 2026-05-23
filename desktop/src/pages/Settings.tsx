import { useEffect, useRef, useState } from "react";
import {
  Card,
  Form,
  Input,
  Select,
  Button,
  Tabs,
  Space,
  Typography,
  Alert,
  Tag,
  InputNumber,
  App as AntdApp,
} from "antd";
import { ExperimentOutlined, SaveOutlined } from "@ant-design/icons";
import { api, unwrap, ApiError } from "../api/client";
import type { components } from "../api/generated/schema";

type LLMConfig = components["schemas"]["LLMConfig"];
type ComfyUIConfig = components["schemas"]["ComfyUIConfig"];
type LLMPreset = components["schemas"]["LLMPreset"];

const { Text, Paragraph } = Typography;

export function Settings() {
  return (
    <Card>
      <Tabs
        items={[
          { key: "llm", label: "LLM 配置", children: <LLMSettings /> },
          {
            key: "comfyui",
            label: "ComfyUI / RunningHub",
            children: <ComfyUISettings />,
          },
        ]}
      />
    </Card>
  );
}

const CUSTOM_PRESET = "__custom__";

/**
 * Shows a persistent success/error banner for ~4s after save/test.
 * antd's `message` toast is easy to miss; this gives users an in-flow,
 * impossible-to-overlook confirmation that the click actually did something.
 */
function useSaveBanner() {
  const [banner, setBanner] = useState<{
    type: "success" | "error" | "warning";
    text: string;
  } | null>(null);
  const timerRef = useRef<number | null>(null);

  const show = (type: "success" | "error" | "warning", text: string) => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    setBanner({ type, text });
    timerRef.current = window.setTimeout(() => setBanner(null), 4000);
  };
  const clear = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    setBanner(null);
  };

  return { banner, show, clear };
}

function LLMSettings() {
  const [form] = Form.useForm<LLMConfig>();
  const [presets, setPresets] = useState<LLMPreset[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  // antd v5 + AntdApp wrapper: static `message.success()` silently drops; use
  // the context-bound instance so toasts actually render.
  const { message } = AntdApp.useApp();
  const { banner, show, clear } = useSaveBanner();

  useEffect(() => {
    (async () => {
      try {
        const cfg = await unwrap(api().GET("/api/config/llm"));
        form.setFieldsValue(cfg);
        const r = await unwrap(api().GET("/api/config/llm/presets"));
        setPresets(r.presets);
        // Reflect existing config against known presets so the dropdown shows a sensible label.
        const matched = r.presets.find(
          (p) => p.base_url === cfg.base_url && p.model === cfg.model
        );
        setSelectedPreset(
          matched?.name ?? (cfg.base_url || cfg.model ? CUSTOM_PRESET : undefined)
        );
      } catch (e) {
        message.error(`加载 LLM 配置失败：${String(e)}`);
      }
    })();
  }, [form, message]);

  const onSelectPreset = (name: string) => {
    setSelectedPreset(name);
    if (name === CUSTOM_PRESET) {
      form.setFieldsValue({ base_url: "", model: "", api_key: "" });
      return;
    }
    const p = presets.find((x) => x.name === name);
    if (!p) return;
    form.setFieldsValue({
      base_url: p.base_url,
      model: p.model,
      api_key: p.default_api_key ?? form.getFieldValue("api_key") ?? "",
    });
  };

  const onSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await unwrap(api().PUT("/api/config/llm", { body: values }));
      message.success("LLM 配置已保存");
      show("success", "✅ LLM 配置已保存并生效");
    } catch (e) {
      const detail =
        e instanceof ApiError
          ? JSON.stringify(e.body)
          : e instanceof Error
          ? e.message
          : String(e);
      message.error(`保存失败：${detail}`);
      show("error", `保存失败：${detail.slice(0, 200)}`);
    } finally {
      setSaving(false);
    }
  };

  const onTest = async () => {
    try {
      const values = await form.validateFields();
      setTesting(true);
      const r = await unwrap(
        api().POST("/api/config/llm/test", {
          body: {
            api_key: values.api_key,
            base_url: values.base_url,
            model: values.model,
          },
        })
      );
      if (r.success) {
        const text = `${r.message}${r.detail ? ` · ${r.detail}` : ""}`;
        message.success(text);
        show("success", `✅ ${text}`);
      } else {
        const text = `${r.message}：${r.detail ?? ""}`;
        message.error(text);
        show("error", `❌ ${text}`);
      }
    } catch (e) {
      const detail = String(e);
      message.error(`测试失败：${detail}`);
      show("error", `测试失败：${detail.slice(0, 200)}`);
    } finally {
      setTesting(false);
    }
  };

  const apiKeyUrl = (() => {
    if (selectedPreset === CUSTOM_PRESET) return null;
    const p = presets.find(
      (p) =>
        p.base_url === form.getFieldValue("base_url") &&
        p.model === form.getFieldValue("model")
    );
    return p?.api_key_url ?? null;
  })();

  return (
    <Form form={form} layout="vertical">
      <Form.Item label="预设" tooltip="选「自定义」可使用任意第三方 OpenAI 兼容 API">
        <Select
          placeholder="选择 LLM 提供商预设"
          value={selectedPreset}
          options={[
            ...presets.map((p) => ({ value: p.name, label: p.name })),
            { value: CUSTOM_PRESET, label: "自定义（第三方 / 自建 API）" },
          ]}
          onChange={onSelectPreset}
          allowClear
        />
      </Form.Item>
      <Form.Item
        name="api_key"
        label="API Key"
        rules={[{ required: true, message: "请输入 API Key" }]}
        extra={
          apiKeyUrl && (
            <a href={apiKeyUrl} target="_blank" rel="noreferrer">
              🔑 获取 API Key
            </a>
          )
        }
      >
        <Input.Password placeholder="sk-..." autoComplete="off" />
      </Form.Item>
      <Form.Item
        name="base_url"
        label="Base URL"
        rules={[{ required: true, message: "请输入 Base URL" }]}
      >
        <Input placeholder="https://..." />
      </Form.Item>
      <Form.Item
        name="model"
        label="Model"
        rules={[{ required: true, message: "请输入模型名" }]}
      >
        <Input placeholder="gpt-4o / qwen-max / deepseek-chat ..." />
      </Form.Item>

      <Space>
        <Button
          type="primary"
          icon={<SaveOutlined />}
          loading={saving}
          onClick={onSave}
        >
          保存
        </Button>
        <Button icon={<ExperimentOutlined />} loading={testing} onClick={onTest}>
          测试连接
        </Button>
      </Space>

      {banner && (
        <Alert
          type={banner.type}
          message={banner.text}
          showIcon
          closable
          onClose={clear}
          style={{ marginTop: 12 }}
        />
      )}
    </Form>
  );
}

function ComfyUISettings() {
  const [form] = Form.useForm<ComfyUIConfig>();
  const [saving, setSaving] = useState(false);
  const { message } = AntdApp.useApp();
  const { banner, show, clear } = useSaveBanner();

  useEffect(() => {
    (async () => {
      try {
        const cfg = await unwrap(api().GET("/api/config/comfyui"));
        form.setFieldsValue(cfg);
      } catch (e) {
        message.error(`加载 ComfyUI 配置失败：${String(e)}`);
      }
    })();
  }, [form, message]);

  const onSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await unwrap(api().PUT("/api/config/comfyui", { body: values }));
      message.success("ComfyUI 配置已保存");
      show("success", "✅ ComfyUI / RunningHub 配置已保存并生效");
    } catch (e) {
      const detail =
        e instanceof ApiError
          ? JSON.stringify(e.body)
          : e instanceof Error
          ? e.message
          : String(e);
      message.error(`保存失败：${detail}`);
      show("error", `保存失败：${detail.slice(0, 200)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Form form={form} layout="vertical">
      <Alert
        type="info"
        showIcon
        message="生图 / 生视频可选两种方式"
        description={
          <Paragraph style={{ marginBottom: 0 }}>
            <Text strong>RunningHub 云端</Text>（推荐，零配置） /
            <Text strong> 本地 ComfyUI</Text>（需要自己部署 ComfyUI 服务）。
            两者至少配置一个。
          </Paragraph>
        }
        style={{ marginBottom: 16 }}
      />

      <Card type="inner" title={<><Tag color="processing">推荐</Tag> RunningHub 云端</>} size="small">
        <Form.Item
          name="runninghub_api_key"
          label="RunningHub API Key"
          extra={
            <a href="https://www.runninghub.cn/?utm_source=reel" target="_blank" rel="noreferrer">
              注册并获取 API Key →
            </a>
          }
        >
          <Input.Password placeholder="留空则不启用云端" autoComplete="off" />
        </Form.Item>
        <Form.Item
          name="runninghub_concurrent_limit"
          label="并发上限"
          tooltip="1-10。普通会员建议 1，会员可调高"
        >
          <InputNumber min={1} max={10} />
        </Form.Item>
      </Card>

      <Card type="inner" title="本地 ComfyUI（可选）" size="small" style={{ marginTop: 12 }}>
        <Form.Item
          name="comfyui_url"
          label="ComfyUI 地址"
          tooltip="本地或局域网部署的 ComfyUI 服务地址"
        >
          <Input placeholder="http://127.0.0.1:8188" />
        </Form.Item>
        <Form.Item
          name="comfyui_api_key"
          label="ComfyUI API Key（如需）"
        >
          <Input.Password placeholder="留空则匿名访问" autoComplete="off" />
        </Form.Item>
      </Card>

      <Button
        type="primary"
        icon={<SaveOutlined />}
        loading={saving}
        onClick={onSave}
        style={{ marginTop: 16 }}
      >
        保存
      </Button>

      {banner && (
        <Alert
          type={banner.type}
          message={banner.text}
          showIcon
          closable
          onClose={clear}
          style={{ marginTop: 12 }}
        />
      )}
    </Form>
  );
}
