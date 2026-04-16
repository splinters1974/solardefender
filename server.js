const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const REPORT_DIR = path.join(ROOT, "reports");
const ASSESSMENTS_DIR = path.join(DATA_DIR, "assessments");
const DEFAULT_CONFIG_PATH = path.join(DATA_DIR, "default-config.json");
const CURRENT_CONFIG_PATH = path.join(DATA_DIR, "current-config.json");
const ADMIN_PASSWORD = "ameresco2026";

ensureRuntimeFiles();

function ensureRuntimeFiles() {
  for (const dir of [DATA_DIR, REPORT_DIR, ASSESSMENTS_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  if (!fs.existsSync(CURRENT_CONFIG_PATH)) {
    fs.copyFileSync(DEFAULT_CONFIG_PATH, CURRENT_CONFIG_PATH);
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(data));
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType =
    {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".svg": "image/svg+xml",
      ".pdf": "application/pdf"
    }[ext] || "application/octet-stream";

  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }

    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  });
}

function collectBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > 5 * 1024 * 1024) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "assessment";
}

function formatDateStamp(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function formatWeightPercentage(weight) {
  const numericWeight = Number(weight || 0) * 100;
  const rounded =
    Math.abs(numericWeight - Math.round(numericWeight)) < 0.01
      ? Math.round(numericWeight)
      : Math.round(numericWeight * 10) / 10;
  return `${rounded}%`;
}

function buildReportLines(payload) {
  const lines = [];
  const { configSnapshot, assessment, result } = payload;
  const template = configSnapshot.templates.find(item => item.id === assessment.templateId);
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
      lines.push(`  Weight: ${formatWeightPercentage(question.weight)}`);
      lines.push(`  Score: ${question.score}`);
      lines.push(`  Option: ${question.label}`);
      if (question.comment) {
        lines.push(`  Comment: ${question.comment}`);
      }
    }
  }

  return lines;
}

function escapePdfText(text) {
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrapText(text, maxChars) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
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

function createPdfBuffer(lines) {
  const pageWidth = 595;
  const pageHeight = 842;
  const left = 50;
  const top = 790;
  const bottom = 50;
  const lineHeight = 15;
  const pages = [];
  let currentPage = [];
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

  const objects = [];
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

function saveAssessment(payload) {
  const dateStamp = formatDateStamp(new Date());
  const projectSlug = slugify(payload.assessment.metadata.projectDescription || payload.assessment.metadata.client);
  const baseName = `${dateStamp}-${projectSlug}`;
  const jsonPath = path.join(ASSESSMENTS_DIR, `${baseName}.json`);
  const pdfPath = path.join(REPORT_DIR, `${baseName}.pdf`);

  writeJson(jsonPath, payload);
  fs.writeFileSync(pdfPath, createPdfBuffer(buildReportLines(payload)));

  return {
    id: baseName,
    jsonFile: path.relative(ROOT, jsonPath),
    pdfFile: path.relative(ROOT, pdfPath),
    pdfUrl: `/api/reports/${baseName}`
  };
}

function listAssessments() {
  if (!fs.existsSync(ASSESSMENTS_DIR)) {
    return [];
  }

  return fs
    .readdirSync(ASSESSMENTS_DIR)
    .filter(name => name.endsWith(".json"))
    .map(name => {
      const filePath = path.join(ASSESSMENTS_DIR, name);
      const payload = readJson(filePath);
      return {
        id: name.replace(/\.json$/, ""),
        file: `data/assessments/${name}`,
        projectDescription: payload.assessment?.metadata?.projectDescription || "",
        client: payload.assessment?.metadata?.client || "",
        decision: payload.result?.decision || "",
        totalScore: payload.result?.totalScore || 0,
        generatedAt: payload.result?.generatedAt || ""
      };
    })
    .sort((a, b) => String(b.generatedAt).localeCompare(String(a.generatedAt)));
}

function routeApi(req, res, pathname) {
  if (req.method === "GET" && pathname === "/api/config") {
    sendJson(res, 200, readJson(CURRENT_CONFIG_PATH));
    return true;
  }

  if (req.method === "POST" && pathname === "/api/config") {
    if (req.headers["x-admin-password"] !== ADMIN_PASSWORD) {
      sendJson(res, 401, { error: "Unauthorized" });
      return true;
    }
    collectBody(req)
      .then(payload => {
        writeJson(CURRENT_CONFIG_PATH, payload);
        sendJson(res, 200, { ok: true });
      })
      .catch(error => sendJson(res, 400, { error: error.message }));
    return true;
  }

  if (req.method === "POST" && pathname === "/api/config/reset") {
    if (req.headers["x-admin-password"] !== ADMIN_PASSWORD) {
      sendJson(res, 401, { error: "Unauthorized" });
      return true;
    }
    fs.copyFileSync(DEFAULT_CONFIG_PATH, CURRENT_CONFIG_PATH);
    sendJson(res, 200, { ok: true, config: readJson(CURRENT_CONFIG_PATH) });
    return true;
  }

  if (req.method === "GET" && pathname === "/api/assessments") {
    sendJson(res, 200, listAssessments());
    return true;
  }

  if (req.method === "POST" && pathname === "/api/assessments") {
    collectBody(req)
      .then(payload => {
        const saved = saveAssessment(payload);
        sendJson(res, 200, { ok: true, ...saved });
      })
      .catch(error => sendJson(res, 400, { error: error.message }));
    return true;
  }

  if (req.method === "GET" && pathname.startsWith("/api/reports/")) {
    const id = path.basename(pathname);
    sendFile(res, path.join(REPORT_DIR, `${id}.pdf`));
    return true;
  }

  return false;
}

function routeStatic(req, res, pathname) {
  if (pathname.startsWith("/reports/")) {
    sendFile(res, path.join(REPORT_DIR, path.basename(pathname)));
    return;
  }

  const safePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const resolved = path.join(PUBLIC_DIR, safePath);
  if (!resolved.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }
  sendFile(res, resolved);
}

function createServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (routeApi(req, res, url.pathname)) {
      return;
    }
    routeStatic(req, res, url.pathname);
  });
}

if (require.main === module) {
  const server = createServer();
  server.listen(PORT, HOST, () => {
    console.log(`Bid / No Bid app running at http://${HOST}:${PORT}`);
  });
}

module.exports = {
  ASSESSMENTS_DIR,
  CURRENT_CONFIG_PATH,
  DEFAULT_CONFIG_PATH,
  REPORT_DIR,
  buildReportLines,
  createPdfBuffer,
  createServer,
  listAssessments,
  readJson,
  saveAssessment
};
