import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // 2026-05-27: iPhone 実機確認時 dev server からも PWA としてインストール可能にする.
      // 本番 build とは独立して dev SW を有効化.
      devOptions: { enabled: true, type: "module" },
      manifest: {
        name: "YesMan",
        short_name: "YesMan",
        description: "迷ったら任せて — Yes/No 委任で意思決定を任せる",
        lang: "ja",
        theme_color: "#ea580c",
        background_color: "#F2EEE2",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // ultrathink U7a FD Imp3: 新 SW を即時 activate
        skipWaiting: true,
        clientsClaim: true,
        // 2026-05-27: 新 SW activation 時に古い precache (前回 deploy の bundle) を自動削除.
        // CloudFront に複数回 deploy した後に古い hash の asset が残り、新 index.html と
        // 整合せず React error #426 (hydration mismatch) を起こす問題の防止策.
        cleanupOutdatedCaches: true,
        // 2026-05-28: navigateFallback (SPA index.html へ fallback) が /api/* の
        // ナビゲーションまで拾い、ブラウザで API URL を直接開くと SPA が返って
        // "/" に redirect されてしまうのを防ぐ. /api/* は SW で fallback させない.
        navigateFallbackDenylist: [/^\/api\//],
        // ultrathink U7a NFR Req Imp1: 画像は runtime cache (CacheFirst 30day)
        runtimeCaching: [
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|webp|avif|ico)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "yesman-images",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
        ],
      },
    }),
    // ultrathink U7d Infra Design I2: bundle visualization、stats.html を dist に出力
    visualizer({
      filename: "dist/stats.html",
      open: false,
      gzipSize: true,
      brotliSize: true,
    }),
  ],
  server: {
    port: 5173,
    // 2026-05-27 dev/demo: iPhone 実機確認のため Cloudflare Quick Tunnel
    // (*.trycloudflare.com) からの request を許可. 本番 build には影響なし.
    allowedHosts: [".trycloudflare.com"],
  },
  build: {
    target: "es2022",
    sourcemap: true,
    rollupOptions: {
      output: {
        // ultrathink U7d NFR Req C1: shared chunk で react-query / react-vendor / aws-amplify を分離
        manualChunks: {
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          "tanstack-query": ["@tanstack/react-query"],
          "aws-amplify": ["aws-amplify", "aws-amplify/auth"],
        },
      },
    },
  },
});
