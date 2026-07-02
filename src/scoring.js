import { scoreWeights } from "./constants.js";

export function scoreCandidate(db, candidate, context = {}) {
  const breakdown = [];
  addBreakdown(breakdown, "希望教科一致", scoreWeights.subjectMatch);

  if (context.preferredTeacherIds?.has(candidate.teacherId)) {
    addBreakdown(breakdown, "希望講師一致", scoreWeights.preferredTeacher);
  }
  if (context.isCurrentTeacher) {
    addBreakdown(breakdown, "現在担当継続", scoreWeights.currentTeacher);
  }
  if (context.preferredGender && context.preferredGender === context.teacherGender) {
    addBreakdown(breakdown, "希望性別一致", scoreWeights.genderMatch);
  }

  addBreakdown(breakdown, "手のかかる度バランス基礎", scoreWeights.supportBase);

  const supportScore = scoreSupportLevelBalance(db, context.assignmentGroup || []);
  if (supportScore !== 0) {
    addBreakdown(breakdown, "高サポート集中", supportScore);
  }

  const loadBalanceScore = scoreLoadBalance(context.teacherAssignmentCount || 0, context.averageTeacherLoad || 0);
  if (loadBalanceScore !== 0) {
    addBreakdown(breakdown, "講師負担偏り", loadBalanceScore);
  }

  const splitScore = scoreSameRequestSpread(context.requestAssignments || [], candidate);
  if (splitScore !== 0) {
    addBreakdown(breakdown, splitScore > 0 ? "別曜日分散" : "同曜日集中", splitScore);
  }

  if (typeof context.noise === "number" && context.noise !== 0) {
    addBreakdown(breakdown, "候補多様化", context.noise);
  }

  return buildScoreBreakdown(breakdown);
}

export function scoreLoadBalance(teacherAssignmentCount, averageTeacherLoad) {
  return teacherAssignmentCount > averageTeacherLoad + 1 ? scoreWeights.teacherLoadPenalty : 0;
}

export function scoreSupportLevelBalance(db, assignmentGroup) {
  const totalLoad = assignmentGroup.reduce((sum, assignment) => sum + supportLoadOfStudent(db, assignment.studentId), 0);
  return totalLoad >= 8 ? scoreWeights.supportConcentrationPenalty : 0;
}

export function scoreSameRequestSpread(requestAssignments, candidate) {
  if (!requestAssignments.length) return 0;
  const sameDay = requestAssignments.some((assignment) => assignment.dayOfWeek === candidate.dayOfWeek);
  return sameDay ? scoreWeights.sameDayRepeatPenalty : scoreWeights.splitDayBonus;
}

export function buildScoreBreakdown(parts) {
  return {
    total: parts.reduce((sum, part) => sum + part.value, 0),
    breakdown: parts.map((part) => ({ label: part.label, value: part.value }))
  };
}

export function supportLoadOfStudent(db, studentId) {
  const level = db.students.find((item) => item.id === studentId)?.supportLevel || 3;
  if (level <= 2) return 1;
  if (level === 3) return 2;
  if (level === 4) return 3;
  return 4;
}

function addBreakdown(breakdown, label, value) {
  breakdown.push({ label, value });
}
