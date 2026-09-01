"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { useGis } from "@/lib/gis/store";
import { ambilGridCache, warnaElevasi } from "@/lib/gis/contours";
import { bbox } from "@/lib/gis/geo";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Box, X } from "lucide-react";

/** Tampilan 3D garis kontur + permukaan (surface) via three.js. */
export default function View3D() {
  const open = useGis((s) => s.dialogs.view3d);
  const setDialog = useGis((s) => s.setDialog);
  const contours = useGis((s) => s.contours);
  const [mountEl, setMountEl] = useState<HTMLDivElement | null>(null);
  const [tampilkanSurface, setTampilkanSurface] = useState(true);

  // info ringkas dihitung saat render (tanpa state)
  const pathsInfo = contours.filter((c) => c.visible).flatMap((c) => c.paths);
  const info =
    pathsInfo.length === 0
      ? "Belum ada kontur. Buat kontur dulu lewat menu Kontur."
      : `Elevasi ${pathsInfo.reduce((m, p) => Math.min(m, p.elev), Infinity).toFixed(1)}–${pathsInfo
          .reduce((m, p) => Math.max(m, p.elev), -Infinity)
          .toFixed(1)} m • ${pathsInfo.length} garis kontur`;

  useEffect(() => {
    if (!open || !mountEl) return;
    const mount = mountEl;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1f5f9);
    const camera = new THREE.PerspectiveCamera(50, mount.clientWidth / mount.clientHeight || 1.5, 1, 200000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mount.clientWidth || 800, mount.clientHeight || 500);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // kumpulkan semua path kontur yang terlihat
    const paths = contours.filter((c) => c.visible).flatMap((c) => c.paths);
    let eMin = Infinity;
    let eMax = -Infinity;
    for (const p of paths) {
      if (p.elev < eMin) eMin = p.elev;
      if (p.elev > eMax) eMax = p.elev;
    }
    const rentang = Math.max(eMax - eMin, 1e-6);
    const SKALA_Z = 1.6;

    // bbox data untuk pusat koordinat dunia
    const semuaTitik = paths.flatMap((p) => p.coords);
    if (semuaTitik.length > 0) {
      const bb = bbox(semuaTitik);
      const cLat = (bb.maxLat + bb.minLat) / 2;
      const cLng = (bb.maxLng + bb.minLng) / 2;
      const toMeter = (lat: number, lng: number): [number, number] => [
        (lng - cLng) * 111320 * Math.cos((cLat * Math.PI) / 180),
        (lat - cLat) * 110540,
      ];

      // garis kontur pada elevasinya
      const grupKontur = new THREE.Group();
      for (const path of paths) {
        const warna = new THREE.Color(warnaElevasi((path.elev - eMin) / rentang));
        const material = new THREE.LineBasicMaterial({ color: warna });
        const titik3d = path.coords.map((c) => {
          const [x, y] = toMeter(c.lat, c.lng);
          return new THREE.Vector3(x, (path.elev - eMin) * SKALA_Z, -y);
        });
        const geo = new THREE.BufferGeometry().setFromPoints(titik3d);
        grupKontur.add(new THREE.Line(geo, material));
      }
      scene.add(grupKontur);

      // permukaan dari grid interpolasi (cache kontur)
      if (tampilkanSurface) {
        const grid = ambilGridCache();
        if (grid) {
          const { bbox: bb2, w, h, values } = grid;
          const rentangLat = bb2.maxLat - bb2.minLat;
          const rentangLng = bb2.maxLng - bb2.minLng;
          const geo = new THREE.PlaneGeometry(
            rentangLng * 111320 * Math.cos((cLat * Math.PI) / 180),
            rentangLat * 110540,
            w - 1,
            h - 1
          );
          const posisi = geo.attributes.position;
          const warnaSurf = new Float32Array(w * h * 3);
          for (let i = 0; i < w * h; i++) {
            const e = values[i];
            posisi.setZ(i, (e - eMin) * SKALA_Z);
            const c = new THREE.Color(warnaElevasi((e - eMin) / rentang));
            warnaSurf[i * 3] = c.r;
            warnaSurf[i * 3 + 1] = c.g;
            warnaSurf[i * 3 + 2] = c.b;
          }
          geo.rotateX(-Math.PI / 2);
          posisi.needsUpdate = true;
          geo.setAttribute("color", new THREE.BufferAttribute(warnaSurf, 3));
          geo.computeVertexNormals();
          const mesh = new THREE.Mesh(
            geo,
            new THREE.MeshLambertMaterial({
              vertexColors: true,
              side: THREE.DoubleSide,
              transparent: true,
              opacity: 0.55,
            })
          );
          scene.add(mesh);
        }
      }

      // pencahayaan untuk surface
      const dir = new THREE.DirectionalLight(0xffffff, 1.2);
      dir.position.set(1, 1.4, 0.8).multiplyScalar(5000);
      scene.add(dir);
      scene.add(new THREE.AmbientLight(0xffffff, 0.6));

      // grid dasar
      const ukuran = Math.max(
        (bb.maxLng - bb.minLng) * 111320 * Math.cos((cLat * Math.PI) / 180),
        (bb.maxLat - bb.minLat) * 110540
      );
      const gridHelper = new THREE.GridHelper(Math.max(ukuran * 1.6, 50), 12, 0x94a3b8, 0xcbd5e1);
      scene.add(gridHelper);

      // kamera
      const radius = Math.max(ukuran * 1.1, 60);
      camera.position.set(radius, radius * 0.8, radius);
      controls.target.set(0, ((eMax - eMin) * SKALA_Z) / 2.4, 0);
      controls.update();
    } else {
      camera.position.set(80, 60, 80);
      controls.update();
    }

    let raf = 0;
    const animasi = () => {
      raf = requestAnimationFrame(animasi);
      controls.update();
      renderer.render(scene, camera);
    };
    animasi();

    const onResize = () => {
      if (!mount.clientWidth) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", onResize);
    const t1 = window.setTimeout(onResize, 250); // pastikan ukuran benar setelah animasi dialog

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.removeEventListener("resize", onResize);
      controls.dispose();
      renderer.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
          obj.geometry.dispose();
          const mat = obj.material as THREE.Material | THREE.Material[];
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat.dispose();
        }
      });
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
    };
  }, [open, mountEl, contours, tampilkanSurface]);

  if (!open) return null;

  return (
    <Dialog open onOpenChange={(v) => !v && setDialog("view3d", false)}>
      <DialogContent className="rounded-2xl sm:max-w-4xl w-[min(96vw,64rem)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Box className="h-5 w-5 text-primary" />
            Tampilan 3D Kontur
            <span className="text-xs font-normal text-slate-400 ml-2">{info}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <div
            ref={setMountEl}
            className="w-full h-[58vh] rounded-xl overflow-hidden bg-slate-100"
          />
          <button
            onClick={() => setDialog("view3d", false)}
            aria-label="Tutup 3D"
            className="absolute top-2 right-2 h-8 w-8 rounded-lg bg-white/90 border shadow flex items-center justify-center text-slate-500 hover:text-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={tampilkanSurface} onChange={(e) => setTampilkanSurface(e.target.checked)} />
            Tampilkan permukaan (surface)
          </label>
          <p className="text-xs text-slate-400">Seret untuk memutar • scroll untuk zoom • klik-kanan untuk geser</p>
          <Button variant="outline" className="rounded-xl" onClick={() => setDialog("view3d", false)}>
            Tutup
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
