import type { Config } from "@netlify/functions";
import { jsonResponse, methodNotAllowed, readConfig, resetConfig, writeConfig } from "./_shared/app.mts";

const ADMIN_PASSWORD = "ameresco2026";

export default async (req: Request) => {
  const pathname = new URL(req.url).pathname;

  if (req.method === "GET" && pathname === "/api/config") {
    return jsonResponse(await readConfig());
  }

  if (req.method === "POST" && pathname === "/api/config") {
    if (req.headers.get("x-admin-password") !== ADMIN_PASSWORD) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    await writeConfig(await req.json());
    return jsonResponse({ ok: true });
  }

  if (req.method === "POST" && pathname === "/api/config/reset") {
    if (req.headers.get("x-admin-password") !== ADMIN_PASSWORD) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    return jsonResponse({ ok: true, config: await resetConfig() });
  }

  return methodNotAllowed();
};

export const config: Config = {
  path: ["/api/config", "/api/config/reset"]
};
