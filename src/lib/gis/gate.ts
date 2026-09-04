/**
 * Password Gate SIMPLE CADGIS — kunci aplikasi dengan password.
 *
 * - Password TIDAK disimpan sebagai teks polos, tapi sebagai hash SHA-256 di localStorage.
 * - Password default: A$rama33 (aktif selama belum diganti lewat menu Setelan › Password).
 * - Status "sudah dibuka" disimpan di sessionStorage → setiap tab/sesi baru diminta
 *   password lagi, tapi refresh di tab yang sama tidak perlu isi ulang.
 * - Semua fungsi sinkron & murni client (dipakai di dalam komponen "use client").
 */

const KUNCI_HASH = "cadgis_gate_hash"; // localStorage: hash password aktif
const KUNCI_BUKA = "cadgis_gate_ok"; // sessionStorage: status gerbang terbuka
const PASSWORD_DEFAULT = "A$rama33";

/* ------------------------------------------------------------------ */
/* SHA-256 murni JS (sinkron) — tak bergantung WebCrypto (async)       */
/* maupun secure context, jadi jalan di mana saja.                     */
/* ------------------------------------------------------------------ */

const K256 = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export function sha256Hex(input: string): string {
  // UTF-8 encode → array byte
  const bytes: number[] = [];
  const enc = encodeURIComponent(input);
  for (let i = 0; i < enc.length; i++) {
    if (enc[i] === "%") {
      bytes.push(parseInt(enc.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(enc.charCodeAt(i));
    }
  }
  const bitLen = bytes.length * 8;
  const padded = ((bytes.length + 9 + 63) >> 6) << 6; // panjang kelipatan 64 byte
  const data = new Uint8Array(padded);
  data.set(bytes);
  data[bytes.length] = 0x80;
  const dv = new DataView(data.buffer);
  dv.setUint32(padded - 8, Math.floor(bitLen / 0x100000000));
  dv.setUint32(padded - 4, bitLen >>> 0);

  const w = new Uint32Array(64);
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

  for (let off = 0; off < padded; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15], y = w[i - 2];
      const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
      const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, hh = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K256[i] + w[i]) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + hh) >>> 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map((x) => x.toString(16).padStart(8, "0")).join("");
}

export function hashPassword(p: string): string {
  return sha256Hex(p);
}

/* ------------------------------------------------------------------ */
/* Penyimpanan & verifikasi                                            */
/* ------------------------------------------------------------------ */

/** Hash password yang sedang aktif (yang tersimpan, atau hash default). */
export function getGateHash(): string {
  try {
    const h = localStorage.getItem(KUNCI_HASH);
    if (h && /^[0-9a-f]{64}$/i.test(h)) return h.toLowerCase();
  } catch {
    /* localStorage tak tersedia — pakai default */
  }
  return sha256Hex(PASSWORD_DEFAULT);
}

/** Benar bila p sama dengan password gerbang yang sedang aktif. */
export function verifyPassword(p: string): boolean {
  return sha256Hex(p) === getGateHash();
}

/** Simpan password baru (sudah divalidasi oleh pemanggil). */
export function simpanPasswordBaru(p: string): void {
  try {
    localStorage.setItem(KUNCI_HASH, sha256Hex(p));
  } catch {
    /* diamkan — sesi ini tetap memakai hash lama */
  }
}

/** Apakah gerbang sudah dibuka pada sesi/tab ini? */
export function apakahTerbuka(): boolean {
  try {
    return sessionStorage.getItem(KUNCI_BUKA) === "1";
  } catch {
    return false;
  }
}

/** Tandai gerbang terbuka untuk sesi/tab ini. */
export function bukaGerbang(): void {
  try {
    sessionStorage.setItem(KUNCI_BUKA, "1");
  } catch {
    /* diamkan */
  }
}

/** Kunci lagi — sesi/tab ini akan diminta password setelah dimuat ulang. */
export function kunciGerbang(): void {
  try {
    sessionStorage.removeItem(KUNCI_BUKA);
  } catch {
    /* diamkan */
  }
}
