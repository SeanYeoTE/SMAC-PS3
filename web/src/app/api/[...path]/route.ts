import { NextRequest } from "next/server";

// Proxies /api/* to the FastAPI backend. A plain route handler rather than
// next.config.ts rewrites, for two reasons specific to this Next.js version:
// rewrites are resolved once at `next build` (so PS3_API_ORIGIN would be
// whatever was set during the Docker build, not the deployed container's
// runtime env), and they run through the new unified proxy layer, which
// buffers the whole body up to `proxyClientMaxBodySize` -- too small for a
// ~15MB Rail upload. Reading process.env and the request stream here avoids
// both: the env var is read per-request, and the body is streamed straight
// through to fetch() rather than buffered.
export const runtime = "nodejs";

const API_ORIGIN = () => process.env.PS3_API_ORIGIN ?? "http://127.0.0.1:8000";

async function proxy(req: NextRequest, path: string[]) {
  const target = `${API_ORIGIN()}/api/${path.join("/")}${req.nextUrl.search}`;

  const headers = new Headers();
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const res = await fetch(target, {
    method: req.method,
    headers,
    body: hasBody ? req.body : undefined,
    // @ts-expect-error -- required by undici when streaming a request body
    duplex: hasBody ? "half" : undefined,
  });

  return new Response(res.body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}

type Params = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, { params }: Params) {
  return proxy(req, (await params).path);
}

export async function POST(req: NextRequest, { params }: Params) {
  return proxy(req, (await params).path);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  return proxy(req, (await params).path);
}
