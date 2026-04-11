import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { CLERK_PROXY_PATH, clerkProxyMiddleware } from "./middlewares/clerkProxyMiddleware.js";
import router from "./routes";
import { logger } from "./lib/logger";
import { STRIPE_ENABLED } from "./billing/stripeClient.js";
import { handleStripeWebhook } from "./billing/webhookHandler.js";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
);

function buildDevOrigins(): Set<string> {
  const origins = new Set<string>();
  const domain = process.env.REPLIT_DEV_DOMAIN;
  if (domain) {
    origins.add(`https://${domain}`);
    origins.add(`http://${domain}`);
  }
  return origins;
}

const DEV_ORIGINS = buildDevOrigins();

app.use(
  cors({
    credentials: true,
    origin: (origin, callback) => {
      if (!origin) { callback(null, true); return; }
      const isLocalhost = /^https?:\/\/localhost(:\d+)?$/.test(origin);
      const allowed =
        isLocalhost ||
        DEV_ORIGINS.has(origin) ||
        ALLOWED_ORIGINS.has(origin);
      callback(allowed ? null : new Error("CORS: origin not allowed"), allowed);
    },
  }),
);

// Stripe webhook must be registered BEFORE express.json() so the raw buffer is preserved.
// Only active when STRIPE_ENABLED=true.
if (STRIPE_ENABLED) {
  app.post(
    "/api/stripe/webhook",
    express.raw({ type: "application/json" }),
    handleStripeWebhook
  );
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(clerkMiddleware());

app.use("/api", router);

export default app;
