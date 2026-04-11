import { createServer as createHttpServer } from "http";
import { createServer as createViteServer } from "vite";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 3000);
const base = process.env.BASE_PATH ?? "/";

const vite = await createViteServer({
  configFile: resolve(__dirname, "vite.config.ts"),
  root: __dirname,
  base,
  server: { middlewareMode: true },
  appType: "spa",
});

const httpServer = createHttpServer(vite.middlewares);

httpServer.listen(port, () => {
  console.log(`\n  Signal Terminal dev server running at http://localhost:${port}/\n`);
});

process.on("SIGTERM", () => {
  httpServer.close();
  vite.close();
});
