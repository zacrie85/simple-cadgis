/**
 * Pembersih deskripsi KML/KMZ yang berisi HTML mentah.
 *
 * Banyak alat (Google My Maps, Google Earth, sistem internal telco/mining)
 * menulis <description> sebagai dokumen HTML lengkap dengan gaya inline.
 * Bila ditampilkan mentah, popup menjadi berantakan penuh kode.
 *
 * Utilitas ini (berjalan di thread utama, memakai DOMParser):
 *  1. Mendeteksi deskripsi ber-HTML.
 *  2. Mengekstrak pasangan label->nilai dari pola umum:
 *     - baris tabel  <tr><th/td>label</th/td><td>nilai</td></tr>
 *     - daftar       <dt>label</dt><dd>nilai</dd>
 *     - pasangan div/span berurutan dengan label bergaya kecil/uppercase
 *       (contoh: sistem telco dengan font-size 10px + text-transform:uppercase)
 *  3. Membuat ringkasan teks bersih sebagai deskripsi.
 *  4. Menggabungkan pasangan ke atribut fitur tanpa menimpa atribut existing
 *     (ExtendedData tetap diutamakan).
 */

const TAG_HTML_RE =
  /<\/?(div|p|table|tbody|thead|tr|td|th|span|br|b|i|u|ul|ol|li|h[1-6]|font|a|body|html|center|strong|em|small|big|blockquote|hr|img|section|article|dl|dt|dd)\b/i;

const MAKS_ATTR_BARU = 40;
const MAKS_PANJANG_DESKRIPSI = 300;

function teksBersih(el: Element): string {
  return (el.textContent || "").replace(/\s+/g, " ").trim();
}

/** Buang emoji/ikon/simbol di awal label (mis. "📄 Provider" -> "Provider"). */
function rapikanKunci(k: string): string {
  return k
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/[^\p{L}\p{N})\]]+$/u, "")
    .trim();
}

function ukuranFontPx(el: Element): number | null {
  const st = el.getAttribute("style") || "";
  const m = /font-size\s*:\s*([\d.]+)\s*(px|pt)?/i.exec(st);
  if (!m) return null;
  let n = parseFloat(m[1]);
  if ((m[2] || "").toLowerCase() === "pt") n *= 1.333;
  return isNaN(n) ? null : n;
}

export interface HasilBersih {
  description: string;
  attrs: Record<string, string>;
}

/**
 * Bersihkan deskripsi ber-HTML menjadi teks ringkas + atribut terstruktur.
 * Jika deskripsi bukan HTML, dikembalikan apa adanya.
 */
export function bersihkanDeskripsiHtml(
  description: string,
  attrs: Record<string, string>,
  judul = ""
): HasilBersih {
  if (!description || !TAG_HTML_RE.test(description)) {
    return { description, attrs };
  }

  try {
    const doc = new DOMParser().parseFromString(description, "text/html");
    doc.querySelectorAll("script,style,head,meta,title,link").forEach((el) => el.remove());
    const body = doc.body;
    if (!body) return { description, attrs };

    const pairs: [string, string][] = [];
    const dipakai = new Set<Element>();

    // ---- Pola 1: baris tabel dengan tepat 2 sel (label, nilai) ----
    body.querySelectorAll("tr").forEach((tr) => {
      const sel = Array.from(tr.children).filter((c) => /^(TD|TH)$/.test(c.tagName));
      if (sel.length !== 2) return;
      const k = rapikanKunci(teksBersih(sel[0]));
      const v = teksBersih(sel[1]);
      if (k && v && k.length <= 60 && v.length <= 300) {
        pairs.push([k, v]);
        dipakai.add(tr);
      }
    });

    // ---- Pola 2: daftar definisi <dt>label</dt><dd>nilai</dd> ----
    body.querySelectorAll("dt").forEach((dt) => {
      const dd = dt.nextElementSibling;
      if (!dd || dd.tagName !== "DD") return;
      const k = rapikanKunci(teksBersih(dt));
      const v = teksBersih(dd);
      if (k && v && k.length <= 60 && v.length <= 300) {
        pairs.push([k, v]);
        dipakai.add(dt);
        dipakai.add(dd);
      }
    });

    // ---- Pola 3: pasangan div/span/p berurutan (label lalu nilai) ----
    const blok = Array.from(body.querySelectorAll("div,span,p,td"));
    for (let i = 0; i < blok.length - 1; i++) {
      const a = blok[i];
      const b = blok[i + 1];
      if (a.parentElement !== b.parentElement) continue;
      if (a.querySelector("*") || b.querySelector("*")) continue; // harus daun
      // lewati hanya bila baris tabelnya SUDAH berhasil diekstrak pola 1;
      // baris dengan struktur ikon+label (sel tak bersih) tetap diproses di bawah
      const trA = a.closest("tr");
      if (trA && dipakai.has(trA)) continue;
      const k = rapikanKunci(teksBersih(a));
      const v = teksBersih(b);
      if (!k || !v || k.length > 60 || v.length > 300) continue;
      if (dipakai.has(a) || dipakai.has(b)) continue;

      const fa = ukuranFontPx(a);
      const fb = ukuranFontPx(b);
      const gayaA = (a.getAttribute("style") || "").toLowerCase();
      const labelMembesar = fa != null && fb != null && fb > fa; // label lebih kecil dari nilai
      const labelUppercaseCss = /text-transform\s*:\s*uppercase/.test(gayaA);
      const labelHurufBesarTanpaInfoFont =
        fa == null &&
        fb == null &&
        k === k.toUpperCase() &&
        /[A-Z]/.test(k) &&
        (v !== v.toUpperCase() || /\d/.test(v));

      if (labelMembesar || labelUppercaseCss || labelHurufBesarTanpaInfoFont) {
        pairs.push([k, v]);
        dipakai.add(a);
        dipakai.add(b);
      }
    }

    // ---- Gabungkan ke atribut (ExtendedData existing menang) ----
    const attrsBaru: Record<string, string> = {};
    let ditambah = 0;
    for (const [k, v] of pairs) {
      if (k in attrs) continue;
      if (ditambah >= MAKS_ATTR_BARU) break;
      attrsBaru[k] = v;
      ditambah++;
    }

    // ---- Bangun deskripsi teks bersih ----
    const dipakaiArr = Array.from(dipakai);
    const cariKandidat = (el: Element): string => {
      for (const anak of Array.from(el.children)) {
        if (dipakai.has(anak)) continue;
        if (dipakaiArr.some((l) => anak.contains(l))) {
          const dalam = cariKandidat(anak);
          if (dalam) return dalam;
          continue;
        }
        const t = teksBersih(anak);
        if (t && t.length >= 3) {
          return t.length > MAKS_PANJANG_DESKRIPSI
            ? t.slice(0, MAKS_PANJANG_DESKRIPSI - 1) + "…"
            : t;
        }
      }
      return "";
    };

    let deskripsiBaru = "";
    if (pairs.length > 0) {
      deskripsiBaru = cariKandidat(body);
      // buang duplikat judul di awal (mis. header HTML berisi nama placemark)
      const jt = judul.trim();
      if (jt && deskripsiBaru.startsWith(jt)) {
        deskripsiBaru = deskripsiBaru.slice(jt.length).replace(/^[\s·•\-–—:,.]+/, "").trim();
      }
    } else {
      const teksPenuh = teksBersih(body);
      deskripsiBaru =
        teksPenuh.length > 600 ? teksPenuh.slice(0, 599) + "…" : teksPenuh;
    }

    return {
      description: deskripsiBaru,
      attrs: { ...attrsBaru, ...attrs },
    };
  } catch {
    // gagal mem-parse -> fallback: buang tag, sisakan teks
    const teks = description
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return { description: teks.slice(0, 600), attrs };
  }
}
