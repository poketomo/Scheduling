import { confirmedAssignmentStatus, lessonRequestStatus, now, reasonLabels, uid } from "./constants.js";
import { buildScoreBreakdown, scoreCandidate, supportLoadOfStudent } from "./scoring.js";

export function generateScheduleSolutions(db, options = {}) {
  const candidateCount = Number(options.candidateCount || 5);
  const preserveLocks = Boolean(options.preserveLocks);
  const templateId = options.templateId || db.timetableTemplates[0]?.id || null;
  const runId = uid("run");
  const run = {
    id: runId,
    timetableTemplateId: templateId,
    status: "completed",
    createdAt: now(),
    inputSnapshotJson: buildInputSnapshot(db)
  };

  const lockedAssignments = preserveLocks ? applyLockedAssignments(db, options.lockedAssignments || getLockedAssignments(db)) : [];
  const allCandidates = buildCandidateAssignments(db, options);
  const validCandidates = filterInvalidCandidates(db, allCandidates);
  const units = buildLessonRequestUnits(db);
  const orderBase = [...units].sort((a, b) => candidateHardness(validCandidates, b) - candidateHardness(validCandidates, a));
  const rankedSolutions = [];

  for (let variant = 0; variant < candidateCount; variant += 1) {
    const order = variant % 2 === 0 ? orderBase : [...orderBase].reverse();
    const solutionId = uid("solution");
    const result = assignStudents(db, validCandidates, {
      order,
      variantSeed: variant,
      lockedAssignments,
      allowSameDayMultipleLessons: options.allowSameDayMultipleLessons ?? true
    });
    const assignments = result.assignments.map((assignment) => ({
      id: uid("schedule-assignment"),
      scheduleSolutionId: solutionId,
      teacherId: assignment.teacherId,
      studentId: assignment.studentId,
      lessonRequestId: assignment.lessonRequestId,
      occurrenceIndex: assignment.occurrenceIndex,
      subjectId: assignment.subjectId,
      timeSlotId: assignment.timeSlotId,
      score: assignment.score,
      scoreBreakdownJson: assignment.scoreBreakdown,
      isLocked: assignment.isLocked || false
    }));
    rankedSolutions.push({
      solution: {
        id: solutionId,
        scheduleRunId: runId,
        rank: variant + 1,
        totalScore: assignments.reduce((sum, item) => sum + item.score, 0),
        assignedCount: assignments.length,
        unassignedCount: result.unassigned.length,
        summaryJson: summarizeSolution({ assignments, unassigned: result.unassigned })
      },
      assignments
    });
  }

  rankedSolutions.sort((a, b) =>
    b.solution.totalScore - a.solution.totalScore ||
    b.solution.assignedCount - a.solution.assignedCount ||
    a.solution.unassignedCount - b.solution.unassignedCount
  );
  rankedSolutions.forEach((entry, index) => {
    entry.solution.rank = index + 1;
  });

  return {
    run,
    solutions: rankedSolutions.map((entry) => entry.solution),
    assignments: rankedSolutions.flatMap((entry) => entry.assignments)
  };
}

export function buildLessonRequestUnits(db) {
  const confirmedCountByRequest = new Map();
  for (const assignment of db.confirmedAssignments.filter((item) => item.status === confirmedAssignmentStatus.confirmed && item.lessonRequestId)) {
    confirmedCountByRequest.set(assignment.lessonRequestId, (confirmedCountByRequest.get(assignment.lessonRequestId) || 0) + 1);
  }
  const units = [];
  for (const request of getActiveLessonRequests(db)) {
    const confirmedCount = confirmedCountByRequest.get(request.id) || 0;
    const remaining = Math.max(0, Number(request.lessonsPerWeek || 1) - confirmedCount);
    for (let occurrenceIndex = 1; occurrenceIndex <= remaining; occurrenceIndex += 1) {
      units.push({
        unitId: `${request.id}::${occurrenceIndex}`,
        lessonRequestId: request.id,
        occurrenceIndex,
        studentId: request.studentId,
        subjectId: request.subjectId,
        priority: Number(request.priority || 3)
      });
    }
  }
  return units;
}

export function buildCandidateAssignments(db, options = {}) {
  const units = buildLessonRequestUnits(db);
  const candidates = [];
  for (const unit of units) {
    const request = db.lessonRequests.find((item) => item.id === unit.lessonRequestId);
    if (!request) continue;
    const studentSlots = new Set(getStudentAvailability(db, unit.studentId));
    const blockedTeachers = new Set(request.blockedTeacherIds || []);
    const preferredTeachers = new Set(request.preferredTeacherIds || []);
    for (const teacher of db.teachers) {
      if (blockedTeachers.has(teacher.id)) continue;
      if (!getTeacherSubjectIds(db, teacher.id).includes(unit.subjectId)) continue;
      const teacherSlots = new Set(getTeacherAvailability(db, teacher.id));
      for (const timeSlotId of studentSlots) {
        if (!teacherSlots.has(timeSlotId)) continue;
        const slot = db.timeSlots.find((item) => item.id === timeSlotId);
        candidates.push({
          unitId: unit.unitId,
          lessonRequestId: unit.lessonRequestId,
          occurrenceIndex: unit.occurrenceIndex,
          studentId: unit.studentId,
          subjectId: unit.subjectId,
          teacherId: teacher.id,
          timeSlotId,
          dayOfWeek: slot?.dayOfWeek || null,
          preferredTeacherIds: preferredTeachers,
          blockedTeacherIds: blockedTeachers,
          preferredGender: request.preferredGender || null,
          teacherGender: teacher.gender,
          priority: request.priority || unit.priority,
          allowSameDayMultipleLessons: options.allowSameDayMultipleLessons ?? true
        });
      }
    }
  }
  return candidates;
}

export function filterInvalidCandidates(db, candidates) {
  const teacherIds = new Set(db.teachers.map((item) => item.id));
  const studentIds = new Set(db.students.map((item) => item.id));
  const subjectIds = new Set(db.subjects.map((item) => item.id));
  const slotIds = new Set(db.timeSlots.filter((slot) => slot.isActive).map((item) => item.id));
  const lessonRequestIds = new Set(db.lessonRequests.map((item) => item.id));
  return candidates.filter((candidate) =>
    teacherIds.has(candidate.teacherId) &&
    studentIds.has(candidate.studentId) &&
    subjectIds.has(candidate.subjectId) &&
    slotIds.has(candidate.timeSlotId) &&
    lessonRequestIds.has(candidate.lessonRequestId)
  );
}

export function assignStudents(db, candidates, options = {}) {
  const committedAssignments = getCommittedAssignments(db);
  const lockedAssignments = options.lockedAssignments || [];
  const resultAssignments = lockedAssignments.map(cloneLockedAssignment);
  const occupancyAssignments = committedAssignments.concat(resultAssignments);
  const unassigned = [];
  const order = options.order || buildLessonRequestUnits(db);

  for (const [index, unit] of order.entries()) {
    if (resultAssignments.some((assignment) => assignment.unitId === unit.unitId)) continue;
    const valid = candidates
      .filter((candidate) => candidate.unitId === unit.unitId)
      .filter((candidate) => isFeasibleCandidate(occupancyAssignments, candidate, options))
      .map((candidate) => scoreAndShapeCandidate(db, candidate, occupancyAssignments, resultAssignments, index + (options.variantSeed || 0)))
      .sort((a, b) => b.score - a.score || String(a.teacherId).localeCompare(String(b.teacherId)));

    if (!valid.length) {
      unassigned.push(explainUnassignedStudent(db, unit, candidates, occupancyAssignments));
      continue;
    }

    const chosen = valid[(index + (options.variantSeed || 0)) % Math.min(valid.length, 2)];
    resultAssignments.push(chosen);
    occupancyAssignments.push(chosen);
  }

  return { assignments: resultAssignments, unassigned };
}

export function explainUnassignedStudent(db, unit, candidates = [], occupancyAssignments = []) {
  const request = db.lessonRequests.find((item) => item.id === unit.lessonRequestId);
  const reasons = [];
  const studentSlots = getStudentAvailability(db, unit.studentId);
  if (!studentSlots.length) reasons.push(reason("NO_STUDENT_AVAILABILITY"));
  if (!request?.subjectId) reasons.push(reason("NO_SUBJECT_REQUEST"));

  const teacherForSubject = db.teachers.filter((teacher) => getTeacherSubjectIds(db, teacher.id).includes(unit.subjectId));
  if (!teacherForSubject.length) reasons.push(reason("NO_TEACHER_FOR_SUBJECT"));

  const allForUnit = candidates.filter((candidate) => candidate.unitId === unit.unitId);
  if (!allForUnit.length && teacherForSubject.length && studentSlots.length) {
    const blockedAvailable = teacherForSubject.filter((teacher) => (request?.blockedTeacherIds || []).includes(teacher.id));
    if (blockedAvailable.length === teacherForSubject.length && blockedAvailable.length > 0) {
      reasons.push(reason("ONLY_BLOCKED_TEACHERS_AVAILABLE"));
      reasons.push(reason("NO_COMMON_TIME_SLOT"));
    } else {
      reasons.push(reason("NO_COMMON_TIME_SLOT"));
    }
  }

  if (allForUnit.length) {
    const capacityBlocked = allForUnit.every((candidate) =>
      occupancyAssignments.filter((assignment) => assignment.teacherId === candidate.teacherId && assignment.timeSlotId === candidate.timeSlotId).length >= 3
    );
    if (capacityBlocked) reasons.push(reason("TEACHER_SLOT_CAPACITY_FULL"));

    const studentConflict = allForUnit.every((candidate) =>
      occupancyAssignments.some((assignment) => assignment.studentId === candidate.studentId && assignment.timeSlotId === candidate.timeSlotId)
    );
    if (studentConflict) reasons.push(reason("STUDENT_TIME_CONFLICT"));

    const lockedConflict = allForUnit.every((candidate) =>
      occupancyAssignments.some((assignment) =>
        assignment.timeSlotId === candidate.timeSlotId &&
        ((assignment.teacherId === candidate.teacherId && assignment.isCommitted) ||
          (assignment.studentId === candidate.studentId && assignment.isCommitted) ||
          assignment.isLocked)
      )
    );
    if (lockedConflict) reasons.push(reason("LOCKED_ASSIGNMENT_CONFLICT"));
  }

  if (!reasons.length) reasons.push(reason("UNKNOWN"));
  return {
    lessonRequestId: unit.lessonRequestId,
    studentId: unit.studentId,
    reasons,
    reason: reasons.map((item) => item.label).join(" / ")
  };
}

export function applyLockedAssignments(db, lockedAssignments) {
  return lockedAssignments
    .filter((assignment) => filterInvalidCandidates(db, [assignment]).length === 1)
    .map(cloneLockedAssignment);
}

export function summarizeSolution(solution) {
  return {
    unassigned: solution.unassigned || []
  };
}

export function getLockedAssignments(db) {
  return db.scheduleAssignments.filter((item) => item.isLocked);
}

export function createConfirmedAssignmentsFromSolution(db, solutionId) {
  const assignments = db.scheduleAssignments.filter((item) => item.scheduleSolutionId === solutionId);
  const createdAt = now();
  return assignments.map((assignment) => ({
    id: uid("confirmed-assignment"),
    studentId: assignment.studentId,
    lessonRequestId: assignment.lessonRequestId,
    teacherId: assignment.teacherId,
    subjectId: assignment.subjectId,
    timeSlotId: assignment.timeSlotId,
    status: confirmedAssignmentStatus.confirmed,
    confirmedAt: createdAt,
    sourceScheduleSolutionId: solutionId,
    memo: ""
  }));
}

function scoreAndShapeCandidate(db, candidate, occupancyAssignments, resultAssignments, salt) {
  const sameTeacherSlotAssignments = occupancyAssignments.filter((item) => item.teacherId === candidate.teacherId && item.timeSlotId === candidate.timeSlotId);
  const requestAssignments = resultAssignments.filter((item) => item.lessonRequestId === candidate.lessonRequestId);
  const teacherAssignmentCount = occupancyAssignments.filter((item) => item.teacherId === candidate.teacherId).length;
  const averageTeacherLoad = occupancyAssignments.length / Math.max(db.teachers.length, 1);
  const score = scoreCandidate(db, candidate, {
    preferredTeacherIds: candidate.preferredTeacherIds,
    preferredGender: candidate.preferredGender,
    teacherGender: candidate.teacherGender,
    isCurrentTeacher: isCurrentTeacher(db, candidate.studentId, candidate.teacherId),
    assignmentGroup: [...sameTeacherSlotAssignments, candidate],
    requestAssignments,
    teacherAssignmentCount,
    averageTeacherLoad,
    noise: salt % 3
  });
  return {
    unitId: candidate.unitId,
    lessonRequestId: candidate.lessonRequestId,
    occurrenceIndex: candidate.occurrenceIndex,
    studentId: candidate.studentId,
    teacherId: candidate.teacherId,
    subjectId: candidate.subjectId,
    timeSlotId: candidate.timeSlotId,
    dayOfWeek: candidate.dayOfWeek,
    score: score.total,
    scoreBreakdown: score.breakdown
  };
}

function isFeasibleCandidate(occupancyAssignments, candidate, options = {}) {
  const teacherSlotAssignments = occupancyAssignments.filter((item) => item.teacherId === candidate.teacherId && item.timeSlotId === candidate.timeSlotId);
  if (teacherSlotAssignments.length >= 3) return false;
  if (occupancyAssignments.some((item) => item.studentId === candidate.studentId && item.timeSlotId === candidate.timeSlotId)) return false;
  if (options.allowSameDayMultipleLessons === false) {
    const sameRequestSameDay = occupancyAssignments.some((item) => item.lessonRequestId === candidate.lessonRequestId && item.dayOfWeek === candidate.dayOfWeek);
    if (sameRequestSameDay) return false;
  }
  return true;
}

function candidateHardness(candidates, unit) {
  const count = candidates.filter((candidate) => candidate.lessonRequestId === unit.lessonRequestId).length;
  return (unit.priority || 3) * 10 + (count ? 100 / count : 1000);
}

function cloneLockedAssignment(assignment) {
  const slotDay = assignment.dayOfWeek || null;
  return {
    unitId: assignment.unitId || `${assignment.lessonRequestId || assignment.studentId}:${assignment.occurrenceIndex || 1}`,
    lessonRequestId: assignment.lessonRequestId || null,
    occurrenceIndex: assignment.occurrenceIndex || 1,
    teacherId: assignment.teacherId,
    studentId: assignment.studentId,
    subjectId: assignment.subjectId,
    timeSlotId: assignment.timeSlotId,
    dayOfWeek: slotDay,
    score: assignment.score || 0,
    scoreBreakdown: assignment.scoreBreakdownJson || assignment.scoreBreakdown || buildScoreBreakdown([]).breakdown,
    isLocked: true
  };
}

function buildInputSnapshot(db) {
  return {
    teachers: db.teachers,
    students: db.students,
    subjects: db.subjects,
    timeSlots: db.timeSlots,
    teacherSubjects: db.teacherSubjects,
    teacherAvailabilitySlots: db.teacherAvailabilitySlots,
    studentAvailabilitySlots: db.studentAvailabilitySlots,
    studentSubjectRequests: db.studentSubjectRequests,
    lessonRequests: db.lessonRequests,
    studentTeacherPreferences: db.studentTeacherPreferences,
    studentGenderPreferences: db.studentGenderPreferences,
    currentLessonAssignments: db.currentLessonAssignments,
    confirmedAssignments: db.confirmedAssignments
  };
}

function getCommittedAssignments(db) {
  return db.confirmedAssignments
    .filter((item) => item.status === confirmedAssignmentStatus.confirmed)
    .map((item) => ({
      unitId: `confirmed:${item.id}`,
      lessonRequestId: item.lessonRequestId,
      occurrenceIndex: 1,
      teacherId: item.teacherId,
      studentId: item.studentId,
      subjectId: item.subjectId,
      timeSlotId: item.timeSlotId,
      dayOfWeek: getSlotDayOfWeek(db, item.timeSlotId),
      isCommitted: true,
      isLocked: false,
      score: 0,
      scoreBreakdown: []
    }));
}

function getActiveLessonRequests(db) {
  return db.lessonRequests.filter((item) => item.status !== lessonRequestStatus.inactive);
}

function getTeacherAvailability(db, teacherId) {
  return db.teacherAvailabilitySlots.filter((item) => item.teacherId === teacherId).map((item) => item.timeSlotId);
}

function getStudentAvailability(db, studentId) {
  return db.studentAvailabilitySlots.filter((item) => item.studentId === studentId).map((item) => item.timeSlotId);
}

function getTeacherSubjectIds(db, teacherId) {
  return db.teacherSubjects.filter((item) => item.teacherId === teacherId).map((item) => item.subjectId);
}

function getSlotDayOfWeek(db, timeSlotId) {
  return db.timeSlots.find((item) => item.id === timeSlotId)?.dayOfWeek || null;
}

function isCurrentTeacher(db, studentId, teacherId) {
  return db.currentLessonAssignments.some((item) => item.studentId === studentId && item.teacherId === teacherId && item.status === "active");
}

function reason(code) {
  return { code, label: reasonLabels[code] || reasonLabels.UNKNOWN };
}

export function summarizeTeachers(db, assignments) {
  return db.teachers.map((teacher) => {
    const items = assignments.filter((item) => item.teacherId === teacher.id);
    return {
      teacherId: teacher.id,
      teacherName: teacher.name,
      slotCount: new Set(items.map((item) => item.timeSlotId)).size,
      studentCount: items.length,
      load: items.reduce((sum, item) => sum + supportLoadOfStudent(db, item.studentId), 0)
    };
  });
}
