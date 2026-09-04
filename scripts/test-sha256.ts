// Uji sha256Hex() di src/lib/gis/gate.ts vs node:crypto
import { createHash } from "node:crypto";
import { sha256Hex, verifyPassword } from "../src/lib/gis/gate";

const kasus = ["A$rama33", "password123", "abc", "", "Rahasia!@# 2026 ✓", "kunci-panjang-sekali-1234567890"];
let ok = true;
for (const k of kasus) {
  const ref = createHash("sha256").update(k, "utf8").digest("hex");
  const mine = sha256Hex(k);
  const sama = ref === mine;
  if (!sama) ok = false;
  console.log(`${sama ? "OK  " : "BEDA"} "${k}" → ${mine}`);
}
console.log("verifyPassword('A$rama33') default:", verifyPassword("A$rama33"));
if (!ok || !verifyPassword("A$rama33")) {
  console.error("GAGAL — implementasi sha256 tidak cocok!");
  process.exit(1);
}
console.log("SEMUA COCOK");
