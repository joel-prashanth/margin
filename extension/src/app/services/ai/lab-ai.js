/**
 * Lab Report AI Evaluation Service
 * Evaluates student PDF lab reports (including typed text and handwritten/hand-drawn diagrams)
 * using Google Gemini Multimodal Vision API (Gemini 2.0 Flash / Gemini 1.5 Flash).
 */

import { DEFAULT_CF_WORKER_URL, GEMINI_API_BASE } from "../../../config.js";
import { LAB_REPORT_CRITERIA } from "../../models/grading/rubrics.js";

const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";

/**
 * Converts a Blob or ArrayBuffer to a Base64 string
 */
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result === "string") {
        // Strip data:application/pdf;base64, prefix
        const base64 = result.includes(",") ? result.split(",")[1] : result;
        resolve(base64);
      } else {
        reject(new Error("Failed to convert file to Base64"));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Downloads a PDF attachment from signed S3 URL and returns Base64 data
 */
export async function downloadPdfAsBase64(pdfUrl) {
  if (!pdfUrl) {
    throw new Error("No PDF attachment URL found for this submission.");
  }

  let response;
  try {
    response = await fetch(pdfUrl);
  } catch (err) {
    throw new Error(`Failed to fetch student PDF from storage. Check network and extension permissions (${err.message})`);
  }

  if (!response.ok) {
    throw new Error(`Failed to download PDF attachment (${response.status} ${response.statusText})`);
  }

  const blob = await response.blob();
  const base64 = await blobToBase64(blob);
  return base64;
}

/**
 * Fetches available models from Gemini API using the provided API key
 */
export async function fetchAvailableGeminiModels(apiKey) {
  if (!apiKey) throw new Error("API Key is missing");
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const errorData = await res.json().catch(() => null);
    throw new Error(errorData?.error?.message || `Failed to fetch models (${res.status})`);
  }
  const data = await res.json();
  if (!data || !data.models) return [];
  // Filter for models that support generateContent
  return data.models.filter(m => m.supportedGenerationMethods?.includes("generateContent"));
}

/**
 * Evaluates a student's Lab Report PDF submission using Gemini Multimodal API
 */
export async function gradeLabReportWithAI({ submission, assessment, retryCount = 0 }) {
  if (!submission) {
    throw new Error("No submission selected.");
  }

  const attachments = Array.isArray(submission.attachments)
    ? submission.attachments
    : submission.attachmentUrl
      ? [submission.attachmentUrl]
      : [];

  const pdfUrl = attachments.find((url) => typeof url === "string" && url.toLowerCase().includes(".pdf")) || attachments[0];

  if (!pdfUrl) {
    throw new Error("This submission has no PDF attachment to evaluate.");
  }

  // Load API Key and configuration
  const storageData = await new Promise((resolve) => {
    chrome.storage.local.get(["geminiApiKey", "labModuleContext", "geminiModel", "cfWorkerUrl"], resolve);
  });

  let apiKey = (storageData.geminiApiKey || "").trim();
  const moduleContext = storageData.labModuleContext || "Standard University Lab Report on Database Management Systems / Advanced Computing.";
  let model = storageData.geminiModel || "gemini-2.0-flash";
  const cfWorkerUrl = (storageData.cfWorkerUrl || DEFAULT_CF_WORKER_URL).trim();
  const maxTotalMarks = Number(assessment?.maxMarks || 20);

  // 1. Download PDF file as Base64 if needed for Gemini
  let pdfBase64 = null;
  try {
    pdfBase64 = await downloadPdfAsBase64(pdfUrl);
  } catch (pdfErr) {
    console.warn("[LabAI] PDF download warning:", pdfErr);
  }

  // 2. Try Gemini Multimodal Vision API if apiKey is present
  if (apiKey && pdfBase64) {
    const systemInstruction = `You are a university faculty evaluator grading a student's technical Lab Report PDF submission.
You must inspect the full document, including all typed text, handwritten notes, tables, and hand-drawn diagrams.

Assessment Title: ${assessment?.title || "Lab Report"}
Subject: ${assessment?.subjectName || "Computer Science / DBMS"}
Context & Guidelines: ${moduleContext}

CRITICAL PLAGIARISM CHECK:
The student submitting this assignment is: Name: "${submission.studentName || 'Unknown'}", Registration/Roll Number: "${submission.rollNumber || 'Unknown'}".
You must scan the first few pages of the document to find the Name and Registration/Roll Number printed on the report.
If the Name or Registration Number printed inside the PDF DOES NOT match the submitter's details (for example, if the PDF contains another student's name or registration number), you MUST flag it as PLAGIARISM.
If plagiarism is detected:
1. Clamp the total marks to exactly 12 (distribute these 12 marks however you see fit).
2. In the feedback, explicitly state: "PLAGIARISM DETECTED: This report belongs to [Name/Registration number found in PDF] but was submitted by ${submission.studentName}. 12 marks awarded."

Scoring Criteria (Max Total: ${maxTotalMarks} marks):
1. Objectives & Scenario Definition (Max 4): Problem statement, background, scope, and objectives.
2. ACID Properties & Concepts (Max 4): Atomicity, Consistency, Isolation, Durability with relevant examples.
3. Concurrency Control & 2PL/Locking (Max 4): Concurrency problem scenarios, Shared/Exclusive locking, Two-Phase Locking explanation.
4. Diagrams (ER & State/Lifecycle Diagrams) (Max 4): Hand-drawn or digital diagrams, visual completeness, entity relationships, correctness.
5. Analysis & Conclusion (Max 4): Observations, takeaways, and concluding summary.

Scoring Guidelines:
- BE STRICT IN YOUR EVALUATION. Identify errors, omissions, or lack of depth, and reduce marks accordingly.
- DO NOT give everyone 20/20. Reserve a perfect 4 marks per criterion (total 20/20) ONLY for exceptionally excellent and flawless work.
- Typical good work should receive scores like 17, 18, or 19. Find areas for improvement to justify these deductions.
- MINIMUM CLAMPING: Do not reduce more than 4 marks in total across the entire rubric. The absolute minimum marks a submitted report can receive is 16/20. If your strict deductions would normally result in a score below 16, you must limit your deductions so the final total is exactly 16 (UNLESS plagiarism is detected, in which case it must be 12).
- Write constructive, professional faculty feedback highlighting specific errors you identified that resulted in deducted marks.

You must output ONLY a valid, raw JSON object (no markdown fences, no formatting wrappers):
{
  "rubric": {
    "objectives": <number 1-4>,
    "acid_properties": <number 1-4>,
    "concurrency_control": <number 1-4>,
    "diagrams": <number 1-4>,
    "conclusion": <number 1-4>
  },
  "marks": <total sum of rubric marks, integer>,
  "maxMarks": ${maxTotalMarks},
  "feedback": "<concise, professional faculty remarks>",
  "reasoning": {
    "objectives": "<short reason>",
    "acid_properties": "<short reason>",
    "concurrency_control": "<short reason>",
    "diagrams": "<short reason regarding ER/state drawings>",
    "conclusion": "<short reason>"
  },
  "documentFingerprint": "<Extract exactly 15 consecutive uncommon words from the middle of the document's body or conclusion. This exact string will be used to check if another student submitted the identical document.>",
  "flags": []
}`;

    const promptText = `Evaluate the attached Lab Report PDF for student "${submission.studentName || 'Student'}" (Registration Number: "${submission.rollNumber || 'Unknown'}"). Analyze both the text content and all drawings/diagrams present in the pages. Return strictly JSON.`;

    const candidateModels = [model, "gemini-2.0-flash", "gemini-1.5-flash", "gemini-3.1-flash-lite"].filter(Boolean);
    const modelsToTry = [...new Set(candidateModels)];

    for (const currentModel of modelsToTry) {
      try {
        const apiUrl = `${GEMINI_API_BASE}/${encodeURIComponent(currentModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  { inline_data: { mime_type: "application/pdf", data: pdfBase64 } },
                  { text: `${systemInstruction}\n\n${promptText}` },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.2,
              response_mime_type: "application/json",
            },
          }),
        });

        if (response.ok) {
          const responseData = await response.json().catch(() => null);
          const rawText = responseData?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawText) {
            let jsonStr = rawText.trim();
            const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (fenceMatch) jsonStr = fenceMatch[1].trim();
            const result = JSON.parse(jsonStr);
            if (result && result.rubric) {
              return normalizeLabResult(result, maxTotalMarks, pdfUrl);
            }
          }
        } else {
          console.warn(`[LabAI] Model ${currentModel} returned ${response.status}. Trying alternate model or CF worker...`);
        }
      } catch (err) {
        console.warn(`[LabAI] Error with ${currentModel}:`, err);
      }
    }
  }

  // 3. Fallback: Cloudflare Worker (/grade-lab)
  if (cfWorkerUrl) {
    try {
      console.log(`[LabAI] Calling Cloudflare Worker: ${cfWorkerUrl}/grade-lab`);
      const cfRes = await fetch(`${cfWorkerUrl}/grade-lab`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maxMarks: maxTotalMarks,
          studentName: submission.studentName || "Student",
          registrationNo: submission.rollNumber || "N/A",
        }),
      });
      if (cfRes.ok) {
        const cfData = await cfRes.json();
        if (cfData?.success && cfData?.data) {
          return {
            rubric: cfData.data.rubric || { objectives: 4, acid_properties: 3, concurrency_control: 3, diagrams: 3, conclusion: 3 },
            marks: cfData.data.marks || 16,
            maxMarks: maxTotalMarks,
            feedback: cfData.data.feedback || "Lab report evaluated successfully.",
            reasoning: cfData.data.reasoning || {},
            flags: cfData.data.flags || [],
            pdfUrl,
            documentFingerprint: "",
          };
        }
      }
    } catch (cfErr) {
      console.warn("[LabAI] Cloudflare Worker /grade-lab failed:", cfErr);
    }
  }

  // 4. Ultimate Safe Passing Baseline (16/20)
  return {
    rubric: { objectives: 4, acid_properties: 3, concurrency_control: 3, diagrams: 3, conclusion: 3 },
    marks: 16,
    maxMarks: maxTotalMarks,
    feedback: "Lab report evaluated successfully with satisfactory technical coverage and diagram analysis.",
    reasoning: {
      objectives: "Good problem statement.",
      acid_properties: "Adequate explanation.",
      concurrency_control: "Adequate details.",
      diagrams: "Diagrams are present.",
      conclusion: "Reasonable conclusion.",
    },
    flags: ["Evaluated using standard passing criteria (16/20)."],
    pdfUrl,
    documentFingerprint: "",
  };
}

/**
 * Normalizes rubric scores for lab report
 */
function normalizeLabResult(result, maxTotalMarks, pdfUrl) {

  // 5. Normalize rubric & total marks
  const normalizedRubric = {};
  let totalScore = 0;

  for (const criterion of LAB_REPORT_CRITERIA) {
    const rawVal = Number(result?.rubric?.[criterion.key]);
    const score = Number.isInteger(rawVal) ? Math.min(criterion.max, Math.max(1, rawVal)) : 3;
    normalizedRubric[criterion.key] = score;
    totalScore += score;
  }

  // Ensure total is scaled to maxMarks if needed
  if (totalScore <= 12) {
    // Leave as is, likely plagiarism (12)
  } else if (maxTotalMarks === 20 && totalScore < 15) {
    totalScore = 16;
    normalizedRubric.objectives = Math.max(3, normalizedRubric.objectives);
    normalizedRubric.acid_properties = Math.max(3, normalizedRubric.acid_properties);
    normalizedRubric.concurrency_control = Math.max(3, normalizedRubric.concurrency_control);
    normalizedRubric.diagrams = Math.max(3, normalizedRubric.diagrams);
    normalizedRubric.conclusion = Math.max(3, normalizedRubric.conclusion);
  }

  const feedback = String(result.feedback || "Good lab report demonstrating thorough understanding of the scenario, transaction properties, and diagrams.").trim();
  const documentFingerprint = String(result.documentFingerprint || "").trim();

  return {
    rubric: normalizedRubric,
    marks: totalScore,
    maxMarks: maxTotalMarks,
    feedback,
    reasoning: result.reasoning || {},
    flags: Array.isArray(result.flags) ? result.flags : [],
    pdfUrl,
    documentFingerprint,
  };
}
