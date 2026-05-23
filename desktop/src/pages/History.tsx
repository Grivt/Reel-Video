import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Card,
  Table,
  Tag,
  Progress,
  Button,
  Space,
  Typography,
  Alert,
  Empty,
  message,
  Tooltip,
  Modal,
  App as AntdApp,
} from "antd";
import {
  ReloadOutlined,
  VideoCameraOutlined,
  StopOutlined,
  EyeOutlined,
  DeleteOutlined,
  ExclamationCircleFilled,
  FolderOpenOutlined,
} from "@ant-design/icons";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { ColumnsType } from "antd/es/table";
import { api, unwrap } from "../api/client";
import type { components } from "../api/generated/schema";
import { useSidecar } from "../store/sidecar";

type Task = components["schemas"]["Task"];

const REFRESH_INTERVAL_MS = 3000;

export function History() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Task | null>(null);
  const baseUrl = useSidecar((s) => s.base_url);
  const fetchRef = useRef<number | null>(null);
  // antd v5 requires App context for Modal.confirm to inherit theme/locale.
  const { modal } = AntdApp.useApp();

  const load = useCallback(async () => {
    try {
      const list = await unwrap(
        api().GET("/api/tasks", { params: { query: { limit: 100 } } })
      );
      setTasks(list as unknown as Task[]);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    fetchRef.current = window.setInterval(load, REFRESH_INTERVAL_MS);
    return () => {
      if (fetchRef.current !== null) window.clearInterval(fetchRef.current);
    };
  }, [load]);

  const hasActive = useMemo(
    () => tasks.some((t) => t.status === "running" || t.status === "pending"),
    [tasks]
  );

  const onCancel = async (taskId: string) => {
    modal.confirm({
      title: "确认取消任务?",
      content: `任务 ${taskId.slice(0, 12)} 将被中止`,
      okType: "danger",
      onOk: async () => {
        try {
          await unwrap(
            api().DELETE("/api/tasks/{task_id}", {
              params: { path: { task_id: taskId } },
            })
          );
          message.success("已取消");
          void load();
        } catch (e) {
          message.error(`取消失败：${String(e)}`);
        }
      },
    });
  };

  const onDelete = (task: Task) => {
    const title =
      (task.request_params as { title?: string; text?: string } | null)?.title ||
      (task.request_params as { title?: string; text?: string } | null)?.text ||
      "";
    modal.confirm({
      icon: <ExclamationCircleFilled style={{ color: "#ff4d4f" }} />,
      title: "确认永久删除？",
      okType: "danger",
      okText: "确认删除",
      cancelText: "取消",
      width: 480,
      content: (
        <div>
          <Typography.Paragraph style={{ marginBottom: 8 }}>
            该操作将同时删除：
          </Typography.Paragraph>
          <ul style={{ marginTop: 0, paddingLeft: 20 }}>
            <li>历史记录条目</li>
            <li>视频文件、分镜帧、TTS 音频等所有产物</li>
          </ul>
          <Alert
            type="warning"
            showIcon
            message="此操作不可恢复"
            style={{ marginTop: 12 }}
          />
          <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
            任务：<Typography.Text code>{task.task_id.slice(0, 12)}…</Typography.Text>
            {title && (
              <>
                <br />
                标题：<Typography.Text>{title.slice(0, 60)}</Typography.Text>
              </>
            )}
          </Typography.Paragraph>
        </div>
      ),
      onOk: async () => {
        try {
          const baseUrl = useSidecar.getState().base_url;
          if (!baseUrl) throw new Error("sidecar not ready");
          const resp = await fetch(
            `${baseUrl.replace(/\/$/, "")}/api/tasks/${encodeURIComponent(task.task_id)}/permanent`,
            { method: "DELETE" }
          );
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          message.success("已删除");
          if (selected?.task_id === task.task_id) setSelected(null);
          void load();
        } catch (e) {
          message.error(`删除失败：${String(e)}`);
        }
      },
    });
  };

  const columns: ColumnsType<Task> = [
    {
      title: "任务 ID",
      dataIndex: "task_id",
      key: "task_id",
      width: 130,
      render: (id: string) => (
        <Tooltip title={id}>
          <Typography.Text code copyable={{ text: id }}>
            {id.slice(0, 8)}…
          </Typography.Text>
        </Tooltip>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 90,
      filters: [
        { text: "pending", value: "pending" },
        { text: "running", value: "running" },
        { text: "completed", value: "completed" },
        { text: "failed", value: "failed" },
        { text: "cancelled", value: "cancelled" },
      ],
      onFilter: (val, t) => t.status === val,
      render: (s: Task["status"]) => <Tag color={statusColor(s)}>{s}</Tag>,
    },
    {
      title: "进度",
      key: "progress",
      width: 180,
      render: (_, t) => {
        if (t.status === "completed") return <Tag color="success">100%</Tag>;
        if (t.status === "failed" || t.status === "cancelled") return <Tag>—</Tag>;
        const pct = t.progress?.percentage ?? 0;
        return (
          <div>
            <Progress
              percent={Math.round(pct)}
              size="small"
              status={t.status === "running" ? "active" : undefined}
            />
            {t.progress?.message && (
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                {t.progress.message}
              </Typography.Text>
            )}
          </div>
        );
      },
    },
    {
      title: "标题",
      key: "title",
      ellipsis: true,
      render: (_, t) => {
        const params = t.request_params ?? {};
        const title = (params.title as string) || (params.text as string) || "—";
        return <Typography.Text>{title.slice(0, 40)}</Typography.Text>;
      },
    },
    {
      title: "创建时间",
      dataIndex: "created_at",
      key: "created_at",
      width: 160,
      sorter: (a, b) =>
        new Date(a.created_at ?? 0).getTime() -
        new Date(b.created_at ?? 0).getTime(),
      defaultSortOrder: "descend",
      render: (s?: string) => (s ? fmtTime(s) : "—"),
    },
    {
      title: "操作",
      key: "actions",
      width: 220,
      render: (_, t) => {
        const isActive = t.status === "running" || t.status === "pending";
        return (
          <Space size="small">
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => setSelected(t)}
            >
              详情
            </Button>
            {isActive ? (
              <Button
                size="small"
                danger
                icon={<StopOutlined />}
                onClick={() => onCancel(t.task_id)}
              >
                取消
              </Button>
            ) : (
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={() => onDelete(t)}
              >
                删除
              </Button>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <Card
      title={
        <Space>
          <span>历史记录</span>
          {hasActive && <Tag color="processing">有任务进行中（自动刷新）</Tag>}
        </Space>
      }
      extra={
        <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
          手动刷新
        </Button>
      }
      size="small"
    >
      {error && (
        <Alert
          type="error"
          showIcon
          message="加载失败"
          description={error}
          style={{ marginBottom: 12 }}
        />
      )}

      {tasks.length === 0 && !loading ? (
        <Empty description="还没有任务" />
      ) : (
        <Table
          rowKey="task_id"
          columns={columns}
          dataSource={tasks}
          loading={loading && tasks.length === 0}
          pagination={{ pageSize: 20, showSizeChanger: false }}
          size="small"
        />
      )}

      <TaskDetailModal task={selected} baseUrl={baseUrl} onClose={() => setSelected(null)} />
    </Card>
  );
}

function TaskDetailModal({
  task,
  baseUrl,
  onClose,
}: {
  task: Task | null;
  baseUrl: string | null;
  onClose: () => void;
}) {
  const { message } = AntdApp.useApp();

  // Streamable URL — needed by the <video> tag (Tauri WebView can't play
  // raw file:// videos inside a sandboxed page on every platform).
  const videoUrl = useMemo(() => {
    if (!task?.result || typeof task.result !== "object") return null;
    const u = (task.result as { video_url?: unknown }).video_url;
    if (typeof u !== "string") return null;
    return absoluteVideoUrl(u, baseUrl);
  }, [task, baseUrl]);

  // Local absolute path on disk — what the user actually wants to see / open
  // in Finder / Explorer. Derived from the result's output_dir field (the
  // sidecar populates this in api/routers/video.py:execute_video_generation).
  const localVideoPath = useMemo(() => {
    if (!task?.result || typeof task.result !== "object") return null;
    const result = task.result as { output_dir?: unknown; video_path?: unknown };
    if (typeof result.video_path === "string" && result.video_path.length > 0) {
      return result.video_path;
    }
    if (typeof result.output_dir === "string" && result.output_dir.length > 0) {
      // Cross-platform join: pick separator from the existing path.
      const sep = result.output_dir.includes("\\") ? "\\" : "/";
      return `${result.output_dir}${sep}final.mp4`;
    }
    return null;
  }, [task]);

  const openInFileManager = async () => {
    if (!localVideoPath) return;
    try {
      await revealItemInDir(localVideoPath);
    } catch (e) {
      message.error(`无法在文件管理器中显示：${String(e)}`);
    }
  };

  return (
    <Modal
      open={!!task}
      onCancel={onClose}
      footer={null}
      width={720}
      title={
        task ? (
          <Space>
            <Tag color={statusColor(task.status)}>{task.status}</Tag>
            <Typography.Text code>{task.task_id}</Typography.Text>
          </Space>
        ) : null
      }
    >
      {task && (
        <Space direction="vertical" style={{ width: "100%" }} size="middle">
          {task.error && (
            <Alert type="error" showIcon message="错误" description={task.error} />
          )}

          {videoUrl && (
            <div>
              <Typography.Title level={5} style={{ marginTop: 0 }}>
                <VideoCameraOutlined /> 视频
              </Typography.Title>
              <video
                src={videoUrl}
                controls
                style={{
                  maxWidth: "100%",
                  maxHeight: 360,
                  width: "auto",
                  display: "block",
                  margin: "0 auto",
                  borderRadius: 8,
                  background: "#000",
                }}
              />

              {localVideoPath && (
                <div style={{ marginTop: 12 }}>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    文件位置：
                  </Typography.Text>
                  <Typography.Paragraph
                    copyable={{ text: localVideoPath, tooltips: ["复制路径", "已复制"] }}
                    style={{ fontSize: 12, marginTop: 4, marginBottom: 8, wordBreak: "break-all" }}
                  >
                    <Typography.Text code>{localVideoPath}</Typography.Text>
                  </Typography.Paragraph>
                  <Button
                    size="small"
                    icon={<FolderOpenOutlined />}
                    onClick={openInFileManager}
                  >
                    在文件管理器中显示
                  </Button>
                </div>
              )}
            </div>
          )}

          <details>
            <summary style={{ cursor: "pointer", marginBottom: 8 }}>
              <Typography.Text type="secondary">请求参数（JSON）</Typography.Text>
            </summary>
            <pre
              style={{
                background: "#f5f5f5",
                padding: 12,
                borderRadius: 6,
                fontSize: 12,
                maxHeight: 280,
                overflow: "auto",
              }}
            >
              {JSON.stringify(task.request_params, null, 2)}
            </pre>
          </details>
        </Space>
      )}
    </Modal>
  );
}

function statusColor(s: Task["status"]): string {
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

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("zh-CN", { hour12: false });
  } catch {
    return iso;
  }
}

function absoluteVideoUrl(url: string, base: string | null): string {
  if (!base) return url;
  try {
    const u = new URL(url);
    const b = new URL(base);
    // Always rewrite host + port to the *current* sidecar. Persisted task
    // results carry the URL from whichever sidecar instance generated them;
    // after a restart that port is dead, so trust the live base URL.
    u.protocol = b.protocol;
    u.host = b.host;
    return u.toString();
  } catch {
    return url;
  }
}
