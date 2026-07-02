import { LEGACY_STORAGE_KEY, SCHEMA_VERSION, STORAGE_KEY, now, uid } from "./constants.js";
import {
  createLessonRequestsFromStudentSubjectRequests,
  defaultSubjects,
  defaultTemplates,
  defaultTimeSlots,
  migrateLegacyState,
  normalizeConfirmedAssignments,
  removeLegacyStorage
} from "./migrations.js";

export function createEmptyDb() {
  const templateId = uid("template");
  return {
    schemaVersion: SCHEMA_VERSION,
    confirmedSolutionId: null,
    lastSavedAt: null,
    timetableTemplates: defaultTemplates(templateId),
    teachers: [],
    students: [],
    subjects: defaultSubjects(),
    timeSlots: defaultTimeSlots(templateId),
    teacherSubjects: [],
    teacherAvailabilitySlots: [],
    studentAvailabilitySlots: [],
    studentSubjectRequests: [],
    studentTeacherPreferences: [],
    studentGenderPreferences: [],
    currentLessonAssignments: [],
    lessonRequests: [],
    confirmedAssignments: [],
    scheduleRuns: [],
    scheduleSolutions: [],
    scheduleAssignments: []
  };
}

export function ensureDbShape(db) {
  const base = createEmptyDb();
  const merged = {
    ...base,
    ...(db && typeof db === "object" ? db : {})
  };

  merged.schemaVersion = SCHEMA_VERSION;
  for (const key of Object.keys(base)) {
    if (Array.isArray(base[key])) {
      merged[key] = Array.isArray(merged[key]) ? merged[key] : [];
    }
  }

  if (!merged.timetableTemplates.length) {
    const templateId = uid("template");
    merged.timetableTemplates = defaultTemplates(templateId);
    merged.timeSlots = defaultTimeSlots(templateId);
  }
  if (!merged.timeSlots.length) {
    merged.timeSlots = defaultTimeSlots(merged.timetableTemplates[0].id);
  }

  merged.confirmedAssignments = normalizeConfirmedAssignments(merged.confirmedAssignments);
  if (!merged.lessonRequests.length && merged.studentSubjectRequests.length) {
    merged.lessonRequests = createLessonRequestsFromStudentSubjectRequests(merged);
  }

  merged.confirmedSolutionId = merged.confirmedSolutionId || null;
  merged.lastSavedAt = merged.lastSavedAt || null;
  return merged;
}

export function loadDb() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      return ensureDbShape(JSON.parse(raw));
    } catch (_error) {
      return createEmptyDb();
    }
  }

  const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
  const migrated = migrateLegacyState(legacyRaw);
  if (migrated) {
    saveDb(migrated);
    removeLegacyStorage();
    return ensureDbShape(migrated);
  }

  return createEmptyDb();
}

export function saveDb(db) {
  const normalized = ensureDbShape(db);
  normalized.lastSavedAt = now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function resetDb() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LEGACY_STORAGE_KEY);
}

export function exportDb() {
  return JSON.stringify(loadDb(), null, 2);
}

export function importDb(json) {
  const parsed = typeof json === "string" ? JSON.parse(json) : json;
  const normalized = ensureDbShape(parsed);
  saveDb(normalized);
  return normalized;
}
