import type { Config } from "@netlify/functions";
import { jsonResponse, listAssessments, methodNotAllowed, saveAssessment } from "./_shared/app.mts";

export default async (req: Request) => {
  if (req.method === "GET") {
    return jsonResponse(await listAssessments());
  }

  if (req.method === "POST") {
    return jsonResponse({ ok: true, ...(await saveAssessment(await req.json())) });
  }

  return methodNotAllowed();
};

export const config: Config = {
  path: "/api/assessments"
};
