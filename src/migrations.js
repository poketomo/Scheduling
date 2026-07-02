import {
  LEGACY_STORAGE_KEY,
  SCHEMA_VERSION,
  confirmedAssignmentStatus,
  lessonRequestStatus,
  now,
  uid
} from "./constants.js";

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
    teacherDateAvailability: arrayOrEmpty(legacy.teacherDateAvailability),
    studentDateAvailability: arrayOrEmpty(legacy.studentDateAvailability),
    studentSubjectRequests: arrayOrEmpty(legacy.studentSubjectRequests),
    studentTeacherPreferences: arrayOrEmpty(legacy.studentTeacherPreferences),
    studentTeacherCompatibilities: arrayOrEmpty(legacy.studentTeacherCompatibilities),
    studentGenderPreferences: arrayOrEmpty(legacy.studentGenderPreferences),
    currentLessonAssignments: arrayOrEmpty(legacy.currentLessonAssignments),
    lessonRequests: arrayOrEmpty(legacy.lessonRequests),
    confirmedAssignments: arrayOrEmpty(legacy.confirmedAssignments),
    scheduleRuns: normalizeRuns(legacy.scheduleRuns),
    scheduleSolutions: normalizeSolutions(legacy.scheduleSolutions),
    scheduleAssignments: normalizeAssignments(legacy.scheduleAssignments)
  };
  if (!db.lessonRequests.length) {
    db.lessonRequests = createLessonRequestsFromStudentSubjectRequests(db);
  }
  db.subjects = ensureSubjectCatalog(db.subjects);
  return db;
}

export function defaultTemplates(templateId = uid("template")) {
  return [{ id: templateId, name: "標準時間割", isActive: true, createdAt: now(), updatedAt: now() }];
}

export function defaultSubjects() {
  return [
    { id: uid("subject"), name: "国語", stage: "middle", sortOrder: 1, isActive: true },
    { id: uid("subject"), name: "数学", stage: "middle", sortOrder: 2, isActive: true },
    { id: uid("subject"), name: "理科", stage: "middle", sortOrder: 3, isActive: true },
    { id: uid("subject"), name: "社会", stage: "middle", sortOrder: 4, isActive: true },
    { id: uid("subject"), name: "英語", stage: "middle", sortOrder: 5, isActive: true },
    { id: uid("subject"), name: "国語", stage: "high", sortOrder: 6, isActive: true },
    { id: uid("subject"), name: "数学", stage: "high", sortOrder: 7, isActive: true },
    { id: uid("subject"), name: "理科", stage: "high", sortOrder: 8, isActive: true },
    { id: uid("subject"), name: "社会", stage: "high", sortOrder: 9, isActive: true },
    { id: uid("subject"), name: "英語", stage: "high", sortOrder: 10, isActive: true }
  ];
}

export function defaultTimeSlots(templateId) {
  const windows = [
    ["16:00", "17:30"],
    ["17:40", "19:10"],
    ["19:20", "20:50"],
    ["19:00", "20:20"],
    ["19:00", "19:50"]
  ];
  return windows.map((window, index) => ({
    id: uid("slot"),
    timetableTemplateId: templateId,
    startTime: window[0],
    endTime: window[1],
    label: `${window[0]}-${window[1]}`,
    sortOrder: index + 1,
    isActive: true
  }));
}

export function createLessonRequestsFromStudentSubjectRequests(db) {
  const preferredTeacherIdsByStudent = new Map();
  const blockedTeacherIdsByStudent = new Map();
  for (const pref of arrayOrEmpty(db.studentTeacherPreferences)) {
    const map = pref.preferenceType === "preferred" ? preferredTeacherIdsByStudent : blockedTeacherIdsByStudent;
    if (!map.has(pref.studentId)) map.set(pref.studentId, []);
    map.get(pref.studentId).push(pref.teacherId);
  }
  const preferredGenderByStudent = new Map();
  for (const pref of arrayOrEmpty(db.studentGenderPreferences)) {
    if (!preferredGenderByStudent.has(pref.studentId)) preferredGenderByStudent.set(pref.studentId, pref.gender);
  }

  return arrayOrEmpty(db.studentSubjectRequests).map((request) => ({
    id: uid("lesson-request"),
    studentId: request.studentId,
    subjectId: request.subjectId,
    lessonsPerWeek: 1,
    durationSlots: 1,
    priority: Number.isFinite(request.priority) ? request.priority : 3,
    preferredTeacherIds: preferredTeacherIdsByStudent.get(request.studentId) || [],
    blockedTeacherIds: blockedTeacherIdsByStudent.get(request.studentId) || [],
    preferredGender: preferredGenderByStudent.get(request.studentId) || null,
    memo: "",
    status: lessonRequestStatus.active
  }));
}

export function normalizeConfirmedAssignments(assignments) {
  return arrayOrEmpty(assignments).map((assignment) => ({
    ...assignment,
    status: assignment.status || confirmedAssignmentStatus.confirmed,
    confirmedAt: assignment.confirmedAt || now(),
    sourceScheduleSolutionId: assignment.sourceScheduleSolutionId || null,
    lessonRequestId: assignment.lessonRequestId || null,
    memo: assignment.memo || ""
  }));
}

function normalizeTemplates(templates, templateId) {
  const items = arrayOrEmpty(templates);
  return items.length ? items : defaultTemplates(templateId);
}

function normalizeTimeSlots(timeSlots, templateId) {
  const items = arrayOrEmpty(timeSlots);
  if (!items.length) return defaultTimeSlots(templateId);
  return items.map((slot, index) => ({
    ...slot,
    timetableTemplateId: slot.timetableTemplateId || templateId,
    label: String(slot.label || `${slot.startTime}-${slot.endTime}`),
    sortOrder: Number.isFinite(Number(slot.sortOrder)) ? Number(slot.sortOrder) : index + 1,
    isActive: slot.isActive !== false
  }));
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
    scoreBreakdownJson: assignment.scoreBreakdownJson || [],
    lessonRequestId: assignment.lessonRequestId || null,
    occurrenceIndex: assignment.occurrenceIndex || 1
  }));
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

export function removeLegacyStorage() {
  localStorage.removeItem(LEGACY_STORAGE_KEY);
}

export function ensureSubjectCatalog(subjects) {
  const existing = arrayOrEmpty(subjects);
  const next = [...existing];
  for (const subject of defaultSubjects()) {
    const hasSameSubject = next.some((item) => item.name === subject.name && (item.stage || inferStage(item.sortOrder)) === subject.stage);
    if (!hasSameSubject) next.push(subject);
  }
  return next
    .map((item, index) => ({
      ...item,
      stage: item.stage || inferStage(item.sortOrder),
      sortOrder: Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : index + 1
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function inferStage(sortOrder) {
  return Number(sortOrder) > 5 ? "high" : "middle";
}
