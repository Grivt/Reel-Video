use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager};

#[derive(Default)]
struct Inner {
    child: Option<Child>,
    base_url: Option<String>,
    status: Status,
    last_error: Option<String>,
    ffmpeg_path: Option<String>,
}

#[derive(Default, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    #[default]
    Starting,
    Ready,
    Failed,
}

#[derive(Clone, serde::Serialize)]
pub struct SidecarInfo {
    pub status: Status,
    pub base_url: Option<String>,
    pub error: Option<String>,
    pub ffmpeg_path: Option<String>,
}

pub struct SidecarState {
    inner: Mutex<Inner>,
}

impl SidecarState {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(Inner::default()),
        }
    }

    pub fn info(&self) -> SidecarInfo {
        let g = self.inner.lock().unwrap();
        SidecarInfo {
            status: g.status,
            base_url: g.base_url.clone(),
            error: g.last_error.clone(),
            ffmpeg_path: g.ffmpeg_path.clone(),
        }
    }

    pub fn shutdown(&self) {
        let mut g = self.inner.lock().unwrap();
        if let Some(mut child) = g.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    fn set_starting(&self) {
        let mut g = self.inner.lock().unwrap();
        g.status = Status::Starting;
        g.last_error = None;
    }

    fn set_ready(&self, child: Option<Child>, base_url: String) {
        let mut g = self.inner.lock().unwrap();
        g.child = child;
        g.base_url = Some(base_url);
        g.status = Status::Ready;
        g.last_error = None;
    }

    fn set_failed(&self, err: String) {
        let mut g = self.inner.lock().unwrap();
        g.status = Status::Failed;
        g.last_error = Some(err);
    }
}

fn pick_unused_port() -> Option<u16> {
    TcpListener::bind("127.0.0.1:0")
        .ok()
        .and_then(|l| l.local_addr().ok().map(|a| a.port()))
}

fn wait_for_port(port: u16, timeout: Duration) -> Result<(), String> {
    let addr: SocketAddr = format!("127.0.0.1:{port}")
        .parse()
        .map_err(|e: std::net::AddrParseError| e.to_string())?;
    let start = Instant::now();
    while start.elapsed() < timeout {
        if TcpStream::connect_timeout(&addr, Duration::from_millis(300)).is_ok() {
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(400));
    }
    Err(format!(
        "sidecar did not listen on 127.0.0.1:{port} within {:?}",
        timeout
    ))
}

/// Per-user writable directory for sidecar outputs / cache.
///
/// In a signed install the resource dir is read-only, so the sidecar's cwd
/// (which determines where `output/`, `temp/`, `.tasks.json` etc. land) needs
/// to be a writable location. Uses Tauri's `app_data_dir()` —
/// Windows: `%APPDATA%\PixelleVideo\`, macOS: `~/Library/Application Support/PixelleVideo/`,
/// Linux: `~/.local/share/PixelleVideo/`.
fn per_user_data_dir(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_data_dir().ok()?;
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir)
}

fn project_root_for_dev() -> PathBuf {
    // `CARGO_MANIFEST_DIR` is the absolute path to src-tauri/ at compile time —
    // far more reliable than `current_dir()` (which differs between `tauri dev`
    // and a launched binary).  Project root = src-tauri/.. (=desktop) /.. (=Pixelle-Video).
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest
        .parent()
        .and_then(|p| p.parent())
        .map(|p| p.to_path_buf())
        .unwrap_or(manifest)
}

/// Returns the path to a usable ffmpeg executable, scanning common install
/// locations that Windows installers don't always expose via PATH (notably
/// `winget install Gyan.FFmpeg` puts the binary inside the WinGet package
/// directory without adding it to PATH).
fn locate_ffmpeg() -> Option<PathBuf> {
    let exe = if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" };

    // 1) PATH lookup — covers system installs, chocolatey, brew, apt.
    if let Some(paths) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&paths) {
            let candidate = dir.join(exe);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }

    // 2) Platform-specific fallbacks.
    #[cfg(windows)]
    {
        // WinGet packages (Gyan.FFmpeg / BtbN.FFmpeg / ...).
        if let Some(home) = std::env::var_os("USERPROFILE") {
            let winget_root = PathBuf::from(&home)
                .join("AppData")
                .join("Local")
                .join("Microsoft")
                .join("WinGet")
                .join("Packages");
            if let Ok(entries) = std::fs::read_dir(&winget_root) {
                for pkg in entries.flatten() {
                    let name = pkg.file_name();
                    let name = name.to_string_lossy().to_lowercase();
                    if !name.contains("ffmpeg") {
                        continue;
                    }
                    // Layout: <pkg>/ffmpeg-x.y.z-full_build/bin/ffmpeg.exe
                    if let Ok(inner) = std::fs::read_dir(pkg.path()) {
                        for sub in inner.flatten() {
                            let candidate = sub.path().join("bin").join(exe);
                            if candidate.is_file() {
                                return Some(candidate);
                            }
                            // Some packages drop ffmpeg.exe directly under <pkg>/bin/.
                            let candidate2 = sub.path().join(exe);
                            if candidate2.is_file() {
                                return Some(candidate2);
                            }
                        }
                    }
                    let candidate = pkg.path().join("bin").join(exe);
                    if candidate.is_file() {
                        return Some(candidate);
                    }
                }
            }
        }

        // Common fixed install paths.
        for candidate in [
            r"C:\ProgramData\chocolatey\bin\ffmpeg.exe",
            r"C:\Program Files\ffmpeg\bin\ffmpeg.exe",
            r"C:\ffmpeg\bin\ffmpeg.exe",
        ] {
            let p = PathBuf::from(candidate);
            if p.is_file() {
                return Some(p);
            }
        }
    }

    #[cfg(unix)]
    {
        for candidate in ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg"] {
            let p = PathBuf::from(candidate);
            if p.is_file() {
                return Some(p);
            }
        }
    }

    None
}

/// Augment the child's environment so the Python sidecar can find ffmpeg even
/// when the parent shell's PATH doesn't include it.
fn inject_ffmpeg_env(cmd: &mut Command, ffmpeg: &Path) {
    if let Some(dir) = ffmpeg.parent() {
        let existing = std::env::var_os("PATH").unwrap_or_default();
        let mut paths: Vec<PathBuf> = std::env::split_paths(&existing).collect();
        if !paths.iter().any(|p| p == dir) {
            paths.insert(0, dir.to_path_buf());
        }
        if let Ok(joined) = std::env::join_paths(paths) {
            cmd.env("PATH", joined);
        }
    }
    // moviepy / imageio look this up first when present.
    cmd.env("IMAGEIO_FFMPEG_EXE", ffmpeg);
    // Convenience for any Python code that wants the canonical path.
    cmd.env("PIXELLE_FFMPEG_EXE", ffmpeg);
}

#[cfg(windows)]
fn spawn_command(cmd: &mut Command) -> std::io::Result<Child> {
    use std::os::windows::process::CommandExt;
    // CREATE_NO_WINDOW = 0x08000000 — hide sidecar console in release.
    cmd.creation_flags(0x08000000).spawn()
}

#[cfg(not(windows))]
fn spawn_command(cmd: &mut Command) -> std::io::Result<Child> {
    cmd.spawn()
}

fn spawn_sidecar(port: u16, app: &AppHandle) -> Result<(Child, Option<PathBuf>), String> {
    let port_str = port.to_string();
    let ffmpeg = locate_ffmpeg();

    let child = if cfg!(debug_assertions) {
        let root = project_root_for_dev();
        let mut cmd = Command::new("uv");
        cmd.args([
            "run",
            "python",
            "api/app.py",
            "--host",
            "127.0.0.1",
            "--port",
            &port_str,
        ])
        .current_dir(&root)
        .stdout(Stdio::null())
        .stderr(Stdio::null());
        if let Some(ref p) = ffmpeg {
            inject_ffmpeg_env(&mut cmd, p);
        }
        spawn_command(&mut cmd).map_err(|e| {
            format!(
                "failed to spawn dev sidecar (`uv run python api/app.py` in {:?}): {e}",
                root
            )
        })?
    } else {
        let resource_dir = app
            .path()
            .resource_dir()
            .map_err(|e| format!("resource_dir unavailable: {e}"))?;
        let exe_name = if cfg!(windows) {
            "pixelle-api.exe"
        } else {
            "pixelle-api"
        };
        // PyInstaller onedir layout: binaries/pixelle-api/<exe> with _internal/ alongside.
        let bundle_dir = resource_dir.join("binaries").join("pixelle-api");
        let exe = bundle_dir.join(exe_name);
        if !exe.exists() {
            return Err(format!("sidecar binary not found at {:?}", exe));
        }
        // Writable per-user dir for everything pipelines emit (output/, temp/,
        // .tasks.json, config.yaml). Persisted across reinstalls/upgrades.
        let data_dir = per_user_data_dir(app).unwrap_or_else(|| resource_dir.clone());

        let mut cmd = Command::new(&exe);
        cmd.args(["--host", "127.0.0.1", "--port", &port_str])
            // Read-only project resources bundled with the app.
            .env("PIXELLE_VIDEO_ROOT", &resource_dir)
            // Writable data root. sidecar_entry.py picks this up and
            // os.chdir()'s into it before importing the app, so all the
            // pipeline code that uses `Path("output/...")` (relative)
            // lands in the same dir the file server reads from.
            .env("PIXELLE_DATA_DIR", &data_dir)
            // Tell Playwright to find browsers inside its own package dir
            // (.local-browsers/) — they were installed there at build time
            // via PLAYWRIGHT_BROWSERS_PATH=0. Without this var, Playwright
            // would look in %LOCALAPPDATA%\ms-playwright (which is empty on
            // a fresh install) and crash with "Executable doesn't exist".
            .env("PLAYWRIGHT_BROWSERS_PATH", "0")
            // Set cwd explicitly too — sidecar_entry.py belt-and-braces this,
            // but it doesn't hurt to be consistent at the OS level.
            .current_dir(&data_dir)
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        if let Some(ref p) = ffmpeg {
            inject_ffmpeg_env(&mut cmd, p);
        }
        spawn_command(&mut cmd)
            .map_err(|e| format!("failed to spawn sidecar binary {:?}: {e}", exe))?
    };

    Ok((child, ffmpeg))
}

/// Spawn the sidecar in the background. Updates `state` when ready or on failure.
/// Returns immediately so the main window is not blocked by Python startup.
pub fn launch(app: AppHandle, state: Arc<SidecarState>) {
    state.set_starting();

    tauri::async_runtime::spawn(async move {
        // External override (e.g. developer kept a `uv run api/app.py` running).
        if let Ok(url) = std::env::var("PIXELLE_SIDECAR_URL") {
            let url = url.trim_end_matches('/').to_string();
            if let Some(port) = parse_port_from_url(&url) {
                if wait_for_port(port, Duration::from_secs(30)).is_err() {
                    state.set_failed(format!(
                        "external sidecar at {url} not reachable in 30s"
                    ));
                    return;
                }
            }
            state.set_ready(None, url);
            return;
        }

        let port = match pick_unused_port() {
            Some(p) => p,
            None => {
                state.set_failed("no free port available".into());
                return;
            }
        };
        let base_url = format!("http://127.0.0.1:{port}");

        let (child, ffmpeg) = match spawn_sidecar(port, &app) {
            Ok(c) => c,
            Err(e) => {
                state.set_failed(e);
                return;
            }
        };
        {
            let mut g = state.inner.lock().unwrap();
            g.ffmpeg_path = ffmpeg.map(|p| p.display().to_string());
        }

        // First boot of FastAPI + heavy imports (moviepy/playwright) can take
        // 5-15s in dev. Allow up to 60s before giving up.
        match wait_for_port(port, Duration::from_secs(60)) {
            Ok(()) => state.set_ready(Some(child), base_url),
            Err(e) => {
                let mut child = child;
                let _ = child.kill();
                let _ = child.wait();
                state.set_failed(e);
            }
        }
    });
}

fn parse_port_from_url(url: &str) -> Option<u16> {
    let stripped = url
        .strip_prefix("http://")
        .or_else(|| url.strip_prefix("https://"))?;
    let host_port = stripped.split('/').next()?;
    let (_, port_str) = host_port.rsplit_once(':')?;
    port_str.parse().ok()
}
