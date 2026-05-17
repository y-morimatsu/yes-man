import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "YesMan",
        short_name: "YesMan",
        theme_color: "#ea580c",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        // ultrathink U7a FD Imp3: 新 SW を即時 activate
        skipWaiting: true,
        clientsClaim: true,
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
  server: { port: 5173 },
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
