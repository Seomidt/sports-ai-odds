const RAILWAY_BASE = "https://sports-ai-odds-production.up.railway.app";

export default async function handler(req) {
  const url = new URL(req.url);
  const destUrl = `${RAILWAY_BASE}${url.pathname}${url.search}`;

  const headers = new Headers(req.headers);
  headers.delete("host");

  const hasBody = req.method !== "GET" && req.method !== "HEAD";

  try {
    const upstream = await fetch(destUrl, {
      method: req.method,
      headers,
      body: hasBody ? req.body : undefined,
    });

    return new Response(upstream.body, {
      status: upstream.status,
      headers: upstream.headers,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Bad Gateway", detail: String(err) }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }
}

export const config = { runtime: "edge" };
