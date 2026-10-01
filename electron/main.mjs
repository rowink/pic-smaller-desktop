import path from "node:path";
import { readFile } from "node:fs/promises";
import { app, BrowserWindow, dialog, protocol, shell } from "electron";

const APP_ORIGIN = "app://localhost";
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || "";
const APP_USER_MODEL_ID = "com.joye61.picsmaller";

const MIME_TYPES = {
  ".avif": "image/avif",
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".htm": "text/html; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

// The renderer relies on fetch(), WebAssembly.instantiateStreaming(), Web
// Workers, localStorage and history.pushState, none of which survive a file://
// origin. Serving the built app over a privileged custom scheme keeps the
// desktop build behaving exactly like the web build.
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

function contentTypeFor(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function isInsideDir(dir, target) {
  const relative = path.relative(dir, target);
  if (relative === "") return false;
  if (path.isAbsolute(relative)) return false;
  return relative !== ".." && !relative.startsWith(`..${path.sep}`);
}

/**
 * Map a request pathname onto a file inside the build output directory.
 * Returns null when the request tries to escape the build directory.
 */
function resolveRequestPath(pathname, distDir) {
  const isFileRequest = path.extname(pathname) !== "";
  // Extensionless paths are client-side routes, so they fall back to the shell.
  const relative = isFileRequest ? pathname.replace(/^[/\\]+/, "") : "index.html";
  const target = path.resolve(distDir, relative);
  return isInsideDir(distDir, target) ? target : null;
}

async function handleAppRequest(request) {
  let pathname = "";
  try {
    pathname = decodeURIComponent(new URL(request.url).pathname);
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const distDir = path.join(app.getAppPath(), "dist");
  const filePath = resolveRequestPath(pathname, distDir);
  if (!filePath) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const body = await readFile(filePath);
    return new Response(body, {
      status: 200,
      headers: { "Content-Type": contentTypeFor(filePath) },
    });
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "EISDIR") {
      return new Response("Not Found", { status: 404 });
    }
    console.error(`[main] failed to serve ${pathname}:`, error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

function isDevOrigin(url) {
  return DEV_SERVER_URL !== "" && url.startsWith(new URL(DEV_SERVER_URL).origin);
}

function isInternalUrl(url) {
  return url.startsWith(APP_ORIGIN) || isDevOrigin(url);
}

function setupNavigation(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isInternalUrl(url)) return { action: "allow" };
    void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (isInternalUrl(url)) return;
    event.preventDefault();
    void shell.openExternal(url);
  });
}

function sanitizeFilename(filename) {
  return filename.replace(/[/\\:*?"<>|]/g, "_") || "download";
}

function saveDialogFilters(filename) {
  const extension = path.extname(filename).slice(1).toLowerCase();
  if (!extension) return [{ name: "All Files", extensions: ["*"] }];
  return [
    { name: `${extension.toUpperCase()} files`, extensions: [extension] },
    { name: "All Files", extensions: ["*"] },
  ];
}

/**
 * The renderer saves results by clicking an anchor with a blob URL, so the
 * desktop build asks where to store each file instead of dropping it silently
 * into the downloads folder.
 */
function setupDownloads(win) {
  win.webContents.on("will-download", (_event, item) => {
    const filename = sanitizeFilename(item.getFilename());
    const defaultPath = path.join(app.getPath("pictures"), filename);
    dialog
      .showSaveDialog(win, {
        title: "Save file",
        defaultPath,
        filters: saveDialogFilters(filename),
      })
      .then(({ canceled, filePath }) => {
        if (canceled || !filePath) {
          item.cancel();
          return;
        }
        item.setSavePath(filePath);
      })
      .catch((error) => {
        console.error("[main] save dialog failed:", error);
        item.cancel();
      });
  });
}

function setupDevtools(win) {
  if (!DEV_SERVER_URL) return;
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown" || input.key !== "F12") return;
    win.webContents.toggleDevTools();
    event.preventDefault();
  });
}

function loadApp(win) {
  const target = DEV_SERVER_URL || `${APP_ORIGIN}/`;
  win.loadURL(target).catch((error) => {
    console.error(`[main] failed to load ${target}:`, error);
  });
}

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#ffffff",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      spellcheck: false,
    },
  });
  win.once("ready-to-show", () => win.show());
  setupNavigation(win);
  setupDownloads(win);
  setupDevtools(win);
  loadApp(win);
  return win;
}

let mainWindow = null;

function focusExistingWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", focusExistingWindow);
  app.setAppUserModelId(APP_USER_MODEL_ID);
  app.whenReady()
    .then(() => {
      protocol.handle("app", handleAppRequest);
      mainWindow = createMainWindow();
      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          mainWindow = createMainWindow();
        }
      });
    })
    .catch((error) => {
      console.error("[main] startup failed:", error);
      app.quit();
    });
}

app.on("window-all-closed", () => {
  app.quit();
});
