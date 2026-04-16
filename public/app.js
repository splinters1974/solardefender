const state = {
  config: null,
  assessment: null,
  reports: [],
  latestReportUrl: ""
};

const metadataDefinitions = [
  { key: "projectDescription", label: "Project Description", type: "text" },
  { key: "client", label: "Client", type: "text" },
  { key: "targetSector", label: "Target Sector", type: "text" },
  { key: "targetMarketLeadProduct", label: "Target Market Lead Product", type: "text" },
  {
    key: "multiTechOpportunity",
    label: "Multi-Tech Opportunity",
    type: "select",
    options: ["", "Yes", "No"]
  },
  { key: "opportunityManagedBy", label: "Opportunity Managed By", type: "text" },
  { key: "estimatedCloseDate", label: "Estimated Close Date", type: "date" },
  { key: "approximateLov", label: "Approximate Opportunity LOV (£m)", type: "text" },
  { key: "salesforceOpportunityUrl", label: "Salesforce Opportunity URL", type: "url" },
  { key: "approvedByName", label: "Approved By Name", type: "text" },
  { key: "approvedByTitle", label: "Approved By Title", type: "text" }
];

const tabs = Array.from(document.querySelectorAll(".tab"));
const panels = {
  assessment: document.getElementById("assessment-panel"),
  admin: document.getElementById("admin-panel"),
  reports: document.getElementById("reports-panel")
};

tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    tabs.forEach(item => item.classList.toggle("is-active", item === tab));
    Object.entries(panels).forEach(([key, panel]) => {
      panel.classList.toggle("is-active", key === tab.dataset.tab);
    });
  });
});

document.getElementById("template-select").addEventListener("change", event => {
  createAssessment(event.target.value);
  renderAll();
});

document.getElementById("save-config").addEventListener("click", saveConfig);
document.getElementById("reset-config").addEventListener("click", resetConfig);
document.getElementById("save-report").addEventListener("click", saveAssessmentReport);

init();

async function init() {
  const [config, reports] = await Promise.all([
    fetchJson("/api/config"),
    fetchJson("/api/assessments")
  ]);

  state.config = config;
  state.reports = reports;
  createAssessment(config.templates[0]?.id);
  renderAll();
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Request failed for ${url}`);
  }
  return response.json();
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createAssessment(templateId) {
  const template = getTemplate(templateId);
  const metadata = Object.fromEntries(metadataDefinitions.map(field => [field.key, ""]));
  const responses = {};
  template.sections.forEach(section => {
    section.questions.forEach(question => {
      responses[question.id] = { score: null, label: "", comment: "" };
    });
  });
  state.assessment = { templateId, metadata, responses };
  state.latestReportUrl = "";
}

function getTemplate(templateId = state.assessment?.templateId) {
  return state.config.templates.find(template => template.id === templateId);
}

function calculateResult() {
  const template = getTemplate();
  const rules = state.config.decisionRules;
  const sections = template.sections.map(section => {
    const answeredQuestions = section.questions.map(question => {
      const response = state.assessment.responses[question.id] || {};
      return {
        ...question,
        score: Number(response.score),
        label: response.label || "",
        comment: response.comment || ""
      };
    });

    const weightTotal = answeredQuestions.reduce((sum, question) => sum + Number(question.weight || 0), 0);
    const weightedPoints = answeredQuestions.reduce(
      (sum, question) => sum + (question.score || 0) * Number(question.weight || 0),
      0
    );
    const answeredCount = answeredQuestions.filter(question => Number.isFinite(question.score) && question.score > 0).length;
    const complete = answeredCount === answeredQuestions.length;
    const normalized = weightTotal > 0 ? (weightedPoints / weightTotal) * 20 : 0;

    return {
      id: section.id,
      name: section.name,
      score: round(normalized),
      complete,
      questions: answeredQuestions
    };
  });

  const complete = sections.every(section => section.complete);
  const sectionScores = Object.fromEntries(sections.map(section => [section.id, section.score]));
  const totalScore = round(
    sections.reduce((sum, section) => sum + section.score, 0) / Math.max(sections.length, 1)
  );

  const warningQuestions = sections
    .flatMap(section => section.questions)
    .filter(question => question.keyCriterion && question.score <= rules.keyCriterionWarningScore);

  let decision = "Complete all questions";
  let priority = "Pending";
  let summaryMessage = "Finish the assessment to see the final bid / no bid recommendation.";
  let tone = "warning";
  let isSweetSpot = false;

  if (complete) {
    const attractiveness = sectionScores.attractiveness ?? totalScore;
    const feasibility = sectionScores.feasibility ?? totalScore;
    const highPriority =
      attractiveness >= rules.highPriorityThreshold && feasibility >= rules.highPriorityThreshold;
    const belowMinimum =
      attractiveness < rules.minimumThreshold || feasibility < rules.minimumThreshold;

    if (highPriority) {
      decision = rules.decisions.highPriority;
      priority = rules.priorities.highPriority;
      summaryMessage = rules.messages.sweetSpot;
      tone = "success";
      isSweetSpot = true;
    } else if (belowMinimum) {
      decision = rules.decisions.noBid;
      priority = rules.priorities.noBid;
      summaryMessage = rules.messages.outsideSweetSpot;
      tone = "danger";
    } else {
      decision = rules.decisions.standardBid;
      priority = rules.priorities.standardBid;
      summaryMessage = "This opportunity is in the workable zone but not at the highest priority level.";
      tone = "warning";
      isSweetSpot = true;
    }
  }

  return {
    complete,
    sections,
    sectionScores,
    totalScore,
    decision,
    priority,
    summaryMessage,
    tone,
    isSweetSpot,
    warningMessage: warningQuestions.length ? rules.messages.warning : "",
    warningQuestions,
    generatedAt: new Date().toISOString()
  };
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function formatWeightPercentage(weight) {
  const numericWeight = Number(weight || 0) * 100;
  const rounded =
    Math.abs(numericWeight - Math.round(numericWeight)) < 0.01
      ? Math.round(numericWeight)
      : Math.round(numericWeight * 10) / 10;
  return `${rounded}%`;
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function renderAll() {
  document.getElementById("app-title").textContent = state.config.appTitle;
  renderTemplatePicker();
  renderAssessmentForm();
  renderSummary();
  renderAdmin();
  renderReports();
}

function renderTemplatePicker() {
  const select = document.getElementById("template-select");
  select.innerHTML = state.config.templates
    .map(
      template =>
        `<option value="${template.id}" ${template.id === state.assessment.templateId ? "selected" : ""}>${escapeHtml(
          template.name
        )}</option>`
    )
    .join("");
}

function renderAssessmentForm() {
  const template = getTemplate();
  const form = document.getElementById("assessment-form");
  const fieldsHtml = metadataDefinitions
    .filter(field => template.metadataFields.includes(field.key))
    .map(field => renderMetadataField(field))
    .join("");
  const sectionsHtml = template.sections.map(renderSectionBlock).join("");

  form.innerHTML = `
    <div class="section-block">
      <div class="section-heading">
        <div>
          <h3>${escapeHtml(template.name)}</h3>
          <p class="helper">${escapeHtml(template.description || "")}</p>
        </div>
      </div>
      <div class="fields-grid">${fieldsHtml}</div>
    </div>
    ${sectionsHtml}
  `;

  form.querySelectorAll("[data-meta]").forEach(input => {
    input.addEventListener("input", event => {
      state.assessment.metadata[event.target.dataset.meta] = event.target.value;
    });
  });

  form.querySelectorAll("[data-score]").forEach(input => {
    input.addEventListener("change", event => {
      const questionId = event.target.dataset.questionId;
      state.assessment.responses[questionId].score = Number(event.target.value);
      state.assessment.responses[questionId].label = event.target.dataset.label;
      syncScoreSelection(questionId);
      renderSummary();
    });
  });

  form.querySelectorAll("[data-comment]").forEach(input => {
    input.addEventListener("input", event => {
      state.assessment.responses[event.target.dataset.comment].comment = event.target.value;
    });
  });

  syncAllScoreSelections();
}

function renderMetadataField(field) {
  const value = state.assessment.metadata[field.key] || "";
  if (field.type === "select") {
    return `
      <div class="field">
        <label>${escapeHtml(field.label)}</label>
        <select data-meta="${field.key}">
          ${field.options
            .map(option => `<option value="${escapeHtml(option)}" ${option === value ? "selected" : ""}>${escapeHtml(option || "Please select")}</option>`)
            .join("")}
        </select>
      </div>
    `;
  }

  return `
    <div class="field">
      <label>${escapeHtml(field.label)}</label>
      <input type="${field.type}" value="${escapeAttribute(value)}" data-meta="${field.key}" />
    </div>
  `;
}

function renderSectionBlock(section) {
  const questions = section.questions.map(question => renderQuestion(question)).join("");
  const headers = ["1", "2", "3", "4", "5"];
  return `
    <div class="section-block">
      <div class="section-heading">
        <div>
          <p class="section-label">Scoring Section</p>
          <h3>${escapeHtml(section.name)}</h3>
        </div>
      </div>
      <div class="score-table">
        <div class="score-table-head score-table-row">
          <div class="score-criteria-head">Criteria</div>
          <div class="score-weight-head">Weight</div>
          <div class="score-options-head">
            <span>Score Guide</span>
            <div class="score-option-legend">
              ${headers.map(label => `<span>${label}</span>`).join("")}
            </div>
          </div>
          <div class="score-comments-head">Comments</div>
        </div>
        ${questions}
      </div>
    </div>
  `;
}

function renderQuestion(question) {
  const response = state.assessment.responses[question.id] || {};
  const scoreGuide = [1, 2, 3, 4, 5]
    .map(scoreValue => {
      const option = question.options.find(item => Number(item.score) === scoreValue);
      const optionLabel = option ? option.label : "—";
      const checked = Number(response.score) === scoreValue && response.label === optionLabel;

      return `
        <label class="score-cell ${checked ? "is-selected" : ""} ${option ? "" : "is-empty"}">
          ${option ? `
            <input
              type="radio"
              name="${question.id}"
              value="${option.score}"
              data-score="${option.score}"
              data-question-id="${question.id}"
              data-label="${escapeAttribute(option.label)}"
              ${checked ? "checked" : ""}
            />
          ` : ""}
          <span class="score-cell-number">${scoreValue}</span>
          <span class="score-cell-label">${escapeHtml(optionLabel)}</span>
        </label>
      `;
    })
    .join("");

  return `
    <fieldset class="question-row">
      <div class="question-main">
        <legend>${escapeHtml(question.text)}</legend>
      </div>
      <div class="question-weight">
        <span>${formatWeightPercentage(question.weight)}</span>
      </div>
      <div class="score-cells">
        ${scoreGuide}
      </div>
      <div class="question-comment">
        <textarea
          id="comment-${question.id}"
          data-comment="${question.id}"
          placeholder="Comments, risks, mitigation, rationale, or next steps"
        >${escapeHtml(response.comment || "")}</textarea>
      </div>
    </fieldset>
  `;
}

function renderSummary() {
  const summary = document.getElementById("score-summary");
  const result = calculateResult();
  const attractiveness = result.sectionScores.attractiveness ?? 0;
  const feasibility = result.sectionScores.feasibility ?? 0;
  const warningList = result.warningQuestions.length
    ? `<div class="helper"><strong>Flagged responses:</strong> ${result.warningQuestions
        .map(question => escapeHtml(question.text))
        .join("; ")}</div>`
    : "";

  summary.innerHTML = `
    <div class="decision-banner ${result.tone}">
      ${escapeHtml(result.decision)}
    </div>
    <div class="helper">${escapeHtml(result.summaryMessage)}</div>
    ${result.warningMessage ? `<div class="helper"><strong>Warning:</strong> ${escapeHtml(result.warningMessage)}</div>` : ""}
    ${warningList}
    ${renderDecisionMatrix(result, attractiveness, feasibility)}
    <div class="metrics-grid">
      <div class="metric">
        <small>Attractiveness</small>
        <span class="metric-value">${attractiveness}</span>
      </div>
      <div class="metric">
        <small>Feasibility</small>
        <span class="metric-value">${feasibility}</span>
      </div>
      <div class="metric">
        <small>Total</small>
        <span class="metric-value">${result.totalScore}</span>
      </div>
      <div class="metric">
        <small>Priority</small>
        <span class="metric-value" style="font-size:1.2rem">${escapeHtml(result.priority)}</span>
      </div>
    </div>
  `;
}

function renderDecisionMatrix(result, attractiveness, feasibility) {
  const top = `${100 - clampScore(feasibility)}%`;
  const left = `${clampScore(attractiveness)}%`;

  return `
    <div class="matrix-card">
      <div class="matrix-header">
        <div>
          <strong>Bid Position Map</strong>
          <div class="helper">Attractiveness on the horizontal axis, feasibility on the vertical axis.</div>
        </div>
        <span class="matrix-badge ${result.tone}">${escapeHtml(result.decision)}</span>
      </div>
      <div class="matrix">
        <div class="matrix-zone no-bid">
          <span>No Bid</span>
        </div>
        <div class="matrix-zone in-scope">
          <span>In Scope with Risks Highlighted</span>
        </div>
        <div class="matrix-zone sweet-spot">
          <span>Sweet Spot</span>
        </div>
        <div class="matrix-axis matrix-axis-y">Feasibility</div>
        <div class="matrix-axis matrix-axis-x">Attractiveness</div>
        <div class="matrix-marker" style="top:clamp(13px, ${top}, calc(100% - 13px)); left:clamp(13px, ${left}, calc(100% - 13px));">
          <span></span>
        </div>
      </div>
      <div class="matrix-foot">
        <span>X ${attractiveness}</span>
        <span>Y ${feasibility}</span>
      </div>
    </div>
  `;
}

function renderAdmin() {
  const container = document.getElementById("admin-content");
  const templateHtml = state.config.templates.map(renderAdminTemplate).join("");

  container.innerHTML = `
    <div class="section-block">
      <h3>Application Settings</h3>
      <div class="admin-grid">
        <div class="field">
          <label>App Title</label>
          <input id="admin-app-title" value="${escapeAttribute(state.config.appTitle)}" />
        </div>
        <div class="field">
          <label>Organisation Name</label>
          <input id="admin-org-name" value="${escapeAttribute(state.config.organizationName)}" />
        </div>
        <div class="field">
          <label>High Priority Threshold</label>
          <input id="admin-high-threshold" type="number" value="${state.config.decisionRules.highPriorityThreshold}" />
        </div>
        <div class="field">
          <label>Minimum Threshold</label>
          <input id="admin-min-threshold" type="number" value="${state.config.decisionRules.minimumThreshold}" />
        </div>
        <div class="field">
          <label>Warning Score Threshold</label>
          <input id="admin-warning-score" type="number" value="${state.config.decisionRules.keyCriterionWarningScore}" />
        </div>
        <div class="field">
          <label>High Priority Decision Label</label>
          <input id="admin-high-decision" value="${escapeAttribute(state.config.decisionRules.decisions.highPriority)}" />
        </div>
        <div class="field">
          <label>Standard Bid Label</label>
          <input id="admin-standard-decision" value="${escapeAttribute(state.config.decisionRules.decisions.standardBid)}" />
        </div>
        <div class="field">
          <label>No Bid Label</label>
          <input id="admin-no-decision" value="${escapeAttribute(state.config.decisionRules.decisions.noBid)}" />
        </div>
        <div class="field">
          <label>Sweet Spot Message</label>
          <textarea id="admin-sweet-message">${escapeHtml(state.config.decisionRules.messages.sweetSpot)}</textarea>
        </div>
        <div class="field">
          <label>Outside Sweet Spot Message</label>
          <textarea id="admin-outside-message">${escapeHtml(state.config.decisionRules.messages.outsideSweetSpot)}</textarea>
        </div>
        <div class="field">
          <label>Warning Message</label>
          <textarea id="admin-warning-message">${escapeHtml(state.config.decisionRules.messages.warning)}</textarea>
        </div>
      </div>
    </div>
    ${templateHtml}
  `;

  bindAdminEvents();
}

function renderAdminTemplate(template, templateIndex) {
  return `
    <div class="section-block">
      <div class="surface-header">
        <div>
          <p class="section-label">Template ${templateIndex + 1}</p>
          <h3>${escapeHtml(template.name)}</h3>
        </div>
      </div>
      <div class="admin-grid">
        <div class="field">
          <label>Template Name</label>
          <input data-admin-template-name="${templateIndex}" value="${escapeAttribute(template.name)}" />
        </div>
        <div class="field">
          <label>Description</label>
          <textarea data-admin-template-description="${templateIndex}">${escapeHtml(template.description || "")}</textarea>
        </div>
      </div>
      ${template.sections
        .map((section, sectionIndex) => renderAdminSection(section, templateIndex, sectionIndex))
        .join("")}
    </div>
  `;
}

function renderAdminSection(section, templateIndex, sectionIndex) {
  return `
    <div class="section-block">
      <div class="surface-header">
        <div>
          <p class="section-label">Section</p>
          <h4>${escapeHtml(section.name)}</h4>
        </div>
        <button class="subtle-button" type="button" data-add-question="${templateIndex}:${sectionIndex}">
          Add Question
        </button>
      </div>
      <div class="admin-grid">
        <div class="field">
          <label>Section Name</label>
          <input
            data-admin-section-name="${templateIndex}:${sectionIndex}"
            value="${escapeAttribute(section.name)}"
          />
        </div>
        <div class="field">
          <label>Score Label</label>
          <input
            data-admin-section-label="${templateIndex}:${sectionIndex}"
            value="${escapeAttribute(section.scoreLabel || "")}"
          />
        </div>
      </div>
      ${section.questions
        .map((question, questionIndex) =>
          renderAdminQuestion(question, templateIndex, sectionIndex, questionIndex)
        )
        .join("")}
    </div>
  `;
}

function renderAdminQuestion(question, templateIndex, sectionIndex, questionIndex) {
  const key = `${templateIndex}:${sectionIndex}:${questionIndex}`;
  return `
    <div class="question-card">
      <div class="surface-header">
        <div>
          <p class="section-label">Question ${questionIndex + 1}</p>
          <h4>${escapeHtml(question.text)}</h4>
        </div>
        <button class="subtle-button" type="button" data-remove-question="${key}">Remove</button>
      </div>
      <div class="field">
        <label>Question Text</label>
        <textarea data-admin-question-text="${key}">${escapeHtml(question.text)}</textarea>
      </div>
      <div class="question-meta">
        <div class="field">
          <label>Weight (%)</label>
          <input data-admin-question-weight="${key}" type="number" step="0.1" min="0" value="${Number(question.weight || 0) * 100}" />
        </div>
        <div class="field">
          <label>Comment Required</label>
          <select data-admin-question-comment-required="${key}">
            <option value="true" ${question.commentRequired ? "selected" : ""}>Yes</option>
            <option value="false" ${!question.commentRequired ? "selected" : ""}>No</option>
          </select>
        </div>
      </div>
      <div class="stack gap-md">
        ${question.options
          .map(
            (option, optionIndex) => `
              <div class="option-editor">
                <div class="field">
                  <label>Option Label</label>
                  <input
                    data-admin-option-label="${key}:${optionIndex}"
                    value="${escapeAttribute(option.label)}"
                  />
                </div>
                <div class="field">
                  <label>Score</label>
                  <input
                    data-admin-option-score="${key}:${optionIndex}"
                    type="number"
                    value="${option.score}"
                  />
                </div>
                <button class="subtle-button" type="button" data-remove-option="${key}:${optionIndex}">
                  Remove
                </button>
              </div>
            `
          )
          .join("")}
        <button class="subtle-button" type="button" data-add-option="${key}">Add Option</button>
      </div>
    </div>
  `;
}

function bindAdminEvents() {
  const config = state.config;
  const getQuestion = key => {
    const [templateIndex, sectionIndex, questionIndex] = key.split(":").map(Number);
    return config.templates[templateIndex].sections[sectionIndex].questions[questionIndex];
  };

  document.getElementById("admin-app-title").addEventListener("input", event => {
    config.appTitle = event.target.value;
  });
  document.getElementById("admin-org-name").addEventListener("input", event => {
    config.organizationName = event.target.value;
  });
  document.getElementById("admin-high-threshold").addEventListener("input", event => {
    config.decisionRules.highPriorityThreshold = Number(event.target.value);
  });
  document.getElementById("admin-min-threshold").addEventListener("input", event => {
    config.decisionRules.minimumThreshold = Number(event.target.value);
  });
  document.getElementById("admin-warning-score").addEventListener("input", event => {
    config.decisionRules.keyCriterionWarningScore = Number(event.target.value);
  });
  document.getElementById("admin-high-decision").addEventListener("input", event => {
    config.decisionRules.decisions.highPriority = event.target.value;
  });
  document.getElementById("admin-standard-decision").addEventListener("input", event => {
    config.decisionRules.decisions.standardBid = event.target.value;
  });
  document.getElementById("admin-no-decision").addEventListener("input", event => {
    config.decisionRules.decisions.noBid = event.target.value;
  });
  document.getElementById("admin-sweet-message").addEventListener("input", event => {
    config.decisionRules.messages.sweetSpot = event.target.value;
  });
  document.getElementById("admin-outside-message").addEventListener("input", event => {
    config.decisionRules.messages.outsideSweetSpot = event.target.value;
  });
  document.getElementById("admin-warning-message").addEventListener("input", event => {
    config.decisionRules.messages.warning = event.target.value;
  });

  document.querySelectorAll("[data-admin-template-name]").forEach(input => {
    input.addEventListener("input", event => {
      config.templates[Number(event.target.dataset.adminTemplateName)].name = event.target.value;
    });
  });
  document.querySelectorAll("[data-admin-template-description]").forEach(input => {
    input.addEventListener("input", event => {
      config.templates[Number(event.target.dataset.adminTemplateDescription)].description = event.target.value;
    });
  });
  document.querySelectorAll("[data-admin-section-name]").forEach(input => {
    input.addEventListener("input", event => {
      const [templateIndex, sectionIndex] = event.target.dataset.adminSectionName.split(":").map(Number);
      config.templates[templateIndex].sections[sectionIndex].name = event.target.value;
    });
  });
  document.querySelectorAll("[data-admin-section-label]").forEach(input => {
    input.addEventListener("input", event => {
      const [templateIndex, sectionIndex] = event.target.dataset.adminSectionLabel.split(":").map(Number);
      config.templates[templateIndex].sections[sectionIndex].scoreLabel = event.target.value;
    });
  });
  document.querySelectorAll("[data-admin-question-text]").forEach(input => {
    input.addEventListener("input", event => {
      getQuestion(event.target.dataset.adminQuestionText).text = event.target.value;
    });
  });
  document.querySelectorAll("[data-admin-question-weight]").forEach(input => {
    input.addEventListener("input", event => {
      getQuestion(event.target.dataset.adminQuestionWeight).weight = Number(event.target.value) / 100;
    });
  });
  document.querySelectorAll("[data-admin-question-comment-required]").forEach(input => {
    input.addEventListener("change", event => {
      getQuestion(event.target.dataset.adminQuestionCommentRequired).commentRequired = event.target.value === "true";
    });
  });
  document.querySelectorAll("[data-admin-option-label]").forEach(input => {
    input.addEventListener("input", event => {
      const parts = event.target.dataset.adminOptionLabel.split(":").map(Number);
      config.templates[parts[0]].sections[parts[1]].questions[parts[2]].options[parts[3]].label = event.target.value;
    });
  });
  document.querySelectorAll("[data-admin-option-score]").forEach(input => {
    input.addEventListener("input", event => {
      const parts = event.target.dataset.adminOptionScore.split(":").map(Number);
      config.templates[parts[0]].sections[parts[1]].questions[parts[2]].options[parts[3]].score = Number(
        event.target.value
      );
    });
  });

  document.querySelectorAll("[data-add-question]").forEach(button => {
    button.addEventListener("click", event => {
      const [templateIndex, sectionIndex] = event.target.dataset.addQuestion.split(":").map(Number);
      config.templates[templateIndex].sections[sectionIndex].questions.push({
        id: `question-${Date.now()}`,
        text: "New question",
        weight: 0.1,
        keyCriterion: false,
        commentRequired: false,
        options: [
          { label: "Low", score: 1 },
          { label: "Medium", score: 3 },
          { label: "High", score: 5 }
        ]
      });
      renderAdmin();
    });
  });
  document.querySelectorAll("[data-remove-question]").forEach(button => {
    button.addEventListener("click", event => {
      const [templateIndex, sectionIndex, questionIndex] = event.target.dataset.removeQuestion
        .split(":")
        .map(Number);
      config.templates[templateIndex].sections[sectionIndex].questions.splice(questionIndex, 1);
      renderAdmin();
    });
  });
  document.querySelectorAll("[data-add-option]").forEach(button => {
    button.addEventListener("click", event => {
      getQuestion(event.target.dataset.addOption).options.push({ label: "New option", score: 3 });
      renderAdmin();
    });
  });
  document.querySelectorAll("[data-remove-option]").forEach(button => {
    button.addEventListener("click", event => {
      const [templateIndex, sectionIndex, questionIndex, optionIndex] = event.target.dataset.removeOption
        .split(":")
        .map(Number);
      config.templates[templateIndex].sections[sectionIndex].questions[questionIndex].options.splice(
        optionIndex,
        1
      );
      renderAdmin();
    });
  });
}

function syncScoreSelection(questionId) {
  document
    .querySelectorAll(`.score-cell input[name="${CSS.escape(questionId)}"]`)
    .forEach(input => {
      input.closest(".score-cell")?.classList.toggle("is-selected", input.checked);
    });
}

function syncAllScoreSelections() {
  Object.keys(state.assessment.responses || {}).forEach(syncScoreSelection);
}

async function saveConfig() {
  const status = document.getElementById("admin-status");
  const currentTemplateId = state.assessment.templateId;
  status.textContent = "Saving admin changes...";
  await fetchJson("/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state.config)
  });
  createAssessment(getTemplate(currentTemplateId) ? currentTemplateId : state.config.templates[0].id);
  renderAll();
  status.textContent = "Admin changes saved. The assessment view is now using the updated model.";
}

async function resetConfig() {
  const response = await fetchJson("/api/config/reset", { method: "POST" });
  state.config = response.config;
  createAssessment(state.config.templates[0].id);
  renderAll();
  document.getElementById("admin-status").textContent = "Configuration reset to the seeded workbook-based template.";
}

async function saveAssessmentReport() {
  const result = calculateResult();
  const status = document.getElementById("save-status");
  const link = document.getElementById("download-report");

  if (!result.complete) {
    status.textContent = "Complete every scored question before generating the PDF report.";
    link.classList.add("is-hidden");
    return;
  }

  status.textContent = "Saving assessment and generating PDF...";
  const payload = {
    configSnapshot: deepClone(state.config),
    assessment: deepClone(state.assessment),
    result
  };

  const response = await fetchJson("/api/assessments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  status.textContent = `Saved to ${response.pdfFile} and ${response.jsonFile}`;
  state.latestReportUrl = response.pdfUrl;
  link.href = response.pdfUrl;
  link.classList.remove("is-hidden");
  state.reports = await fetchJson("/api/assessments");
  renderReports();
}

function renderReports() {
  const container = document.getElementById("reports-list");
  if (!state.reports.length) {
    container.innerHTML = `<p class="muted">No saved assessments yet.</p>`;
    return;
  }

  container.innerHTML = state.reports
    .map(
      report => `
        <article class="report-card">
          <div class="surface-header">
            <div>
              <h3>${escapeHtml(report.projectDescription || "Untitled assessment")}</h3>
              <p class="helper">${escapeHtml(report.client || "")}</p>
            </div>
            <a class="button button-secondary" href="/api/reports/${report.id}" target="_blank" rel="noopener">Open PDF</a>
          </div>
          <div class="report-meta">
            <span>Decision: ${escapeHtml(report.decision)}</span>
            <span>Total Score: ${report.totalScore}</span>
            <span>Generated: ${formatDate(report.generatedAt)}</span>
          </div>
        </article>
      `
    )
    .join("");
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString("en-GB") : "-";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}
