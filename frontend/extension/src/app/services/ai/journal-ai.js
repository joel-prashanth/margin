import { DEFAULT_CF_WORKER_URL } from "../../../config.js";

export async function gradeJournalWithAI({ submission }) {
  if (!submission) {
    throw new Error("No journal submission selected.");
  }

  const content = submission.content ?? {};

  const storageData = await new Promise((resolve) => {
    chrome.storage.local.get(["cfWorkerUrl"], resolve);
  });

  let cfUrl = (storageData.cfWorkerUrl || DEFAULT_CF_WORKER_URL).trim();

  if (!cfUrl) {
    throw new Error("Cloudflare Worker URL is missing. Please configure it in Settings.");
  }

  if (cfUrl.endsWith("/")) {
    cfUrl = cfUrl.slice(0, -1);
  }

  const endpoint = `${cfUrl}/grade-journal`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      experience: content.experience || "",
      learning: content.learning || "",
      application: content.application || "",
      feelings: content.feelings || "",
      conclusion: content.conclusion || "",
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.success) {
    throw new Error(
      payload?.message ?? `Cloudflare Worker request failed (${response.status}).`
    );
  }

  const result = payload.data;
  if (!result || !result.rubric) {
    throw new Error("Cloudflare Worker returned invalid data.");
  }

  const fields = [
    "experience",
    "learning",
    "application",
    "feelings",
    "Conclusion",
  ];

  const MIN_SCORE = 3;
  const MAX_SCORE = 4;
  const MIN_TOTAL = 16;

  let total = 0;
  const rubric = {};

  // Parse AI scores, clamp each section to 3–4
  for (const field of fields) {
    const raw = Number(result?.rubric?.[field]);
    const score = Number.isInteger(raw) ? Math.min(MAX_SCORE, Math.max(MIN_SCORE, raw)) : MIN_SCORE;
    rubric[field] = score;
    total += score;
  }

  // If total is below 16 (e.g., all 3s = 15), bump sections to 4 until we reach 16
  if (total < MIN_TOTAL) {
    for (const field of fields) {
      if (total >= MIN_TOTAL) break;
      if (rubric[field] < MAX_SCORE) {
        rubric[field] = MAX_SCORE;
        total += 1;
      }
    }
  }

  let feedback = String(result.feedback ?? "").trim();
  const flags = Array.isArray(result.flags) ? result.flags.map(String) : [];

  // Client-side detection of AI formatting artifacts
  const allText = Object.values(content).join(" ");
  const hasAiArtifacts =
    allText.includes("<bold>") ||
    allText.includes("<b>") ||
    allText.includes("\\text{") ||
    allText.includes("\\rightarrow") ||
    allText.includes("\\textbf") ||
    /\*\*[^*]+\*\*/.test(allText); // Markdown bold **text**

  if (hasAiArtifacts) {
    // Force exactly 16 marks (3, 3, 3, 3, 4)
    total = 16;
    rubric.experience = 3;
    rubric.learning = 3;
    rubric.application = 3;
    rubric.feelings = 3;
    rubric.Conclusion = 4;

    flags.push("AI formatting artifacts detected (LaTeX, Markdown, etc).");
    feedback = "Note: Your submission appears to contain AI-generated formatting artifacts (such as markdown or LaTeX symbols). Please ensure your reflections are written in your own words. Marks have been reduced to the minimum passing score (16/20). " + feedback;
  }

  return {
    rubric,
    reasoning: {
      experience: String(result.reasoning?.experience ?? "").trim(),
      learning: String(result.reasoning?.learning ?? "").trim(),
      application: String(result.reasoning?.application ?? "").trim(),
      feelings: String(result.reasoning?.feelings ?? "").trim(),
      Conclusion: String(result.reasoning?.Conclusion ?? "").trim(),
    },
    feedback,
    flags,
    marks: total,
    maxMarks: 20,
  };
}
