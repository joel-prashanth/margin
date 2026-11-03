// =====================================================
// LANDING PAGE DEMO
// Sends the sample journal to POST {apiBase}/grade/journal.
// Without an API configured it shows a labelled sample.
// =====================================================

const CRITERIA = [
  { key: "experience", label: "Experience" },
  { key: "feelings", label: "Feelings / Reflection" },
  { key: "learning", label: "Learning" },
  { key: "application", label: "Application" },
  { key: "Conclusion", label: "Conclusion" },
];

const MAX_PER_CRITERION = 4;

const SAMPLE_RESULT = {
  rubric: { experience: 4, feelings: 3, learning: 4, application: 3, Conclusion: 3 },
  reasoning: {
    experience: "Describes a specific lab task and the problem it exposed.",
    feelings: "Names the frustration but doesn't explore why it mattered.",
    learning: "Clear, concrete design insight about the Loan entity.",
    application: "A specific next step, though not yet tied to outcomes.",
    Conclusion: "Sound takeaway; could link back to the experience.",
  },
  feedback: "Strong, specific reflection. Say a little more about how the setback changed your approach.",
};

const form = document.getElementById("demoForm");
const submitButton = document.getElementById("demoSubmit");
const resultPanel = document.getElementById("demoResult");

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderResult(result, { sample }) {
  const total = CRITERIA.reduce((sum, c) => sum + Number(result.rubric?.[c.key] ?? 0), 0);

  const fragment = document.createDocumentFragment();

  if (sample) {
    fragment.append(el("span", "result-badge", "Sample output — live grading arrives with the Margin API"));
  }

  const head = el("div", "result-head");
  head.append(el("h3", null, "Draft rubric"));

  const totalEl = el("span", "result-total", String(total));
  totalEl.append(el("small", null, `/${CRITERIA.length * MAX_PER_CRITERION}`));
  head.append(totalEl);
  fragment.append(head);

  const list = el("ul", "rubric");
  for (const criterion of CRITERIA) {
    const item = el("li");
    item.append(
      el("span", "rubric-name", criterion.label),
      el("span", "rubric-score", `${result.rubric?.[criterion.key] ?? 0}/${MAX_PER_CRITERION}`),
      el("span", "rubric-why", result.reasoning?.[criterion.key] || ""),
    );
    list.append(item);
  }
  fragment.append(list);

  if (result.feedback) {
    fragment.append(el("p", "result-feedback", `“${result.feedback}”`));
  }

  resultPanel.replaceChildren(fragment);
}

function renderError(message) {
  resultPanel.replaceChildren(el("p", "result-error", message));
}

async function gradeWithApi(apiBase, content) {
  const response = await fetch(`${apiBase.replace(/\/$/, "")}/grade/journal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    throw new Error(`The grading service returned ${response.status}. Please try again.`);
  }

  return response.json();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const content = Object.fromEntries(new FormData(form));

  if (!Object.values(content).some((value) => String(value).trim())) {
    renderError("Write at least one answer first.");
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Drafting…";

  try {
    const apiBase = window.MARGIN_CONFIG?.apiBase;

    if (apiBase) {
      renderResult(await gradeWithApi(apiBase, content), { sample: false });
    } else {
      await new Promise((resolve) => setTimeout(resolve, 700));
      renderResult(SAMPLE_RESULT, { sample: true });
    }
  } catch (error) {
    renderError(error.message || "Something went wrong. Please try again.");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Draft the grade";
  }
});

document.getElementById("year").textContent = String(new Date().getFullYear());
