/* eslint-disable @typescript-eslint/no-require-imports -- file proses utama Electron memang CommonJS */
/**
 * SIMPLE CADGIS — proses utama Electron.
 * Menyajikan hasil static export Next.js (folder out/) lewat server HTTP lokal
 * di 127.0.0.1 (port acak) agar semua path absolut /_next/... tetap valid,
 * lalu membukanya di jendela aplikasi desktop.
 */
const { app, BrowserWindow, Menu, shell } = require("electron");
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "out");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".map": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".webmanifest": "application/manifest+json",
  ".kml": "application/vnd.google-earth.kml+xml",
  ".kmz": "application/vnd.google-earth.kmz",
  ".zip": "application/zip",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/** Server statis ringan tanpa dependensi — port 0 = pilih port bebas otomatis. */
function buatServer(root) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let p = decodeURIComponent((req.url || "/").split("?")[0]);
        if (p.endsWith("/")) p += "index.html";
        const file = path.normalize(path.join(root, p));
        if (!file.startsWith(root)) {
          res.writeHead(403);
          res.end();
          return;
        }
        fs.readFile(file, (err, data) => {
          if (err) {
            // Fallback ke index.html (pola SPA)
            fs.readFile(path.join(root, "index.html"), (e2, d2) => {
              if (e2) {
                res.writeHead(404);
                res.end("Tidak ditemukan");
              } else {
                res.writeHead(200, { "Content-Type": MIME[".html"] });
                res.end(d2);
              }
            });
            return;
          }
          res.writeHead(200, {
            "Content-Type":
              MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
          });
          res.end(data);
        });
      } catch {
        res.writeHead(500);
        res.end();
      }
    });
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => resolve(srv));
  });
}

async function createWindow() {
  const srv = await buatServer(ROOT);
  const port = srv.address().port;

  const icon = path.join(__dirname, "icon.png");
  const win = new BrowserWindow({
    width: 1400,
    height: 880,
    minWidth: 960,
    minHeight: 600,
    title: "SIMPLE CADGIS",
    backgroundColor: "#f8fafc",
    autoHideMenuBar: true,
    show: false,
    icon: fs.existsSync(icon) ? icon : undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  win.once("ready-to-show", () => win.show());
  Menu.setApplicationMenu(null); // tampilan bersih tanpa menu bawaan

  win.webContents.on("before-input-event", (e, input) => {
    if (input.type !== "keyDown") return;
    const k = (input.key || "").toLowerCase();
    if (input.key === "F5" || (input.control && k === "r")) {
      win.webContents.reload();
      e.preventDefault();
    } else if (input.control && input.shift && k === "i") {
      win.webContents.toggleDevTools();
      e.preventDefault();
    }
  });

  // Link eksternal (atribusi OSM/Esri, dll) dibuka di browser sistem
  win.webContents.setWindowOpenHandler(({ url: u }) => {
    if (/^https?:/i.test(u) && !u.includes("127.0.0.1")) shell.openExternal(u);
    return { action: "deny" };
  });

  win.loadURL(`http://127.0.0.1:${port}/`);
  win.on("closed", () => {
    try {
      srv.close();
    } catch {
      /* abaikan */
    }
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
