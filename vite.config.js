import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || "http://localhost:8080";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    fs: {
      allow: ["."],
    },
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  define: mode === 'test' ? { 'process.env.NODE_ENV': '"test"' } : {},
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/setupTests.js",
  },
}));
