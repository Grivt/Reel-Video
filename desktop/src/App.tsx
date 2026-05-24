import { useEffect, useState } from "react";
import { Layout, Menu, theme, Typography, Space, Tag, Segmented } from "antd";
import {
  VideoCameraOutlined,
  HistoryOutlined,
  SettingOutlined,
  TranslationOutlined,
} from "@ant-design/icons";
import { getVersion } from "@tauri-apps/api/app";
import { useTranslation } from "react-i18next";
import { setLanguage, type Lang } from "./i18n";
import { SidecarGate } from "./components/SidecarGate";
import { useSidecar } from "./store/sidecar";
import { Home } from "./pages/Home";
import { Settings } from "./pages/Settings";
import { History } from "./pages/History";

const { Sider, Content, Header } = Layout;
const { Title } = Typography;

type NavKey = "home" | "history" | "settings";

function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const lang = (i18n.language === "en" ? "en" : "zh") as Lang;
  return (
    <Segmented
      size="small"
      value={lang}
      onChange={(v) => setLanguage(v as Lang)}
      options={[
        { value: "zh", label: "中文" },
        { value: "en", label: "EN" },
      ]}
    />
  );
}

function App() {
  return (
    <SidecarGate>
      <Shell />
    </SidecarGate>
  );
}

function Shell() {
  const { t } = useTranslation();
  const [nav, setNav] = useState<NavKey>("home");
  const [appVersion, setAppVersion] = useState<string>("");
  const ffmpegPath = useSidecar((s) => s.ffmpeg_path);
  const {
    token: { colorBgContainer },
  } = theme.useToken();

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => setAppVersion("dev"));
  }, []);

  const navItems = [
    { key: "home", icon: <VideoCameraOutlined />, label: t("nav.home") },
    { key: "history", icon: <HistoryOutlined />, label: t("nav.history") },
    { key: "settings", icon: <SettingOutlined />, label: t("nav.settings") },
  ];
  const currentLabel = navItems.find((n) => n.key === nav)?.label ?? "Reel Video";

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider
        width={220}
        style={{ background: colorBgContainer }}
        breakpoint="lg"
      >
        <div style={{ padding: "20px 24px" }}>
          <Title level={4} style={{ margin: 0 }}>
            Reel Video
          </Title>
          <Tag color="processing" style={{ marginTop: 6 }}>
            v{appVersion || "0.1.1"} · {t("app.desktopTag")}
          </Tag>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[nav]}
          onClick={(e) => setNav(e.key as NavKey)}
          items={navItems}
          style={{ borderRight: 0 }}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: colorBgContainer,
            padding: "0 24px",
            borderBottom: "1px solid rgba(0,0,0,0.06)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Space>
            <Title level={5} style={{ margin: 0 }}>
              {currentLabel}
            </Title>
            <Tag color="default">{t("app.scaffold")}</Tag>
            {ffmpegPath ? (
              <Tag color="success" title={ffmpegPath}>{t("app.ffmpegOk")}</Tag>
            ) : (
              <Tag color="warning" title={t("app.ffmpegMissingTitle")}>
                {t("app.ffmpegMissing")}
              </Tag>
            )}
          </Space>
          <Space size="small">
            <TranslationOutlined style={{ color: "rgba(0,0,0,0.45)" }} />
            <LanguageSwitcher />
          </Space>
        </Header>
        <Content style={{ margin: 24 }}>
          {nav === "home" ? (
            <Home />
          ) : nav === "settings" ? (
            <Settings />
          ) : (
            <History />
          )}
        </Content>
      </Layout>
    </Layout>
  );
}

export default App;
