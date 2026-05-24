<h1 align="center">🎬 Reel-Video</h1>

<p align="center">输入一个主题，AI 自动产出一条成品短视频</p>

<p align="center"><b>中文</b> | <a href="README_EN.md">English</a></p>

<p align="center">
  <a href="https://github.com/Grivt/Reel-Video/releases"><img src="https://img.shields.io/badge/⬇️_下载-Releases-50C878" alt="下载"></a>
  <a href="https://github.com/Grivt/Reel-Video/releases"><img src="https://img.shields.io/badge/平台-Windows%20·%20macOS-4A90E2" alt="平台"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Grivt/Reel-Video?color=blue" alt="License"></a>
</p>

<p align="center">
  <img src="resources/screenshot.png" alt="Reel-Video 桌面端界面" width="100%">
</p>

## 关于

Reel-Video 是一款跨平台桌面应用，把短视频创作变成「一句话」的事。

原项目需要自行配置 Python、依赖环境，对非开发者门槛较高；Reel-Video 把它打包成下载即用的桌面端，让不懂命令行的用户也能直接上手。

你只需要输入一个**主题**，它会自动完成全部流程：

> 撰写文案 → 生成 AI 配图 / 视频 → 合成语音解说 → 添加背景音乐 → 一键合成成品

- 🖥️ **原生桌面端** — Windows / macOS 双平台，下载即用，无需配置 Python、命令行或浏览器
- 📦 **自带引擎** — 安装包内置完整后端，无需单独部署或启动服务
- 🔒 **本地优先** — 后端在你本机运行，API Key 与数据直接发往你自己配置的模型服务，不经过本项目的任何中转服务器
- 🎬 **零剪辑门槛** — 从主题到成品全自动，不需要任何视频剪辑经验
- 🧩 **能力可替换** — 基于 ComfyUI 工作流，文案模型、配图模型、语音、模板都能自由替换

## 相对上游的改动

本 fork 在 Pixelle-Video 基础上：

- 移除了原 Streamlit Web UI 与 Docker 部署方式；
- 新增基于 Tauri 2.0 的跨平台桌面端，安装包内置后端，下载即用。

## 下载

前往 [**Releases**](https://github.com/Grivt/Reel-Video/releases) 下载最新版本：

| 平台 | 安装包 |
| --- | --- |
| Windows | `Reel Video_x.x.x_x64-setup.exe` |
| macOS（Intel） | `Reel Video_x.x.x_x64.dmg` |

> 首次启动会自动检测 ffmpeg 等依赖，若缺失会给出对应平台的安装指引。

## 使用

1. 打开应用，进入「⚙️ 系统配置」，填写 LLM（通义千问 / GPT / DeepSeek 等）与图像生成服务（本地 ComfyUI 或云端 RunningHub）的 API。
2. 回到「生成视频」，输入一个主题，例如「为什么要养成阅读习惯」。
3. 选择音色、视频模板等参数，点击「生成视频」。
4. 等进度走完，在「历史记录」中预览成品，或在文件管理器中打开。

## 许可证

本项目基于 [Apache License 2.0](LICENSE) 开源，fork 自 AIDC-AI 开源的 [Pixelle-Video](https://github.com/AIDC-AI/Pixelle-Video)，在其基础上重做了桌面端封装。上游及第三方组件的完整署名见 [NOTICE](NOTICE)。
