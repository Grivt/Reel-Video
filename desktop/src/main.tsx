import React from "react";
import ReactDOM from "react-dom/client";
import { ConfigProvider, App as AntdApp } from "antd";
import zhCN from "antd/locale/zh_CN";
import enUS from "antd/locale/en_US";
import { useTranslation } from "react-i18next";
import App from "./App";
import "./i18n";
import "./App.css";

function Root() {
  const { i18n } = useTranslation();
  const locale = i18n.language === "en" ? enUS : zhCN;
  return (
    <ConfigProvider
      locale={locale}
      theme={{
        token: {
          colorPrimary: "#1677ff",
          borderRadius: 8,
        },
      }}
    >
      <AntdApp>
        <App />
      </AntdApp>
    </ConfigProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
