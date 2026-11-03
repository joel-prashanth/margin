import { tryFetchSheet } from "../../services/sheets-api.js";
import { getRoster } from "../../services/erp-api.js";
import { normalizeRegistrationNo } from "./matcher.js";

// =====================================================
// ERP CLASS <-> GOOGLE SHEET TAB MAPPING
// =====================================================

export function getRosterStudentName(student) {
  if (student?.name) {
    return String(student.name).trim();
  }

  if (student?.studentName) {
    return String(student.studentName).trim();
  }

  return [student?.firstName, student?.middleName, student?.lastName]
    .filter(Boolean)
    .map((value) => String(value).trim())
    .join(" ");
}

/**
 * Generates likely sheet tab names, e.g. section "CSEDS-2B" in room
 * "A101" becomes "A101-CSE(DS)-1B" (sheet year is ERP year - 1).
 */
export function generateSheetCandidates(erpClass) {
  const sectionCode = String(erpClass.sectionCode ?? "")
    .trim()
    .toUpperCase();

  const rooms = erpClass.rooms ?? [];

  const candidates = new Set();

  const match = sectionCode.match(/CSE([A-Z]*)-(\d+)([A-Z])$/);

  if (!match) {
    return [];
  }

  const specialization = match[1];

  const erpYear = Number(match[2]);

  const sectionLetter = match[3];

  const sheetYear = Math.max(1, erpYear - 1);

  const csePart = specialization ? `CSE(${specialization})` : "CSE";

  for (const room of rooms) {
    if (!room) {
      continue;
    }

    candidates.add(`${room}-${csePart}-${sheetYear}${sectionLetter}`);
  }

  return [...candidates];
}

export function calculateRosterCoverage(rows, roster) {
  const sheetMap = new Map();

  for (const row of rows) {
    const registrationNo = normalizeRegistrationNo(row["Registration Number"]);

    if (!registrationNo) {
      continue;
    }

    if (!sheetMap.has(registrationNo)) {
      sheetMap.set(registrationNo, row);
    }
  }

  const matchedStudents = [];

  const missingStudents = [];

  for (const student of roster) {
    const registrationNo = normalizeRegistrationNo(student.registrationNo);

    if (!registrationNo) {
      continue;
    }

    const entry = { registrationNo, name: getRosterStudentName(student) };

    if (sheetMap.has(registrationNo)) {
      matchedStudents.push(entry);
    } else {
      missingStudents.push(entry);
    }
  }

  const matched = matchedStudents.length;

  const total = roster.length;

  const coverage = total > 0 ? (matched / total) * 100 : 0;

  return {
    matched,
    total,
    coverage,
    matchedStudents,
    missingStudents,
  };
}

/**
 * A mapping is verified only when every ERP roster student
 * appears in the sheet tab.
 */
export async function verifyMapping({ erpClass, spreadsheetId, sheetName }) {
  if (!sheetName) {
    return {
      verified: false,
      coverage: 0,
      matched: 0,
      total: 0,
      missingStudents: [],
      reason: "Sheet name is missing.",
    };
  }

  const [sheetResult, roster] = await Promise.all([
    tryFetchSheet({ spreadsheetId, sheetName }),
    getRoster(erpClass.sectionId, erpClass.courseOfferingId),
  ]);

  if (!sheetResult.success) {
    return {
      verified: false,
      coverage: 0,
      matched: 0,
      total: Array.isArray(roster) ? roster.length : 0,
      missingStudents: [],
      reason: sheetResult.error ?? "Unable to read Google Sheet tab.",
    };
  }

  if (!Array.isArray(roster) || roster.length === 0) {
    return {
      verified: false,
      coverage: 0,
      matched: 0,
      total: 0,
      missingStudents: [],
      reason: "ERP roster unavailable.",
    };
  }

  const coverage = calculateRosterCoverage(sheetResult.rows, roster);

  let reason = null;

  if (coverage.coverage !== 100) {
    reason = `${coverage.matched}/${coverage.total} ERP students matched.`;

    if (coverage.missingStudents.length > 0) {
      const missingText = coverage.missingStudents
        .map((student) =>
          student.name
            ? `${student.registrationNo} (${student.name})`
            : student.registrationNo,
        )
        .join(", ");

      reason += ` Missing from Sheet: ${missingText}`;
    }
  }

  return {
    verified: coverage.coverage === 100,
    coverage: coverage.coverage,
    matched: coverage.matched,
    total: coverage.total,
    matchedStudents: coverage.matchedStudents,
    missingStudents: coverage.missingStudents,
    reason,
  };
}

/**
 * Tries each candidate tab; returns the first verified one,
 * otherwise the candidate with the most matched students.
 */
export async function autoDetectSheetForClass({ erpClass, spreadsheetId }) {
  const candidates = generateSheetCandidates(erpClass);

  let bestResult = null;

  for (const candidate of candidates) {
    const verification = await verifyMapping({
      erpClass,
      spreadsheetId,
      sheetName: candidate,
    });

    if (verification.verified) {
      return { ...verification, sheetName: candidate };
    }

    if (!bestResult || verification.matched > (bestResult.matched ?? 0)) {
      bestResult = { ...verification, sheetName: candidate };
    }
  }

  if (bestResult) {
    return bestResult;
  }

  return {
    verified: false,
    sheetName: candidates[0] ?? "",
    coverage: 0,
    matched: 0,
    total: 0,
    missingStudents: [],
    reason:
      candidates.length === 0
        ? "Unable to generate a likely Google Sheet tab name for this ERP class."
        : "Automatic mapping could not be verified.",
  };
}

/**
 * Shape stored per section code while the setup screen is open.
 */
export function toMappingState(sheetName, result) {
  return {
    sheetName,
    verified: result.verified,
    matched: result.matched ?? 0,
    total: result.total ?? 0,
    coverage: result.coverage ?? 0,
    missingStudents: result.missingStudents ?? [],
    reason: result.reason ?? null,
  };
}

export function unverifiedMappingState(sheetName) {
  return {
    sheetName,
    verified: false,
    matched: 0,
    total: 0,
    missingStudents: [],
    reason: "Sheet mapping changed. Click Verify & Save Setup to verify it.",
  };
}
