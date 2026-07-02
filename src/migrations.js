import { LEGACY_STORAGE_KEY, SCHEMA_VERSION, weekdays, now, uid } from "./constants.js";

export function migrateLegacyState(rawValue) {
  if (!rawValue) return null;
  let legacy;
  try {
    legacy = JSON.parse(rawValue);
  } catch (_error) {
    return null;
  }

  if (!legacy || typeof legacy !== "object") return null;

  const templateId = legacy.timetableTemplates?.[0]?.id || uid("template");
  const db = {
    schemaVersion: SCHEMA_VERSION,
    confirmedSolutionId: legacy.confirmedSolutionId || null,
    lastSavedAt: legacy.lastSavedAt || null,
    timetableTemplates: normalizeTemplates(legacy.timetableTemplates, templateId),
    teachers: arrayOrEmpty(legacy.teachers),
    students: arrayOrEmpty(legacy.students),
    subjects: arrayOrEmpty(legacy.subjects),
    timeSlots: normalizeTimeSlots(legacy.timeSlots, templateId),
    teacherSubjects: arrayOrEmpty(legacy.teacherSubjects),
    teacherAvailabilitySlots: arrayOrEmpty(legacy.teacherAvailabilitySlots),
    studentAvailabilitySlots: arrayOrEmpty(legacy.studentAvailabilitySlots),
    studentSubjectRequests: arrayOrEmpty(legacy.studentSubjectRequests),
    studentTeacherPreferences: arrayOrEmpty(legacy.studentTeacherPreferences),
    studentGenderPreferences: arrayOrEmpty(legacy.studentGenderPreferences),
    currentLessonAssignments: arrayOrEmpty(legacy.currentLessonAssignments),
    scheduleRuns: normalizeRuns(legacy.scheduleRuns),
    scheduleSolutions: normalizeSolutions(legacy.scheduleSolutions),
    scheduleAssignments: normalizeAssignments(legacy.scheduleAssignments)
  };
  return db;
}

export function defaultTemplates(templateId = uid("template")) {
  return [{ id: templateId, name: "標準時間割", isActive: true, createdAt: now(), updatedAt: now() }];
}

export function defaultSubjects() {
  return [
    { id: uid("subject"), name: "数学", sortOrder: 1, isActive: true },
    { id: uid("subject"), name: "英語", sortOrder: 2, isActive: true },
    { id: uid("subject"), name: "国語", sortOrder: 3, isActive: true }
  ];
}

export function defaultTimeSlots(templateId) {
  const windows = [
    ["16:00", "17:30"],
    ["17:40", "19:10"],
    ["19:20", "20:50"]
  ];
  return weekdays.flatMap((day, dayIndex) =>
    windows.map((window, index) => ({
      id: uid("slot"),
      timetableTemplateId: templateId,
      dayOfWeek: dayIndex + 1,
      startTime: window[0],
      endTime: window[1],
      label: `${day} ${window[0]}-${window[1]}`,
      sortOrder: dayIndex * windows.length + index + 1,
      isActive: true
    }))
  );
}

function normalizeTemplates(templates, templateId) {
  const items = arrayOrEmpty(templates);
  return items.length ? items : defaultTemplates(templateId);
}

function normalizeTimeSlots(timeSlots, templateId) {
  const items = arrayOrEmpty(timeSlots);
  return items.length ? items : defaultTimeSlots(templateId);
}

function normalizeRuns(runs) {
  return arrayOrEmpty(runs).map((run) => ({
    ...run,
    inputSnapshotJson: run.inputSnapshotJson || {}
  }));
}

function normalizeSolutions(solutions) {
  return arrayOrEmpty(solutions).map((solution) => ({
    ...solution,
    summaryJson: solution.summaryJson || { unassigned: [] }
  }));
}

function normalizeAssignments(assignments) {
  return arrayOrEmpty(assignments).map((assignment) => ({
    ...assignment,
    scoreBreakdownJson: assignment.scoreBreakdownJson || []
  }));
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

export function removeLegacyStorage() {
  localStorage.removeItem(LEGACY_STORAGE_KEY);
}
