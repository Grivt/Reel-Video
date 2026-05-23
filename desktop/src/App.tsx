import { useEffect, useState } from "react";
import { Layout, Menu, theme, Typography, Space, Tag } from "antd";
import {
  VideoCameraOutlined,
  HistoryOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { getVersion } from "@tauri-apps/api/app";
import { SidecarGate } from "./components/SidecarGate";
import { useSidecar } from "./store/sidecar";
import { Home } from "./pages/Home";
import { Settings } from "./pages/Settings";
import { History } from "./pages/History";

const { Sider, Content, Header } = Layout;
const { Title, Paragraph } = Typography;

type NavKey = "home" | "history" | "settings";

const NAV_ITEMS = [
  { key: "home", icon: <VideoCameraOutlined />, label: "生成视频" },
  { key: "history", icon: <HistoryOutlined />, label: "历史记录" },
  { key: "settings", icon: <SettingOutlined />, label: "系统配置" },
];

function App() {
  return (
    <SidecarGate>
      <Shell />
    </SidecarGate>
  );
}

function Shell() {
  const [nav, setNav] = useState<NavKey>("home");
  const [appVersion, setAppVersion] = useState<string>("");
  const baseUrl = useSidecar((s) => s.base_url);
  const ffmpegPath = useSidecar((s) => s.ffmpeg_path);
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => setAppVersion("dev"));
  }, []);

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider
        width={220}
        style={{ background: colorBgContainer }}
        breakpoint="lg"
      >
        <div style={{ padding: "20px 24px" }}>
          <Title level={4} style={{ margin: 0 }}>
            Real Video
          </Title>
          <Tag color="processing" style={{ marginTop: 6 }}>
            v{appVersion || "0.1.0"} · 桌面端
          </Tag>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[nav]}
          onClick={(e) => setNav(e.key as NavKey)}
          items={NAV_ITEMS}
          style={{ borderRight: 0 }}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: colorBgContainer,
            padding: "0 24px",
            borderBottom: "1px solid rgba(0,0,0,0.06)",
          }}
        >
          <Space>
            <Title level={5} style={{ margin: 0 }}>
              {NAV_ITEMS.find((n) => n.key === nav)?.label ?? "Real Video"}
            </Title>
            <Tag color="default">脚手架</Tag>
            {ffmpegPath ? (
              <Tag color="success" title={ffmpegPath}>ffmpeg ✓</Tag>
            ) : (
              <Tag color="warning" title="未检测到 ffmpeg">ffmpeg ✗</Tag>
            )}
          </Space>
        </Header>
        <Content style={{ margin: 24 }}>
          {nav === "home" ? (
            <Home />
          ) : nav === "settings" ? (
            <Settings />
          ) : nav === "history" ? (
            <History />
          ) : (
            <div
              style={{
                padding: 32,
                minHeight: 480,
                background: colorBgContainer,
                borderRadius: borderRadiusLG,
              }}
            >
              <Title level={3}>
                {NAV_ITEMS.find((n) => n.key === nav)?.label}
              </Title>
              <Paragraph type="secondary">
                此页面正在搭建中。后端服务地址：
                <Tag color="processing">{baseUrl ?? "—"}</Tag>
              </Paragraph>
            </div>
          )}
        </Content>
      </Layout>
    </Layout>
  );
}

export default App;
