import { useEffect, useMemo, useState } from "react";
import {
  Form,
  Input,
  Select,
  Button,
  Card,
  Row,
  Col,
  Slider,
  Radio,
  Collapse,
  Progress,
  Alert,
  Space,
  Typography,
  message,
  Tag,
  Divider,
  Segmented,
  App as AntdApp,
} from "antd";
import {
  PlayCircleOutlined,
  ReloadOutlined,
  VideoCameraOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { api, unwrap, ApiError } from "../api/client";
import { useResources, type TemplateType } from "../hooks/useResources";
import { useTaskProgress } from "../hooks/useTaskProgress";
import { useDependencies } from "../hooks/useDependencies";
import { useSidecar } from "../store/sidecar";
import { TemplatePreview } from "../components/TemplatePreview";
import { TTSPreview } from "../components/TTSPreview";
import { RefAudioUpload } from "../components/RefAudioUpload";
import type { components } from "../api/generated/schema";

type VideoGenerateRequest = components["schemas"]["VideoGenerateRequest"];

const { Title, Text, Paragraph } = Typography;

// Form-only fields not part of the API request body.
// `template_params` is widened from openapi-typescript's strict `{[x]: {} | undefined}`
// to `Record<string, unknown>` so our typed param editors don't fight the form.
type FormShape = Omit<VideoGenerateRequest, "template_params"> & {
  template_type: TemplateType;
  template_params?: Record<string, unknown> | null;
};

const DEFAULT_VALUES: Partial<FormShape> = {
  mode: "generate",
  n_scenes: 5,
  video_fps: 30,
  bgm_volume: 0.3,
  min_narration_words: 5,
  max_narration_words: 20,
  min_image_prompt_words: 30,
  max_image_prompt_words: 60,
  tts_inference_mode: "local",
  tts_voice: "zh-CN-YunjianNeural",
  tts_speed: 1.0,
  template_type: "image",
};

// Preferred keys when the user hasn't picked anything yet.
const PREFERRED = {
  mediaWorkflow: "runninghub/image_Z-image.json",
  ttsWorkflow: "runninghub/tts_index2.json",
  // Template default per type — first match wins, then any `*_default.html`.
  templateBaseName: "_default.html",
};

export function Home() {
  const { t } = useTranslation();
  const [form] = Form.useForm<FormShape>();
  const [submitting, setSubmitting] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [defaultsApplied, setDefaultsApplied] = useState(false);
  const baseUrl = useSidecar((s) => s.base_url);
  const resources = useResources();
  const progress = useTaskProgress({ taskId });
  const deps = useDependencies();
  const { modal } = AntdApp.useApp();

  const mode = Form.useWatch("mode", form);
  const ttsMode = Form.useWatch("tts_inference_mode", form);
  const ttsVoiceWatch = Form.useWatch("tts_voice", form);
  const ttsSpeedWatch = Form.useWatch("tts_speed", form);
  const ttsWorkflowWatch = Form.useWatch("tts_workflow", form);
  const refAudioWatch = Form.useWatch("ref_audio", form);
  const templateType = Form.useWatch("template_type", form);
  const frameTemplate = Form.useWatch("frame_template", form);
  const templateParams = Form.useWatch("template_params", form) as
    | Record<string, unknown>
    | undefined;

  // Auto-derive video URL when task completes.
  if (
    progress.task?.status === "completed" &&
    progress.task.result &&
    typeof progress.task.result === "object" &&
    "video_url" in progress.task.result &&
    typeof (progress.task.result as { video_url: unknown }).video_url ===
      "string" &&
    (progress.task.result as { video_url: string }).video_url !== videoUrl
  ) {
    setVideoUrl((progress.task.result as { video_url: string }).video_url);
  }

  // Apply sensible defaults once resources are loaded (one-shot).
  useEffect(() => {
    if (defaultsApplied) return;
    if (resources.loading) return;
    if (!resources.templates || !resources.mediaWorkflows || !resources.ttsWorkflows) return;

    const updates: Partial<FormShape> = {};
    const current = form.getFieldsValue(true);

    if (!current.media_workflow) {
      const pref = resources.mediaWorkflows.find((w) => w.key === PREFERRED.mediaWorkflow);
      updates.media_workflow = pref?.key ?? resources.mediaWorkflows[0]?.key ?? undefined;
    }
    if (!current.tts_workflow) {
      const pref = resources.ttsWorkflows.find((w) => w.key === PREFERRED.ttsWorkflow);
      updates.tts_workflow = pref?.key ?? resources.ttsWorkflows[0]?.key ?? undefined;
    }
    if (!current.frame_template) {
      const type: TemplateType = current.template_type ?? "image";
      const group = resources.templatesByType[type];
      const def =
        group.find((t) => t.name === `${type}_default.html`) ??
        group.find((t) => t.name.endsWith(PREFERRED.templateBaseName)) ??
        group[0];
      if (def) updates.frame_template = def.key;
    }

    if (Object.keys(updates).length) {
      // antd's RecursivePartial collapses `unknown` index signatures to `{}`, fighting
      // openapi-typescript's `template_params` shape. Bypass with a cast — values
      // themselves are validated by Pydantic on the backend.
      form.setFieldsValue(updates as never);
    }
    setDefaultsApplied(true);
  }, [resources.loading, resources.templates, resources.mediaWorkflows, resources.ttsWorkflows, resources.templatesByType, defaultsApplied, form]);

  // When the user switches template type, fall back to that type's default if the
  // currently-selected template no longer matches.
  useEffect(() => {
    if (!defaultsApplied) return;
    if (!templateType) return;
    const group = resources.templatesByType[templateType];
    if (group.length === 0) return;
    const currentKey = form.getFieldValue("frame_template");
    const stillValid = group.some((t) => t.key === currentKey);
    if (stillValid) return;
    const def =
      group.find((t) => t.name === `${templateType}_default.html`) ??
      group.find((t) => t.name.endsWith(PREFERRED.templateBaseName)) ??
      group[0];
    form.setFieldsValue({ frame_template: def.key, template_params: {} });
  }, [templateType, resources.templatesByType, defaultsApplied, form]);

  const templateOptionsForType = useMemo(() => {
    const group = resources.templatesByType[templateType ?? "image"];
    return group.map((t) => ({
      value: t.key,
      label: `${t.name} · ${t.size} · ${t.orientation}`,
    }));
  }, [resources.templatesByType, templateType]);

  const ttsWorkflowOptions = useMemo(
    () =>
      (resources.ttsWorkflows ?? []).map((w) => ({
        value: w.key,
        label: w.display_name,
      })),
    [resources.ttsWorkflows]
  );

  const voiceOptions = useMemo(
    () =>
      (resources.ttsVoices ?? []).map((v) => ({
        value: v.id,
        // display_name comes from the project's own i18n (zh_CN), falls back to id.
        label: `${v.display_name} · ${v.locale}`,
      })),
    [resources.ttsVoices]
  );

  const filteredMediaWorkflowOptions = useMemo(() => {
    const list = resources.mediaWorkflows ?? [];
    const type = templateType ?? "image";
    if (type === "static") return [];
    const wanted = type === "video" ? "video_" : "image_";
    return list
      .filter((w) => w.key.toLowerCase().includes(wanted))
      .map((w) => ({ value: w.key, label: w.display_name }));
  }, [resources.mediaWorkflows, templateType]);

  const bgmOptions = useMemo(
    () => [
      { value: "", label: t("home.noBgm") },
      ...(resources.bgmFiles ?? []).map((b) => ({
        value: b.path,
        label: `${b.name} · ${b.source}`,
      })),
    ],
    [resources.bgmFiles, t]
  );

  const showMissingDepsModal = (
    missing: string[],
    platform: "windows" | "macos" | "linux"
  ) => {
    const installCmd =
      platform === "macos"
        ? "brew install ffmpeg"
        : platform === "linux"
        ? "sudo apt-get install ffmpeg"
        : "winget install Gyan.FFmpeg";
    const downloadUrl =
      platform === "windows"
        ? "https://www.gyan.dev/ffmpeg/builds/"
        : platform === "macos"
        ? "https://evermeet.cx/ffmpeg/"
        : "https://ffmpeg.org/download.html";
    modal.error({
      title: t("home.depsModalTitle", { deps: missing.join(" / ") }),
      width: 540,
      content: (
        <div>
          <Paragraph style={{ marginBottom: 8 }}>{t("home.depsBody1")}</Paragraph>
          <Paragraph type="secondary" style={{ marginBottom: 4 }}>
            {t("home.depsCmdLabel")}
          </Paragraph>
          <Paragraph copyable={{ text: installCmd }}>
            <Text code style={{ fontSize: 13 }}>{installCmd}</Text>
          </Paragraph>
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            {t("home.depsManualLabel")}
            <br />
            <a href={downloadUrl} target="_blank" rel="noreferrer">{downloadUrl}</a>
          </Paragraph>
          <Alert
            type="info"
            showIcon
            message={t("home.depsInstalledInfo")}
            style={{ marginTop: 12 }}
          />
        </div>
      ),
      okText: t("common.gotIt"),
    });
  };

  const onSubmit = async (values: FormShape) => {
    // Pre-flight: re-probe dependencies so the user gets an immediate error
    // instead of waiting through TTS + image gen only to crash at compose.
    try {
      await deps.refresh();
    } catch {}
    const fresh = deps.data;
    if (fresh && !fresh.all_ok) {
      showMissingDepsModal(fresh.missing, fresh.platform);
      return;
    }

    setSubmitting(true);
    setVideoUrl(null);
    try {
      // Strip form-only fields and normalize "no BGM".
      const { template_type, ...rest } = values;
      const body = {
        ...DEFAULT_VALUES,
        ...rest,
        bgm_path: rest.bgm_path || null,
      } as unknown as VideoGenerateRequest;

      // When TTS mode is "local", clear workflow + ref_audio to avoid pipeline confusion.
      if (body.tts_inference_mode === "local") {
        body.tts_workflow = null;
        body.ref_audio = null;
      } else if (body.tts_inference_mode === "comfyui") {
        // Voice/speed still flow through for workflows that accept them.
      }

      const resp = await unwrap(
        api().POST("/api/video/generate/async", { body })
      );
      setTaskId(resp.task_id);
      message.success(t("home.submitted", { id: resp.task_id.slice(0, 8) }));
    } catch (e) {
      const detail =
        e instanceof ApiError ? JSON.stringify(e.body, null, 2) : String(e);
      message.error(t("home.submitFailed", { detail: detail.slice(0, 300) }));
    } finally {
      setSubmitting(false);
    }
  };

  const status = progress.task?.status;
  const pct = progress.task?.progress?.percentage ?? 0;
  const progressMsg = progress.task?.progress?.message ?? "";

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={DEFAULT_VALUES}
      onFinish={onSubmit}
      disabled={submitting || status === "running" || status === "pending"}
    >
      <Row gutter={16}>
        {/* === 左栏：内容输入 === */}
        <Col span={8}>
          <Card title={t("home.contentInput")} size="small">
            <Form.Item
              name="mode"
              label={t("home.mode")}
              tooltip={t("home.modeTooltip")}
            >
              <Radio.Group>
                <Radio.Button value="generate">{t("home.modeGenerate")}</Radio.Button>
                <Radio.Button value="fixed">{t("home.modeFixed")}</Radio.Button>
              </Radio.Group>
            </Form.Item>

            <Form.Item
              name="text"
              label={mode === "fixed" ? t("home.fullText") : t("home.videoTopic")}
              rules={[{ required: true, message: t("home.textRequired") }]}
            >
              <Input.TextArea
                rows={mode === "fixed" ? 8 : 4}
                placeholder={
                  mode === "fixed"
                    ? t("home.fullTextPlaceholder")
                    : t("home.topicPlaceholder")
                }
              />
            </Form.Item>

            <Form.Item name="title" label={t("home.videoTitle")}>
              <Input placeholder={t("home.titlePlaceholder")} />
            </Form.Item>

            {mode === "generate" && (
              <Form.Item name="n_scenes" label={t("home.sceneCount")}>
                <Slider min={3} max={10} marks={{ 3: "3", 5: "5", 8: "8", 10: "10" }} />
              </Form.Item>
            )}

            <Form.Item name="bgm_path" label={t("home.bgm")}>
              <Select
                options={bgmOptions}
                placeholder={t("home.bgmPlaceholder")}
                loading={resources.loading}
              />
            </Form.Item>
            <Form.Item name="bgm_volume" label={t("home.bgmVolume")}>
              <Slider min={0} max={1} step={0.05} />
            </Form.Item>
          </Card>
        </Col>

        {/* === 中栏：TTS + 视觉 === */}
        <Col span={8}>
          <Card title={t("home.ttsCard")} size="small">
            <Form.Item name="tts_inference_mode" label={t("home.ttsMethod")}>
              <Radio.Group>
                <Radio.Button value="local">{t("home.ttsLocal")}</Radio.Button>
                <Radio.Button value="comfyui">{t("home.ttsComfy")}</Radio.Button>
              </Radio.Group>
            </Form.Item>

            {ttsMode === "local" ? (
              <>
                <Form.Item name="tts_voice" label={t("home.voice")}>
                  <Select
                    options={voiceOptions}
                    showSearch
                    optionFilterProp="label"
                    loading={resources.loading}
                  />
                </Form.Item>
                <Form.Item name="tts_speed" label={t("home.speed")}>
                  <Slider
                    min={0.5}
                    max={2}
                    step={0.05}
                    marks={{ 0.5: "0.5x", 1: "1.0x", 1.2: "1.2x", 1.5: "1.5x", 2: "2.0x" }}
                  />
                </Form.Item>
              </>
            ) : (
              <>
                <Form.Item name="tts_workflow" label={t("home.ttsWorkflow")}>
                  <Select
                    options={ttsWorkflowOptions}
                    loading={resources.loading}
                    showSearch
                    optionFilterProp="label"
                  />
                </Form.Item>
                <Form.Item
                  label={t("home.refAudioLabel")}
                  tooltip={t("home.refAudioTooltip")}
                >
                  <Form.Item name="ref_audio" noStyle>
                    <Input type="hidden" />
                  </Form.Item>
                  <RefAudioUpload
                    value={refAudioWatch}
                    onChange={(p) =>
                      form.setFieldsValue({ ref_audio: p } as never)
                    }
                  />
                </Form.Item>
              </>
            )}

            <Collapse
              size="small"
              ghost
              items={[
                {
                  key: "tts-preview",
                  label: t("home.ttsPreview"),
                  children: (
                    <TTSPreview
                      mode={ttsMode ?? "local"}
                      voice={ttsVoiceWatch}
                      speed={ttsSpeedWatch}
                      workflow={ttsWorkflowWatch}
                      refAudio={refAudioWatch}
                    />
                  ),
                },
              ]}
            />
          </Card>

          <Card title={t("home.visual")} size="small" style={{ marginTop: 12 }}>
            <Form.Item name="template_type" label={t("home.templateType")}>
              <Segmented
                options={[
                  { value: "static", label: t("home.tplStatic") },
                  { value: "image", label: t("home.tplImage") },
                  { value: "video", label: t("home.tplVideo") },
                ]}
                block
              />
            </Form.Item>

            <Form.Item
              name="frame_template"
              label={t("home.templateField")}
              rules={[{ required: true, message: t("home.templateRequired") }]}
            >
              <Select
                options={templateOptionsForType}
                loading={resources.loading}
                placeholder={t("home.templatePlaceholder")}
                showSearch
                optionFilterProp="label"
              />
            </Form.Item>

            {templateType !== "static" && (
              <Form.Item
                name="media_workflow"
                label={templateType === "video" ? t("home.videoWorkflow") : t("home.imageWorkflow")}
              >
                <Select
                  options={filteredMediaWorkflowOptions}
                  loading={resources.loading}
                  showSearch
                  optionFilterProp="label"
                  placeholder={
                    filteredMediaWorkflowOptions.length === 0
                      ? t("home.noMatchWorkflow")
                      : t("home.selectWorkflow")
                  }
                />
              </Form.Item>
            )}

            <Collapse
              size="small"
              ghost
              items={[
                {
                  key: "advanced",
                  label: t("home.advanced"),
                  children: (
                    <>
                      <Form.Item
                        name="prompt_prefix"
                        label={t("home.promptPrefix")}
                        tooltip={t("home.promptPrefixTooltip")}
                      >
                        <Input.TextArea
                          rows={2}
                          placeholder={t("home.promptPrefixPlaceholder")}
                        />
                      </Form.Item>
                      <Form.Item name="video_fps" label={t("home.videoFps")}>
                        <Slider min={15} max={60} marks={{ 15: "15", 30: "30", 60: "60" }} />
                      </Form.Item>
                    </>
                  ),
                },
              ]}
            />

            <Divider style={{ margin: "8px 0" }} />
            <Text strong>{t("home.templatePreviewLabel")}</Text>
            <Form.Item name="template_params" hidden>
              <Input />
            </Form.Item>
            <div style={{ marginTop: 8 }}>
              <TemplatePreview
                templateKey={frameTemplate ?? null}
                title={form.getFieldValue("title") || "Real Video"}
                text={(form.getFieldValue("text") as string)?.slice(0, 60) || t("home.sampleSceneText")}
                value={templateParams as Record<string, unknown> | undefined}
                onChange={(next) =>
                  form.setFieldsValue({ template_params: next } as never)
                }
              />
            </div>
          </Card>
        </Col>

        {/* === 右栏：生成 + 进度 + 视频预览 === */}
        <Col span={8}>
          <Card title={t("home.generateCard")} size="small">
            {resources.error && (
              <Alert
                type="warning"
                showIcon
                message={t("home.resourceLoadFailed")}
                description={resources.error}
                action={
                  <Button size="small" icon={<ReloadOutlined />} onClick={resources.reload}>
                    {t("common.retry")}
                  </Button>
                }
                style={{ marginBottom: 12 }}
              />
            )}

            {deps.data && !deps.data.all_ok && (
              <Alert
                type="error"
                showIcon
                icon={<WarningOutlined />}
                message={t("home.missingDeps", { deps: deps.data.missing.join(" / ") })}
                description={<>{t("home.missingDepsDesc")}</>}
                action={
                  <Space direction="vertical" size="small">
                    <Button
                      size="small"
                      type="primary"
                      onClick={() =>
                        showMissingDepsModal(deps.data!.missing, deps.data!.platform)
                      }
                    >
                      {t("home.installGuide")}
                    </Button>
                    <Button
                      size="small"
                      icon={<ReloadOutlined />}
                      onClick={() => void deps.refresh()}
                      loading={deps.loading}
                    >
                      {t("home.recheck")}
                    </Button>
                  </Space>
                }
                style={{ marginBottom: 12 }}
              />
            )}

            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                icon={<PlayCircleOutlined />}
                loading={submitting || status === "running" || status === "pending"}
                block
                size="large"
              >
                {t("home.generateBtn")}
              </Button>
            </Form.Item>

            {progress.task && (
              <Space direction="vertical" style={{ width: "100%" }}>
                <div>
                  <Text type="secondary">{t("home.taskId")}</Text>
                  <Tag>{progress.task.task_id.slice(0, 12)}</Tag>
                  <Tag color={statusColor(status)}>{status}</Tag>
                </div>
                <Progress
                  percent={Math.round(pct)}
                  status={
                    status === "failed"
                      ? "exception"
                      : status === "completed"
                      ? "success"
                      : "active"
                  }
                />
                {progressMsg && (
                  <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                    {progressMsg}
                  </Paragraph>
                )}
                {progress.task.error && (
                  <Alert
                    type="error"
                    showIcon
                    message={t("home.genFailed")}
                    description={progress.task.error}
                  />
                )}
              </Space>
            )}

            {videoUrl && (
              <>
                <Divider />
                <Title level={5}>
                  <VideoCameraOutlined /> {t("home.preview")}
                </Title>
                <video
                  src={absoluteVideoUrl(videoUrl, baseUrl)}
                  controls
                  style={{ width: "100%", borderRadius: 8 }}
                />
                <Paragraph copyable style={{ marginTop: 8, fontSize: 12 }} type="secondary">
                  {absoluteVideoUrl(videoUrl, baseUrl)}
                </Paragraph>
              </>
            )}
          </Card>
        </Col>
      </Row>
    </Form>
  );
}

function statusColor(s: string | undefined): string {
  switch (s) {
    case "completed":
      return "success";
    case "failed":
    case "cancelled":
      return "error";
    case "running":
      return "processing";
    case "pending":
      return "default";
    default:
      return "default";
  }
}

function absoluteVideoUrl(url: string, base: string | null): string {
  if (!base) return url;
  try {
    const u = new URL(url);
    const b = new URL(base);
    // Always rewrite to the live sidecar host/port — persisted results may
    // reference a dead port from a previous session.
    u.protocol = b.protocol;
    u.host = b.host;
    return u.toString();
  } catch {
    return url;
  }
}
