"use client";

import type { PesanKeluar } from "@/workers/parse-worker";

export interface FiturTitikClient {
  lat: number;
  lng: number;
  name: string;
  description: string;
  attrs: Record<string, string>;
}
export interface FiturBentukClient {
  kind: "closed" | "open";
  vertices: { lat: number; lng: number }[];
  name: string;
  description: string;
  attrs: Record<string, string>;
}

export interface ParseCallbacks {
  onProgress?: (p: { bytes: number; total: number; rows?: number; features?: number }) => void;
  onRows?: (rows: string[][], totalRows: number) => void;
  onFeatures?: (points: FiturTitikClient[], shapes: FiturBentukClient[], total: number) => void;
  onDone?: (ringkas: string) => void;
  onError?: (message: string) => void;
}

/** Wrapper worker parsing — satu worker per proses file. */
export class ParseStream {
  private worker: Worker | null = null;

  mulai(file: File, cb: ParseCallbacks) {
    this.worker = new Worker(new URL("../../workers/parse-worker.ts", import.meta.url));
    this.worker.onmessage = (e: MessageEvent<PesanKeluar>) => {
      const m = e.data;
      switch (m.type) {
        case "progress":
          cb.onProgress?.(m);
          break;
        case "rows":
          cb.onRows?.(m.rows, m.totalRows);
          break;
        case "features":
          cb.onFeatures?.(m.points, m.shapes, m.total);
          break;
        case "done":
          cb.onDone?.(m.ringkas);
          this.hentikan();
          break;
        case "error":
          cb.onError?.(m.message);
          this.hentikan();
          break;
      }
    };
    this.worker.onerror = (e) => {
      cb.onError?.(e.message || "Gagal memuat parser.");
      this.hentikan();
    };
    this.worker.postMessage({ type: "parse", file });
  }

  hentikan() {
    this.worker?.terminate();
    this.worker = null;
  }
}
