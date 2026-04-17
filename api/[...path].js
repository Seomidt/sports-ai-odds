export const config = { runtime: 'edge' };

const RAILWAY = 'https://sports-ai-odds-production.up.railway.app';

export default async function handler(request) {
  const url = new URL(request.url);
  const target = `${RAILWAY}${url.pathname}${url.search}`;

  return fetch(target, {
    method: request.method,
    headers: request.headers,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
  });
}
