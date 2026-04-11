import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const port = Number(process.env.PORT ?? 5173);
const basePath = process.env.BASE_PATH ?? "/";

const plugins: any[] = [
  react(),
  tailwindcss(),
  runtimeErrorOverlay(),
];

if (process.env.NODE_ENV !== "production" && process.env.REPL_ID !== undefined) {
  const { cartographer } = await import("@replit/vite-plugin-cartographer");
  plugins.push(
    cartographer({ root: path.resolve(import.meta.dirname, "..") })
  );
  const { devBanner } = await import("@replit/vite-plugin-dev-banner");
  plugins.push(devBanner());
}

export default defineConfig({
  base: basePath,
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "::",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    host: "::",
    allowedHosts: true,
  },
});
