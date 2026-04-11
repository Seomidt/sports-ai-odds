import { createServer as createHttpServer } from "http";
import { request as httpRequest } from "http";
import { createServer as createViteServer } from "vite";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 3000);
const base = process.env.BASE_PATH ?? "/";
const API_PORT = Number(process.env.API_PORT ?? 8080);

const vite = await createViteServer({
  configFile: resolve(__dirname, "vite.config.ts"),
  root: __dirname,
  base,
  server: { middlewareMode: true },
  appType: "spa",
});

function proxyToApi(req, res) {
  const proxyOptions = {
    hostname: "localhost",
    port: API_PORT,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `localhost:${API_PORT}` },
  };

  const proxyReq = httpRequest(proxyOptions, (proxyRes) => {
    res.writeHead(proxyRes.statusCode ?? 500, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on("error", (err) => {
    console.error("[proxy] API server error:", err.message);
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "API server unavailable" }));
    }
  });

  req.pipe(proxyReq, { end: true });
}

const httpServer = createHttpServer((req, res) => {
  const url = req.url ?? "/";
  if (url.startsWith("/api")) {
    return proxyToApi(req, res);
  }
  vite.middlewares(req, res, () => {
    res.writeHead(404);
    res.end("Not found");
  });
});

httpServer.listen(port, () => {
  console.log(`\n  Signal Terminal dev server running at http://localhost:${port}/\n`);
});

process.on("SIGTERM", () => {
  httpServer.close();
  vite.close();
});
