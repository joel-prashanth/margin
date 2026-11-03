/**
 * Aurora ERP Draft Gradebook Service
 * Fetches published & draft-saved evaluations for specific classes and renders the official Gradebook UI replica.
 */

export const API_BASE = "https://admissionsserver.aurora.edu.in/api/v1";

function cleanSectionLabel(code) {
  if (!code) return "";
  let s = String(code).trim();
  s = s.replace(/\b\d{4}[-_]\d{4}\b/g, "").replace(/\b\d{4}\s*-\s*\d{4}\b/g, "").trim();
  s = s.replace(/B\.\s*TECH/gi, "BTECH");
  s = s.replace(/[-_]{2,}/g, "-").replace(/^[-_\s]+|[-_\s]+$/g, "");
  return s || String(code).trim();
}

function normalizeCode(str) {
  return String(str || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

export function extractStudentName(stu) {
  if (!stu) return "";
  const s = stu.student || stu.user || stu;
  
  let name = 
    s.name ||
    s.studentName ||
    s.fullName ||
    s.displayName ||
    stu.studentName ||
    stu.fullName ||
    stu.name ||
    stu.displayName ||
    s.user?.name ||
    s.user?.fullName ||
    stu.user?.name ||
    stu.user?.fullName;

  if (!name) {
    const parts = [
      s.firstName || stu.firstName,
      s.middleName || stu.middleName,
      s.lastName || stu.lastName
    ].filter(Boolean).map(v => String(v).trim());
    if (parts.length > 0) {
      name = parts.join(" ");
    }
  }

  if (name && typeof name === 'string') {
    const trimmed = name.trim();
    if (trimmed && trimmed.toUpperCase() !== "UNKNOWN" && !trimmed.toLowerCase().startsWith("student (")) {
      return trimmed;
    }
  }
  return "";
}

export function extractStudentRegNo(stu) {
  if (!stu) return "";
  const s = stu.student || stu.user || stu;
  const reg = 
    stu.registrationNo ||
    stu.rollNo ||
    stu.studentRegistrationNo ||
    stu.admissionNo ||
    s.registrationNo ||
    s.rollNo ||
    s.studentRegistrationNo ||
    s.admissionNo ||
    stu.studentId ||
    stu.id;
  return reg ? String(reg).trim().toUpperCase() : "";
}

/**
 * Fetches all active faculty timetable entries to discover unique taught classes
 */
export async function fetchFacultyClasses() {
  const now = new Date();
  const monday = new Date(now);
  const day = monday.getDay();
  const diff = monday.getDate() - day + (day === 0 ? -6 : 1);
  monday.setDate(diff);

  const weekOffsets = [0, -7, -14, 7];
  const entries = [];

  for (const offset of weekOffsets) {
    const d = new Date(monday);
    d.setDate(d.getDate() + offset);
    const mondayStr = d.toISOString().split('T')[0];

    try {
      const res = await fetch(`${API_BASE}/timetable/entries/mine?weekStart=${encodeURIComponent(mondayStr)}`, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : Array.isArray(data?.entries) ? data.entries : [];
        entries.push(...list);
      }
    } catch (e) {
      // ignore
    }
  }

  const classesMap = new Map();
  entries.forEach((e) => {
    if (!e.sectionCode || e.isCancelled) return;
    const cleanLabel = cleanSectionLabel(e.sectionCode || e.sectionName);
    const key = normalizeCode(cleanLabel);
    if (!key) return;

    if (!classesMap.has(key)) {
      classesMap.set(key, {
        key,
        sectionId: e.sectionId,
        sectionCode: e.sectionCode,
        sectionName: e.sectionName,
        courseOfferingId: e.courseOfferingId,
        subjectName: e.subjectName || e.subjectCode || "",
        label: cleanLabel,
        sectionIds: new Set([e.sectionId].filter(Boolean)),
        courseOfferingIds: new Set([e.courseOfferingId].filter(Boolean)),
      });
    } else {
      const existing = classesMap.get(key);
      if (e.sectionId) existing.sectionIds.add(e.sectionId);
      if (e.courseOfferingId) existing.courseOfferingIds.add(e.courseOfferingId);
      if (e.subjectName && !existing.subjectName) existing.subjectName = e.subjectName;
    }
  });

  return Array.from(classesMap.values());
}

/**
 * Fetches official class roster
 */
export async function fetchClassRoster(sectionId, courseOfferingId) {
  const res = await fetch(
    `${API_BASE}/attendance/sections/${encodeURIComponent(sectionId)}/roster?courseOfferingId=${encodeURIComponent(courseOfferingId)}`,
    {
      credentials: "include",
      headers: { Accept: "application/json" },
    }
  );

  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : Array.isArray(data?.roster) ? data.roster : Array.isArray(data?.students) ? data.students : [];
}

/**
 * Fetches all faculty assessments
 */
export async function fetchAllFacultyAssessments() {
  try {
    const res = await fetch(`${API_BASE}/faculty/me/assessments?limit=100`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : Array.isArray(data?.assessments) ? data.assessments : Array.isArray(data?.data) ? data.data : [];
  } catch (e) {
    return [];
  }
}

/**
 * Fetches all submissions for an assessment including draft-saved marks
 */
export async function fetchAssessmentSubmissions(assessmentId) {
  const res = await fetch(
    `${API_BASE}/faculty/me/assessments/${encodeURIComponent(assessmentId)}/submissions`,
    {
      credentials: "include",
      headers: { Accept: "application/json" },
    }
  );

  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : Array.isArray(data?.submissions) ? data.submissions : Array.isArray(data?.data) ? data.data : [];
}
