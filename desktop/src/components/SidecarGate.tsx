import { ReactNode, useEffect } from "react";
import { Result, Spin, Typography, Button, Space, Alert } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import { useSidecar } from "../store/sidecar";

const { Paragraph, Text } = Typography;

interface Props {
  children: ReactNode;
}

/**
 * Renders children only after the Python sidecar reports `ready`.
 * Shows a loading view while the FastAPI process boots and an error view if it fails.
 */
export function SidecarGate({ children }: Props) {
  const { status, error, base_url, startPolling, stopPolling } = useSidecar();

  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  if (status === "ready" && base_url) {
    return <>{children}</>;
  }

  if (status === "failed") {
    return (
      <div style={fullscreenStyle}>
        <Result
          status="error"
          title="后端服务启动失败"
          subTitle="Python sidecar 未能在限定时间内就绪"
          extra={
            <Space direction="vertical" style={{ width: 480, textAlign: "left" }}>
              {error && (
                <Alert
                  type="error"
                  showIcon
                  message="错误信息"
                  description={<Text code copyable>{error}</Text>}
                />
              )}
              <Paragraph type="secondary">
                开发期可手动启动 sidecar 后重试：
                <br />
                <Text code copyable>
                  uv run python api/app.py --host 127.0.0.1 --port 8000
                </Text>
                <br />
                然后设置环境变量 <Text code>PIXELLE_SIDECAR_URL=http://127.0.0.1:8000</Text> 重启应用。
              </Paragraph>
              <Button type="primary" onClick={() => window.location.reload()}>
                重试
              </Button>
            </Space>
          }
        />
      </div>
    );
  }

  return (
    <div style={fullscreenStyle}>
      <Space direction="vertical" size="large" align="center">
        <Spin indicator={<LoadingOutlined style={{ fontSize: 40 }} spin />} />
        <Typography.Title level={4} style={{ margin: 0 }}>
          正在启动 Pixelle Video 后端服务…
        </Typography.Title>
        <Text type="secondary">首次启动需要加载依赖，约 5–15 秒</Text>
      </Space>
    </div>
  );
}

const fullscreenStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "100vh",
  padding: 24,
};
