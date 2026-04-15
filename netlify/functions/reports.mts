import type { Config, Context } from "@netlify/functions";
import { getReport, jsonResponse, methodNotAllowed } from "./_shared/app.mts";

export default async (_req: Request, context: Context) => {
  if (_req.method !== "GET") {
    return methodNotAllowed();
  }

  const id = context.params.id;
  const report = await getReport(id);

  if (!report) {
    return jsonResponse({ error: "Report not found" }, 404);
  }

  return new Response(report, {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${id}.pdf"`
    }
  });
};

export const config: Config = {
  path: "/api/reports/:id"
};
