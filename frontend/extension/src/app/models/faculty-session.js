// =====================================================
// FACULTY SESSION MODEL
// App-wide state for the signed-in faculty member and
// their saved Margin profile.
// =====================================================

export const facultySession = {
  profile: null,

  detectedFacultyName: null,

  facultyClasses: [],

  backgroundVerificationRunning: false,

  erpIdentityBlocked: false,

  isSettingsMode: false,
};

export function isAttendanceConfigured() {
  const { profile, isSettingsMode } = facultySession;

  return Boolean(profile?.erpFacultyName && profile?.spreadsheetId && !isSettingsMode);
}

export function mappedClassCount() {
  return Object.keys(facultySession.profile?.classMappings ?? {}).length;
}

export function getFacultyNameFromSessions(todaySessions) {
  if (!Array.isArray(todaySessions)) {
    return null;
  }

  return (
    todaySessions.find((session) => session?.facultyName)?.facultyName ?? null
  );
}

export function getFacultyNameFromClasses(classes) {
  if (!Array.isArray(classes)) {
    return null;
  }

  return classes.find((item) => item?.facultyName)?.facultyName ?? null;
}

export function assertErpIdentityAllowed() {
  if (facultySession.erpIdentityBlocked) {
    throw new Error(
      "The active Aurora ERP account does not match the saved Margin faculty profile.",
    );
  }
}
