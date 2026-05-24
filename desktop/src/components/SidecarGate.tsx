import { ReactNode, useEffect } from "react";
import { Result, Spin, Typography, Button, Space, Alert } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
          title={t("sidecar.failedTitle")}
          subTitle={t("sidecar.failedSub")}
          extra={
            <Space direction="vertical" style={{ width: 480, textAlign: "left" }}>
              {error && (
                <Alert
                  type="error"
                  showIcon
                  message={t("sidecar.errorInfo")}
                  description={<Text code copyable>{error}</Text>}
                />
              )}
              <Paragraph type="secondary">
                {t("sidecar.devHint")}
                <br />
                <Text code copyable>
                  uv run python api/app.py --host 127.0.0.1 --port 8000
                </Text>
                <br />
                {t("sidecar.devEnvHintPre")}
                <Text code>REEL_SIDECAR_URL=http://127.0.0.1:8000</Text>
                {t("sidecar.devEnvHintPost")}
              </Paragraph>
              <Button type="primary" onClick={() => window.location.reload()}>
                {t("common.retry")}
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
          {t("sidecar.starting")}
        </Typography.Title>
        <Text type="secondary">{t("sidecar.firstLaunchHint")}</Text>
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
