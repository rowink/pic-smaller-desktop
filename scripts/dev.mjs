import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const devServerUrl = "http://localhost:3000";
const startupTimeoutMs = 30000;
const isWindows = process.platform === "win32";

const viteCli = path.join(rootDir, "node_modules", "vite", "bin", "vite.js");
const electronCli = path.join(rootDir, "node_modules", "electron", "cli.js");

let viteProcess = null;
let electronProcess = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function killTree(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  if (isWindows) {
    spawnSync("taskkill", ["/pid", String(child.pid), "/f", "/t"]);
  } else {
    child.kill("SIGTERM");
  }
}

function shutdown(exitCode) {
  killTree(electronProcess);
  killTree(viteProcess);
  process.exit(exitCode);
}

async function waitForDevServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(url, { method: "HEAD" });
      return true;
    } catch {
      await sleep(300);
    }
  }
  return false;
}

function startVite() {
  const child = spawn(process.execPath, [viteCli], {
    cwd: rootDir,
    stdio: "inherit",
    env: process.env,
  });
  child.on("error", (error) => {
    console.error("[dev] failed to start vite:", error);
    shutdown(1);
  });
  child.on("exit", (code, signal) => {
    if (electronProcess) return;
    console.error(`[dev] vite exited unexpectedly (code=${code}, signal=${signal})`);
    shutdown(code ?? 1);
  });
  return child;
}

function startElectron() {
  const child = spawn(process.execPath, [electronCli, "."], {
    cwd: rootDir,
    stdio: "inherit",
    env: { ...process.env, VITE_DEV_SERVER_URL: devServerUrl },
  });
  child.on("error", (error) => {
    console.error("[dev] failed to start electron:", error);
    shutdown(1);
  });
  child.on("exit", (code, signal) => {
    shutdown(code ?? (signal ? 1 : 0));
  });
  return child;
}

async function main() {
  for (const cli of [viteCli, electronCli]) {
    try {
      await import("node:fs/promises").then(({ access }) => access(cli));
    } catch {
      console.error(`[dev] missing dependency: ${cli}`);
      console.error("[dev] run `npm install` first.");
      shutdown(1);
    }
  }

  viteProcess = startVite();
  console.log(`[dev] waiting for the Vite dev server on ${devServerUrl} ...`);
  const ready = await waitForDevServer(devServerUrl, startupTimeoutMs);
  if (!ready) {
    console.error(`[dev] dev server did not answer within ${startupTimeoutMs / 1000}s`);
    shutdown(1);
  }
  console.log(`[dev] dev server ready, launching Electron (F12 opens devtools)`);
  electronProcess = startElectron();
}

process.on("SIGINT", () => shutdown(130));
process.on("SIGTERM", () => shutdown(143));

main().catch((error) => {
  console.error("[dev] unexpected failure:", error);
  shutdown(1);
});
