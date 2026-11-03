// =====================================================
// SHEET-DRIVEN ATTENDANCE SUBMISSION
// =====================================================

export function alreadyMarked(session) {
  return (
    Boolean(session?.id) ||
    (Array.isArray(session?.records) && session.records.length > 0) ||
    Number(session?.totalStudents ?? 0) > 0
  );
}

export function filterMappedSessions(sessions, profile) {
  return sessions.filter((session) =>
    Boolean(profile?.classMappings?.[session.sectionCode]),
  );
}

/**
 * Throws a user-facing error when the sheet or roster cannot be used.
 */
export function assertPreviewInputsValid({ rows, roster, attendanceColumn }) {
  if (!rows.length) {
    throw new Error("Google Sheet contains no attendance rows.");
  }

  if (!("Registration Number" in rows[0])) {
    throw new Error('Missing "Registration Number" column.');
  }

  if (!(attendanceColumn in rows[0])) {
    throw new Error(
      `Google Sheet attendance column "${attendanceColumn}" does not exist.`,
    );
  }

  if (!roster.length) {
    throw new Error("ERP returned an empty class roster.");
  }
}

export function getAbsentees(result) {
  return result.matched.filter((student) => student.attendance === "ABSENT");
}

/**
 * Classifies a matchAttendance() result for display.
 * Returns { type, lines, canSubmit }.
 */
export function describeValidation(result) {
  if (result.allNoClass) {
    return {
      type: "warning",
      canSubmit: false,
      lines: [
        "NO CLASS is marked for the entire ERP roster.",
        "Nothing will be submitted.",
      ],
    };
  }

  if (result.mixedNoClass) {
    return {
      type: "error",
      canSubmit: false,
      lines: [
        "NO CLASS is mixed with Present/Absent values.",
        "Correct the Google Sheet before submitting.",
      ],
    };
  }

  if (!result.safe) {
    const lines = [
      "Validation failed.",
      `ERP-only students: ${result.erpOnly.length}`,
      `Invalid attendance values: ${result.invalid.length}`,
    ];

    if (result.erpOnly.length > 0) {
      lines.push("", "Missing from Google Sheet:");

      for (const student of result.erpOnly) {
        lines.push(`${student.registrationNo} | ${student.name || "Student"}`);
      }
    }

    return { type: "error", canSubmit: false, lines };
  }

  return {
    type: "success",
    canSubmit: true,
    lines: ["✓ Validation Passed", "DRY RUN ONLY — NOTHING SENT TO ERP"],
  };
}

export function buildAttendancePayload({ session, attendanceDate, result }) {
  return {
    timetableEntryId: session.timetableEntryId,
    date: attendanceDate,
    slotId: session.slotId,
    records: result.records,
    lock: false,
  };
}

/**
 * Compares the ERP response counts with the previewed counts.
 */
export function summarizeSubmitResponse(response, result) {
  const data = response?.data ?? response;

  const totalStudents = Number(data?.totalStudents);

  const presentCount = Number(data?.presentCount);

  const absentCount = Number(data?.absentCount);

  return {
    data,
    totalStudents,
    presentCount,
    absentCount,
    countsMatch:
      totalStudents === result.records.length &&
      presentCount === result.present &&
      absentCount === result.absent,
  };
}
