import type { NextConfig } from "next";

// basePath kondisional: hanya aktif saat env BASE_PATH diisi (mis. deploy
// GitHub Pages sub-path username.github.io/simple-cadgis lewat deploy.yml).
// Build desktop (electron-builder) & `bun run dev` lokal tidak mengeset env
// ini, sehingga tetap di root "/" — dua-duanya aman.
const basePath = process.env.BASE_PATH?.trim() || undefined;

const nextConfig: NextConfig = {
  // Static export: hasil build berupa folder `out/` yang bisa
  // dihosting di GitHub Pages / Netlify / Vercel tanpa server.
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  ...(basePath ? { basePath } : {}),
};

export default nextConfig;
