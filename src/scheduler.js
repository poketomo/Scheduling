import { now, uid } from "./constants.js";
import { buildScoreBreakdown, scoreCandidate, supportLoadOfStudent } from "./scoring.js";

export function generateScheduleSolutions(db, options = {}) {
  const candidateCount = Number(options.candidateCount || 5);
  const preserveLocks = Boolean(options.preserveLocks);
  const lockedAssignments = preserveLocks ? applyLockedAssignments(db, options.lockedAssignments || getLockedAssignments(db)) : [];
  const runId = uid("run");
  const run = {
    id: runId,
    timetableTemplateId: options.templateId || db.timetableTemplates[0]?.id || null,
    status: "completed",
    createdAt: now(),
    inputSnapshotJson: buildInputSnapshot(db)
  };

  const allCandidates = buildCandidateAssignments(db);
  const validCandidates = filterInvalidCandidates(db, allCandidates);
  const studentOrderBase = [...db.students].sort((a, b) => candidateHardness(db, validCandidates, b) - candidateHardness(db, validCandidates, a));
  const rankedSolutions = [];

  for (let variant = 0; variant < candidateCount; variant += 1) {
    const order = variant % 2 === 0 ? studentOrderBase : [...studentOrderBase].reverse();
    const solutionId = uid("solution");
    const result = assignStudents(db, validCandidates, {
      order,
      variantSeed: variant,
      lockedAssignments
    });
    const assignments = result.assignments.map((assignment) => ({
      id: uid("schedule-assignment"),
      scheduleSolutionId: solutionId,
      teacherId: assignment.teacherId,
      studentId: assignment.studentId,
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

export function buildCandidateAssignments(db) {
  const candidates = [];
  for (const student of db.students) {
    const studentSlots = new Set(getStudentAvailability(db, student.id));
    const requestedSubjects = getRequestedSubjectIds(db, student.id);
    const blockedTeachers = new Set(getTeacherPreferences(db, student.id, "blocked").map((item) => item.teacherId));
    const preferredTeachers = new Set(getTeacherPreferences(db, student.id, "preferred").map((item) => item.teacherId));
    const genderPreferenceIds = new Set(getGenderPreferences(db, student.id).map((item) => item.gender));

    for (const teacher of db.teachers) {
      if (blockedTeachers.has(teacher.id)) continue;
      const teacherSlots = new Set(getTeacherAvailability(db, teacher.id));
      const teacherSubjects = new Set(getTeacherSubjectIds(db, teacher.id));
      for (const subjectId of requestedSubjects) {
        if (!teacherSubjects.has(subjectId)) continue;
        for (const timeSlotId of studentSlots) {
          if (!teacherSlots.has(timeSlotId)) continue;
          candidates.push({
            studentId: student.id,
            teacherId: teacher.id,
            subjectId,
            timeSlotId,
            preferredTeacherIds: preferredTeachers,
            genderPreferenceIds,
            teacherGender: teacher.gender
          });
        }
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
  return candidates.filter((candidate) =>
    teacherIds.has(candidate.teacherId) &&
    studentIds.has(candidate.studentId) &&
    subjectIds.has(candidate.subjectId) &&
    slotIds.has(candidate.timeSlotId)
  );
}

export function assignStudents(db, candidates, options = {}) {
  const lockedAssignments = options.lockedAssignments || [];
  const assignments = lockedAssignments.map(cloneLockedAssignment);
  const assignedStudentIds = new Set(assignments.map((item) => item.studentId));
  const order = options.order || db.students;
  const unassigned = [];

  for (const [index, student] of order.entries()) {
    if (assignedStudentIds.has(student.id)) continue;
    const valid = candidates
      .filter((candidate) => candidate.studentId === student.id)
      .filter((candidate) => isFeasibleCandidate(assignments, candidate))
      .map((candidate) => scoreAndShapeCandidate(db, candidate, assignments, index + (options.variantSeed || 0)))
      .sort((a, b) => b.score - a.score || String(a.teacherId).localeCompare(String(b.teacherId)));

    if (!valid.length) {
      unassigned.push({
        studentId: student.id,
        reason: explainUnassignedStudent(db, student, candidates, assignments)
      });
      continue;
    }

    const chosen = valid[(index + (options.variantSeed || 0)) % Math.min(valid.length, 2)];
    assignments.push(chosen);
    assignedStudentIds.add(student.id);
  }

  return { assignments, unassigned };
}

export function explainUnassignedStudent(db, student, candidates = [], assignments = []) {
  const ownCandidates = candidates.filter((candidate) => candidate.studentId === student.id);
  if (!ownCandidates.length) {
    if (!getRequestedSubjectIds(db, student.id).length) return "希望教科が未設定";
    if (!getStudentAvailability(db, student.id).length) return "生徒の可能時間が未設定";
    const blocked = getTeacherPreferences(db, student.id, "blocked");
    if (blocked.length && blocked.length >= db.teachers.length) return "希望しない講師の条件により候補がありません";
    return "絶対条件を満たす講師候補がありません";
  }
  if (!ownCandidates.some((candidate) => isFeasibleCandidate(assignments, candidate))) {
    return "同時間帯の上限または競合により割当不可";
  }
  return "優先度の高い候補を優先したため未割当";
}

export function applyLockedAssignments(db, lockedAssignments) {
  return lockedAssignments
    .filter((assignment) => filterInvalidCandidates(db, [assignment]).length === 1)
    .filter((assignment) => isFeasibleCandidate([], assignment))
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

function scoreAndShapeCandidate(db, candidate, assignments, salt) {
  const sameTeacherSlotAssignments = assignments.filter((item) => item.teacherId === candidate.teacherId && item.timeSlotId === candidate.timeSlotId);
  const teacherAssignmentCount = assignments.filter((item) => item.teacherId === candidate.teacherId).length;
  const averageTeacherLoad = assignments.length / Math.max(db.teachers.length, 1);
  const score = scoreCandidate(db, candidate, {
    preferredTeacherIds: candidate.preferredTeacherIds,
    genderPreferenceIds: candidate.genderPreferenceIds,
    teacherGender: candidate.teacherGender,
    isCurrentTeacher: isCurrentTeacher(db, candidate.studentId, candidate.teacherId),
    assignmentGroup: [...sameTeacherSlotAssignments, candidate],
    teacherAssignmentCount,
    averageTeacherLoad,
    noise: salt % 3
  });
  return {
    studentId: candidate.studentId,
    teacherId: candidate.teacherId,
    subjectId: candidate.subjectId,
    timeSlotId: candidate.timeSlotId,
    score: score.total,
    scoreBreakdown: score.breakdown
  };
}

function isFeasibleCandidate(assignments, candidate) {
  const teacherSlotAssignments = assignments.filter((item) => item.teacherId === candidate.teacherId && item.timeSlotId === candidate.timeSlotId);
  if (teacherSlotAssignments.length >= 3) return false;
  if (assignments.some((item) => item.studentId === candidate.studentId && item.timeSlotId === candidate.timeSlotId)) return false;
  return true;
}

function candidateHardness(db, candidates, student) {
  const count = candidates.filter((candidate) => candidate.studentId === student.id).length;
  return (student.supportLevel || 3) * 10 + (count ? 100 / count : 1000);
}

function cloneLockedAssignment(assignment) {
  return {
    teacherId: assignment.teacherId,
    studentId: assignment.studentId,
    subjectId: assignment.subjectId,
    timeSlotId: assignment.timeSlotId,
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
    studentTeacherPreferences: db.studentTeacherPreferences,
    studentGenderPreferences: db.studentGenderPreferences,
    currentLessonAssignments: db.currentLessonAssignments
  };
}

function getTeacherAvailability(db, teacherId) {
  return db.teacherAvailabilitySlots.filter((item) => item.teacherId === teacherId).map((item) => item.timeSlotId);
}

function getStudentAvailability(db, studentId) {
  return db.studentAvailabilitySlots.filter((item) => item.studentId === studentId).map((item) => item.timeSlotId);
}

function getRequestedSubjectIds(db, studentId) {
  return db.studentSubjectRequests
    .filter((item) => item.studentId === studentId)
    .sort((a, b) => a.priority - b.priority)
    .map((item) => item.subjectId);
}

function getTeacherPreferences(db, studentId, type) {
  return db.studentTeacherPreferences.filter((item) => item.studentId === studentId && item.preferenceType === type);
}

function getGenderPreferences(db, studentId) {
  return db.studentGenderPreferences.filter((item) => item.studentId === studentId);
}

function getTeacherSubjectIds(db, teacherId) {
  return db.teacherSubjects.filter((item) => item.teacherId === teacherId).map((item) => item.subjectId);
}

function isCurrentTeacher(db, studentId, teacherId) {
  return db.currentLessonAssignments.some((item) => item.studentId === studentId && item.teacherId === teacherId && item.status === "active");
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
