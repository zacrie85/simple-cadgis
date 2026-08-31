"use client";

import { useEffect } from "react";

/** Mendaftarkan service worker agar aplikasi bisa di-install sebagai PWA (mode produksi). */
export default function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    }
  }, []);
  return null;
}
