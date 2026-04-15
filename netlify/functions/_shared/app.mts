import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDeployStore, getStore } from "@netlify/blobs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../../..");
const defaultConfigPath = path.join(rootDir, "data/default-config.json");

const CONFIG_KEY = "config/current";
const ASSESSMENT_PREFIX = "assessments/";
const REPORT_PREFIX = "reports/";

function getScopedStore(name: string) {
  const deployContext = Netlify.context?.deploy?.context;
  if (deployContext === "production") {
    return getStore(name, { consistency: "strong" });
  }
  return getDeployStore(name);
}

export const configStore = getScopedStore("bid-no-bid-config");
export const assessmentStore = getScopedStore("bid-no-bid-assessments");
export const reportStore = getScopedStore("bid-no-bid-reports");

export async function readDefaultConfig() {
  return JSON.parse(await readFile(defaultConfigPath, "utf8"));
}

export async function readConfig() {
  const config = await configStore.get(CONFIG_KEY, { type: "json" });
  if (config) {
    return config;
  }
  const seeded = await readDefaultConfig();
  await configStore.setJSON(CONFIG_KEY, seeded);
  return seeded;
}

export async function writeConfig(config: unknown) {
  await configStore.setJSON(CONFIG_KEY, config);
}

export async function resetConfig() {
  const seeded = await readDefaultConfig();
  await writeConfig(seeded);
  return seeded;
}

export function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

export function methodNotAllowed() {
  return jsonResponse({ error: "Method not allowed" }, 405);
}

export function slugify(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "assessment";
}

function formatDateStamp(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

export function buildAssessmentId(payload: any) {
  const dateStamp = formatDateStamp(new Date());
  const projectSlug = slugify(
    payload?.assessment?.metadata?.projectDescription || payload?.assessment?.metadata?.client || ""
  );
  return `${dateStamp}-${projectSlug}`;
}

export function buildReportLines(payload: any) {
  const lines: string[] = [];
  const { configSnapshot, assessment, result } = payload;
  const template = configSnapshot.templates.find((item: any) => item.id === assessment.templateId);
  const now = new Date(result.generatedAt);

  lines.push(configSnapshot.organizationName || configSnapshot.appTitle || "Bid / No Bid Assessment");
  lines.push("Bid / No Bid Assessment Report");
  lines.push(`Generated: ${now.toLocaleString("en-GB")}`);
  lines.push("");
  lines.push("Project Details");

  const metadata = assessment.metadata || {};
  const metadataEntries = [
    ["Project Description", metadata.projectDescription],
    ["Client", metadata.client],
    ["Target Sector", metadata.targetSector],
    ["Target Market Lead Product", metadata.targetMarketLeadProduct],
    ["Multi-Tech Opportunity", metadata.multiTechOpportunity],
    ["Opportunity Managed By", metadata.opportunityManagedBy],
    ["Estimated Close Date", metadata.estimatedCloseDate],
    ["Approximate Opportunity LOV", metadata.approximateLov],
    ["Salesforce Opportunity URL", metadata.salesforceOpportunityUrl],
    ["Approved By", metadata.approvedByName],
    ["Approved Title", metadata.approvedByTitle]
  ];

  for (const [label, value] of metadataEntries) {
    lines.push(`${label}: ${value || "-"}`);
  }

  lines.push("");
  lines.push(`Template: ${template ? template.name : assessment.templateId}`);
  lines.push(`Decision: ${result.decision}`);
  lines.push(`Priority: ${result.priority}`);
  lines.push(`Sweet Spot: ${result.isSweetSpot ? "Inside sweet spot" : "Outside sweet spot"}`);
  lines.push(`Attractiveness Score: ${result.sectionScores.attractiveness}`);
  lines.push(`Feasibility Score: ${result.sectionScores.feasibility}`);
  lines.push(`Total Score: ${result.totalScore}`);
  lines.push("");
  lines.push("Assessment Summary");
  lines.push(result.summaryMessage);

  if (result.warningMessage) {
    lines.push(`Warning: ${result.warningMessage}`);
  }

  lines.push("");
  lines.push("Responses");

  for (const section of result.sections) {
    lines.push("");
    lines.push(`${section.name} - ${section.score}`);
    for (const question of section.questions) {
      lines.push(`- ${question.text}`);
      lines.push(`  Weight: ${question.weight}`);
      lines.push(`  Score: ${question.score}`);
      lines.push(`  Option: ${question.label}`);
      lines.push(`  Key Criterion: ${question.keyCriterion ? "Yes" : "No"}`);
      if (question.comment) {
        lines.push(`  Comment: ${question.comment}`);
      }
    }
  }

  return lines;
}

function escapePdfText(text: string) {
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrapText(text: string, maxChars: number) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.length ? lines : [""];
}

export function createPdfBuffer(lines: string[]) {
  const pageWidth = 595;
  const pageHeight = 842;
  const left = 50;
  const top = 790;
  const bottom = 50;
  const lineHeight = 15;
  const pages: Array<Array<{ x: number; y: number; text: string }>> = [];
  let currentPage: Array<{ x: number; y: number; text: string }> = [];
  let y = top;

  for (const rawLine of lines) {
    const wrapped = rawLine ? wrapText(rawLine, 86) : [""];
    for (const line of wrapped) {
      if (y <= bottom) {
        pages.push(currentPage);
        currentPage = [];
        y = top;
      }
      currentPage.push({ x: left, y, text: line });
      y -= lineHeight;
    }
  }

  if (currentPage.length) {
    pages.push(currentPage);
  }

  const objects: string[] = [];
  objects.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj");
  const kids = pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ");
  objects.push(`2 0 obj\n<< /Type /Pages /Count ${pages.length} /Kids [${kids}] >>\nendobj`);

  const fontObjectNumber = 3 + pages.length * 2;
  pages.forEach((pageLines, index) => {
    const pageObjectNumber = 3 + index * 2;
    const contentObjectNumber = pageObjectNumber + 1;
    const contentStream = ["BT", "/F1 10 Tf"];

    for (const line of pageLines) {
      contentStream.push(`1 0 0 1 ${line.x} ${line.y} Tm (${escapePdfText(line.text)}) Tj`);
    }
    contentStream.push("ET");
    const stream = contentStream.join("\n");

    objects.push(
      `${pageObjectNumber} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontObjectNumber} 0 R >> >> /Contents ${contentObjectNumber} 0 R >>\nendobj`
    );
    objects.push(
      `${contentObjectNumber} 0 obj\n<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream\nendobj`
    );
  });

  objects.push(`${fontObjectNumber} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj`);

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${object}\n`;
  }
  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

export async function listAssessments() {
  const { blobs } = await assessmentStore.list({ prefix: ASSESSMENT_PREFIX });
  const items = await Promise.all(
    blobs.map(async blob => {
      const payload = await assessmentStore.get(blob.key, { type: "json" });
      return {
        id: blob.key.replace(ASSESSMENT_PREFIX, "").replace(/\.json$/, ""),
        projectDescription: payload?.assessment?.metadata?.projectDescription || "",
        client: payload?.assessment?.metadata?.client || "",
        decision: payload?.result?.decision || "",
        totalScore: payload?.result?.totalScore || 0,
        generatedAt: payload?.result?.generatedAt || ""
      };
    })
  );

  return items.sort((a, b) => String(b.generatedAt).localeCompare(String(a.generatedAt)));
}

export async function saveAssessment(payload: any) {
  const id = buildAssessmentId(payload);
  const reportBuffer = createPdfBuffer(buildReportLines(payload));

  await assessmentStore.setJSON(`${ASSESSMENT_PREFIX}${id}.json`, payload);
  await reportStore.set(`${REPORT_PREFIX}${id}.pdf`, reportBuffer);

  return {
    id,
    jsonFile: `blob://bid-no-bid-assessments/${id}.json`,
    pdfFile: `blob://bid-no-bid-reports/${id}.pdf`,
    pdfUrl: `/api/reports/${id}`
  };
}

export async function getReport(id: string) {
  return reportStore.get(`${REPORT_PREFIX}${id}.pdf`, { type: "arrayBuffer" });
}
