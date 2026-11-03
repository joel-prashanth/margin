// =====================================================
// GRADING RUBRICS
// Mark schemes shared by the AI services (prompting,
// normalization) and the grading views (rubric editors).
// =====================================================

// ---------- Lab Report ----------

export const LAB_REPORT_CRITERIA = [
  { key: "objectives", label: "Objectives & Scenario Definition", max: 4 },
  { key: "acid_properties", label: "ACID Properties & Concepts", max: 4 },
  { key: "concurrency_control", label: "Concurrency Control & 2PL/Locking", max: 4 },
  { key: "diagrams", label: "ER Diagram & Flow/State Diagrams (Drawings)", max: 4 },
  { key: "conclusion", label: "Analysis & Conclusion", max: 4 },
];

// ---------- Reflective Essay (5 questions x 40 = 200) ----------

export const ESSAY_CRITERIA = [
  { key: "q1", label: "Question 1", max: 40, min: 24, description: "Relational Algebra & Extended ER / Core Technical Foundations" },
  { key: "q2", label: "Question 2", max: 40, min: 24, description: "Advanced Normalization (3NF/BCNF/4NF/5NF) & Decomposition" },
  { key: "q3", label: "Question 3", max: 40, min: 24, description: "Concurrency Control, Locking & Storage Structures / RAID" },
  { key: "q4", label: "Question 4", max: 40, min: 24, description: "Database Recovery Mechanisms & MongoDB NoSQL Architecture" },
  { key: "q5", label: "Question 5", max: 40, min: 24, description: "CRUD Operations, Aggregations & Query Handling in MongoDB" },
];

export const ESSAY_MAX_MARKS = 200;
export const ESSAY_MIN_MARKS = 120;
export const QUESTION_MAX_MARKS = 40;
export const QUESTION_MIN_MARKS = 24;

// ---------- Project Report (strict 80-95 / 100 band) ----------

export const PROJECT_CRITERIA = [
  {
    key: "problem_definition",
    label: "Problem Definition & Scope",
    max: 20,
    min: 16,
    description: "Clarity of project objectives, problem statement, domain background, and literature review.",
  },
  {
    key: "system_architecture",
    label: "System Architecture & Design",
    max: 20,
    min: 16,
    description: "Architectural diagrams, database schema, data flow diagrams, and component interactions.",
  },
  {
    key: "implementation",
    label: "Implementation & Technical Depth",
    max: 20,
    min: 16,
    description: "Code modularity, algorithm choice, database queries/pipelines, and framework utilization.",
  },
  {
    key: "testing_results",
    label: "Testing, Evaluation & Results",
    max: 20,
    min: 16,
    description: "Test cases, functional testing, screenshots of output/UI, and validation of project outcomes.",
  },
  {
    key: "documentation",
    label: "Conclusion & Report Quality",
    max: 20,
    min: 16,
    description: "Report formatting, documentation standard, concluding analysis, and future enhancements.",
  },
];

export const PROJECT_MAX_MARKS = 100;
export const PROJECT_MIN_MARKS = 80;
export const PROJECT_TOP_MARKS = 95;
