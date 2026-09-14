import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import liveDevProxy from './tools/live-dev-proxy.js';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    // 本地预览时提供同源转发（/api/bus/*），让手机用局域网 IP 打开也能取实时到站
    liveDevProxy(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-source.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: '公交检查助手',
        short_name: '公交检查',
        description: '驻站检查与跳车检查一站式记录、统计与表格导出',
        lang: 'zh-CN',
        theme_color: '#1f7de2',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: {
    host: true,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{js,jsx}'],
  },
});
