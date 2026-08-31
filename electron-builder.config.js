/**
 * Konfigurasi electron-builder — SIMPLE CADGIS.
 * Hasil build: dist-desktop/SIMPLE-CADGIS-Setup-<versi>.exe (installer Windows NSIS).
 * Jalankan lewat: bun run dist:win  (atau CI GitHub Actions).
 */
const config = {
  appId: "com.zacrie.simplecadgis",
  productName: "SIMPLE CADGIS",
  copyright: "© 2026 zacrie85 — SIMPLE CADGIS",
  directories: {
    output: "dist-desktop",
    buildResources: "electron",
  },
  files: ["electron/main.cjs", "electron/icon.png", "out/**/*"],
  win: {
    icon: "electron/icon.png",
    target: [{ target: "nsis", arch: ["x64"] }],
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: "always",
    shortcutName: "SIMPLE CADGIS",
    artifactName: "SIMPLE-CADGIS-Setup-${version}.${ext}",
  },
};

module.exports = config;
