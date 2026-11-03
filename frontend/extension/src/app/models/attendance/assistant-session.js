// =====================================================
// ATTENDANCE ASSISTANT MODEL
// Session detected from an open portal tab plus an
// editable roster.
// =====================================================

export const assistantState = {
  sessionId: null,
  timetableEntryId: null,
  sectionId: null,
  courseOfferingId: null,
  date: null,
  slotId: null,
  isLocked: false,
  subjectName: "",
  token: null,
  students: [], // [{ studentId, name, regNo, status }]
  lastPayload: null,
};

export function updateAssistantState(patch) {
  Object.assign(assistantState, patch);
}

/**
 * Maps the roster API response; every student defaults to PRESENT.
 */
export function rosterFromApi(rosterResponse) {
  return rosterResponse.data.data.map((s) => ({
    studentId: s.studentId,
    name: `${s.firstName} ${s.lastName}`.trim(),
    regNo: s.registrationNo,
    status: "PRESENT",
  }));
}

export function applyDomStatuses(students, domStatusMap) {
  if (Object.keys(domStatusMap).length === 0) {
    return students;
  }

  return students.map((s) => ({
    ...s,
    status: domStatusMap[s.regNo] || s.status,
  }));
}

export function setStudentStatus(index, status) {
  if (index < 0 || index >= assistantState.students.length) {
    return false;
  }

  assistantState.students[index].status = status;

  return true;
}

export function setAllStatuses(status) {
  assistantState.students.forEach((student) => {
    student.status = status;
  });
}

export function getRosterCounts() {
  const total = assistantState.students.length;

  const present = assistantState.students.filter(
    (s) => s.status === "PRESENT",
  ).length;

  return { total, present, absent: total - present };
}

export function filterStudents(query) {
  const q = (query || "").toLowerCase();

  return assistantState.students
    .map((student, index) => ({ student, index }))
    .filter(
      ({ student }) =>
        !q ||
        student.name.toLowerCase().includes(q) ||
        student.regNo.toLowerCase().includes(q),
    );
}

/**
 * Payload confirmed from the Aurora ERP network tab:
 * { timetableEntryId, date (YYYY-MM-DD), lock, slotId, records: [{studentId, status, remarks}] }
 */
export function buildAssistantPayload(timetableEntryId) {
  const records = assistantState.students.map((s) => ({
    studentId: s.studentId,
    status: s.status || "PRESENT",
    remarks: null,
  }));

  const rawDate = assistantState.date || new Date().toISOString();

  return {
    timetableEntryId,
    date: rawDate.substring(0, 10),
    lock: false,
    slotId: assistantState.slotId || null,
    records,
  };
}

export function shortSessionId(id) {
  if (!id) {
    return "Not detected";
  }

  return id.length > 20 ? `${id.substring(0, 8)}…${id.slice(-4)}` : id;
}
