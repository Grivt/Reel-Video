<h1 align="center">🎬 Reel-Video</h1>

<p align="center">Type a topic, and AI produces a finished short video</p>

<p align="center"><b>English</b> | <a href="README.md">中文</a></p>

<p align="center">
  <a href="https://github.com/Grivt/Reel-Video/releases"><img src="https://img.shields.io/badge/⬇️_Download-Releases-50C878" alt="Download"></a>
  <a href="https://github.com/Grivt/Reel-Video/releases"><img src="https://img.shields.io/badge/Platform-Windows%20·%20macOS-4A90E2" alt="Platform"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Grivt/Reel-Video?color=blue" alt="License"></a>
</p>

<p align="center">
  <img src="resources/screenshot.png" alt="Reel-Video desktop app" width="100%">
</p>

## About

Reel-Video is a cross-platform desktop app that turns short-video creation into a single sentence.

The original project required setting up Python and a dependency environment yourself — a high bar for non-developers. Reel-Video repackages it as a download-and-run desktop app so users who aren't comfortable with the command line can get started right away.

Just type a **topic** — it handles the entire pipeline automatically:

> Write the script → generate AI images / video → synthesize voiceover → add background music → render the final video

- 🖥️ **Native desktop** — Windows / macOS, download and run, no Python, command line, or browser needed
- 📦 **Engine included** — the full backend is bundled in the installer; there's no separate service to deploy or start
- 🔒 **Local-first** — the backend runs on your own machine; your API keys and data go straight to the model services you configure, never through any relay server operated by this project
- 🎬 **Zero editing skill** — fully automated from topic to finished video, no video-editing experience required
- 🧩 **Swappable building blocks** — built on ComfyUI workflows; the script model, image model, voice, and templates are all replaceable

## Changes from upstream

On top of Pixelle-Video, this fork:

- removes the original Streamlit web UI and the Docker deployment path;
- adds a cross-platform desktop app built on Tauri 2.0, with the backend bundled in the installer for download-and-run use.

## Download

Grab the latest build from [**Releases**](https://github.com/Grivt/Reel-Video/releases):

| Platform | Installer |
| --- | --- |
| Windows | `Reel Video_x.x.x_x64-setup.exe` |
| macOS (Intel) | `Reel Video_x.x.x_x64.dmg` |

> On first launch the app checks for dependencies such as ffmpeg and, if any are missing, shows platform-specific install guidance.

## Usage

1. Open the app, go to **⚙️ Settings**, and fill in the API for an LLM (Qwen / GPT / DeepSeek, etc.) and an image service (local ComfyUI or cloud RunningHub).
2. Back on **Generate Video**, type a topic, e.g. "Why you should build a reading habit".
3. Pick a voice, video template, and other options, then click **Generate Video**.
4. When the progress finishes, preview the result under **History**, or open it in your file manager.

## License

Reel-Video is open-sourced under the [Apache License 2.0](LICENSE). It is a fork of [Pixelle-Video](https://github.com/AIDC-AI/Pixelle-Video) by AIDC-AI, repackaged as a desktop application. Full upstream and third-party attributions are in [NOTICE](NOTICE).
