import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: "/barcode-scanner-pwa-main/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        scope: '/barcode-scanner-pwa-main/',
        name: "Six Digit Barcode Scanner",
        short_name: "Barcode Scan",
        description:
          "Scan unique six-digit interleaved 2 of 5 (ITF) barcodes and export them as CSV.",
        theme_color: "#0f766e",
        background_color: "#f8fafc",
        display: "standalone",
        orientation: "portrait",
        start_url: "/barcode-scanner-pwa-main/",
        icons: [
          {
            src: "icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,ico,png}"],
        navigateFallback: "index.html",
      },
    }),
  ],
});
