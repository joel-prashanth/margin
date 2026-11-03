// =====================================================
// REFLECTIVE JOURNAL RUBRIC
// =====================================================

export const JOURNAL_CRITERIA = [
  {
    key: "experience",
    contentKey: "experience",
    label: "Experience",
    maxMarks: 4,
  },
  {
    key: "learning",
    contentKey: "learning",
    label: "Learning",
    maxMarks: 4,
  },
  {
    key: "application",
    contentKey: "application",
    label: "Application",
    maxMarks: 4,
  },
  {
    key: "feelings",
    contentKey: "feelings",
    label: "Feelings / Reflection",
    maxMarks: 4,
  },
  {
    // Aurora ERP expects capital C when writing rubric data.
    key: "Conclusion",

    // Journal content itself uses lowercase conclusion.
    contentKey: "conclusion",

    label: "Conclusion",
    maxMarks: 4,
  },
];

// =====================================================
// STUDENT NAME
// =====================================================

function buildStudentName(student) {
  if (!student) {
    return "";
  }

  const parts = [student.firstName, student.middleName, student.lastName]
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter(Boolean);

  return parts.join(" ");
}

// =====================================================
// NORMALIZE SUBMISSION
// =====================================================

export function normalizeSubmission(submission) {
  if (!submission || typeof submission !== "object") {
    return {
      id: null,
      assessmentId: null,
      studentId: null,

      studentName: "",
      registrationNo: "",

      status: "UNKNOWN",

      submittedAt: null,

      content: {},

      attachments: [],

      marksObtained: null,

      feedback: "",

      evaluation: null,

      raw: submission ?? null,
    };
  }

  const student = submission.student ?? {};

  const evaluation = submission.evaluation ?? null;

  const studentName = buildStudentName(student) || submission.studentName || "";

  const registrationNo =
    student.registrationNo ?? submission.registrationNo ?? "";

  const marksObtained = submission.marksObtained ?? evaluation?.marks ?? null;

  const feedback = submission.feedback ?? evaluation?.feedback ?? "";

  return {
    id: submission.id ?? null,

    assessmentId: submission.assessmentId ?? null,

    studentId: submission.studentId ?? student.id ?? null,

    studentName,

    registrationNo,

    email: student.email ?? submission.email ?? "",

    status: submission.status ?? "UNKNOWN",

    submittedAt: submission.submittedAt ?? null,

    content:
      submission.content && typeof submission.content === "object"
        ? submission.content
        : {},

    attachments: Array.isArray(submission.attachments)
      ? submission.attachments
      : [],

    marksObtained,

    feedback,

    evaluation,

    raw: submission,
  };
}

// =====================================================
// FORMAT TIME SPENT
// =====================================================

export function formatTimeSpent(value) {
  const totalSeconds = Number(value ?? 0);

  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return "0 sec";
  }

  const seconds = Math.floor(totalSeconds);

  const hours = Math.floor(seconds / 3600);

  const minutes = Math.floor((seconds % 3600) / 60);

  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${remainingSeconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }

  return `${remainingSeconds}s`;
}

// =====================================================
// CALCULATE RUBRIC TOTAL
// =====================================================

export function calculateRubricTotal(rubric) {
  if (!rubric || typeof rubric !== "object") {
    return 0;
  }

  return JOURNAL_CRITERIA.reduce((total, criterion) => {
    const value = Number(rubric[criterion.key] ?? 0);

    if (!Number.isFinite(value)) {
      return total;
    }

    return total + value;
  }, 0);
}
