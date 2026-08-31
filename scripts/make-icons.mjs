/* Generator ikon PWA SIMPLE CADGIS (SVG -> PNG via sharp) */
import sharp from "sharp";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2563eb"/>
      <stop offset="1" stop-color="#0ea5e9"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#g)"/>
  <path d="M96 352 L208 288 L304 336 L416 272" stroke="#ffffff" stroke-width="28" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>
  <path d="M96 400 L208 336 L304 384 L416 320" stroke="#bfdbfe" stroke-width="20" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.7"/>
  <circle cx="256" cy="176" r="72" fill="#ffffff"/>
  <path d="M256 96 C206 96 176 132 176 172 C176 224 256 288 256 288 C256 288 336 224 336 172 C336 132 306 96 256 96 Z M256 196 A26 26 0 1 1 256 144 A26 26 0 1 1 256 196 Z" fill="#ffffff"/>
</svg>`;

await sharp(Buffer.from(svg)).resize(192, 192).png().toFile("public/icons/icon-192.png");
await sharp(Buffer.from(svg)).resize(512, 512).png().toFile("public/icons/icon-512.png");
console.log("Ikon PWA dibuat");
