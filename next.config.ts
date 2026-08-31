import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export: hasil build berupa folder `out/` yang bisa
  // dihosting di GitHub Pages / Netlify / Vercel tanpa server.
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  // Jika dideploy ke GitHub Pages sebagai sub-path (username.github.io/nama-repo),
  // aktifkan baris berikut dan sesuaikan nama repo:
  // basePath: "/nama-repo",
};

export default nextConfig;
