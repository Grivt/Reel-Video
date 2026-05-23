#!/usr/bin/env node
// Boots the Python sidecar, fetches /openapi.json, regenerates
// src/api/generated/schema.d.ts via openapi-typescript, then stops the sidecar.
//
// Usage:
//   node scripts/gen-api-client.mjs              # boots `uv run python api/app.py`
//   REEL_SIDECAR_URL=http://127.0.0.1:8000 node scripts/gen-api-client.mjs
//
// Run after touching api/ routers, schemas, or pyproject endpoints.

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const desktopDir = resolve(__dirname, "..");
const projectRoot = resolve(desktopDir, "..");
const specPath = resolve(desktopDir, "api-spec.json");
const schemaPath = resolve(desktopDir, "src/api/generated/schema.d.ts");

async function pickPort() {
  return new Promise((res, rej) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", rej);
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => res(port));
    });
  });
}

async function waitForHealth(url, timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`sidecar /health not ready in ${timeoutMs}ms`);
}

async function fetchSpec(baseUrl) {
  const r = await fetch(`${baseUrl}/openapi.json`);
  if (!r.ok) throw new Error(`openapi.json → ${r.status}`);
  return await r.text();
}

async function runCodegen() {
  return new Promise((res, rej) => {
    // On Windows, `.cmd` shims can only be invoked through a shell.
    const isWin = process.platform === "win32";
    const bin = isWin
      ? resolve(desktopDir, "node_modules/.bin/openapi-typescript.cmd")
      : resolve(desktopDir, "node_modules/.bin/openapi-typescript");
    const child = spawn(bin, [specPath, "-o", schemaPath], {
      cwd: desktopDir,
      stdio: "inherit",
      shell: isWin,
    });
    child.on("close", (code) =>
      code === 0 ? res() : rej(new Error(`openapi-typescript exit ${code}`))
    );
  });
}

async function main() {
  await mkdir(dirname(schemaPath), { recursive: true });

  const external = process.env.REEL_SIDECAR_URL?.replace(/\/$/, "");
  if (external) {
    console.log(`Using external sidecar at ${external}`);
    await waitForHealth(`${external}/health`, 30_000);
    const spec = await fetchSpec(external);
    await writeFile(specPath, spec);
    await runCodegen();
    console.log("✓ schema.d.ts regenerated");
    return;
  }

  const port = await pickPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Booting sidecar at ${baseUrl} via \`uv run python api/app.py\``);

  const child = spawn(
    "uv",
    ["run", "python", "api/app.py", "--host", "127.0.0.1", "--port", String(port)],
    {
      cwd: projectRoot,
      stdio: ["ignore", "ignore", "ignore"],
      shell: process.platform === "win32",
    }
  );

  const cleanup = () => {
    try {
      child.kill();
    } catch {}
  };
  process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
  });

  try {
    await waitForHealth(`${baseUrl}/health`, 60_000);
    console.log("Sidecar ready, fetching /openapi.json");
    const spec = await fetchSpec(baseUrl);
    await writeFile(specPath, spec);
    await runCodegen();
    console.log("✓ schema.d.ts regenerated");
  } finally {
    cleanup();
  }
}

main().catch((e) => {
  console.error("Codegen failed:", e.message);
  process.exit(1);
});
