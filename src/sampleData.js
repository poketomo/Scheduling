import { confirmedAssignmentStatus, lessonRequestStatus, now, uid } from "./constants.js";
import { createEmptyDb } from "./storage.js";

export function buildSampleDb() {
  const db = createEmptyDb();
  const math = db.subjects.find((item) => item.name === "数学" && item.stage === "middle")?.id || db.subjects[0]?.id;
  const english = db.subjects.find((item) => item.name === "英語" && item.stage === "middle")?.id || db.subjects[1]?.id;
  const japanese = db.subjects.find((item) => item.name === "国語" && item.stage === "middle")?.id || db.subjects[2]?.id;
  const slot1 = findSlot(db, "16:00", "17:30");
  const slot2 = findSlot(db, "17:40", "19:10");
  const slot3 = findSlot(db, "19:20", "20:50");
  const slot4 = findSlot(db, "19:00", "20:20");
  const slot5 = findSlot(db, "19:00", "19:50");
  const slot6 = findSlot(db, "17:40", "19:10");

  const teachers = [
    teacher("佐藤先生", "female"),
    teacher("田中先生", "male"),
    teacher("鈴木先生", "female")
  ];
  db.teachers.push(...teachers);

  db.teacherSubjects.push(
    link("teacher-subject", { teacherId: teachers[0].id, subjectId: math }),
    link("teacher-subject", { teacherId: teachers[0].id, subjectId: english }),
    link("teacher-subject", { teacherId: teachers[1].id, subjectId: math }),
    link("teacher-subject", { teacherId: teachers[1].id, subjectId: japanese }),
    link("teacher-subject", { teacherId: teachers[2].id, subjectId: english })
  );

  pushDateAvailability(db.teacherDateAvailability, "teacherId", teachers[0].id, [
    [daysFromToday(1), slot1.id],
    [daysFromToday(1), slot2.id],
    [daysFromToday(3), slot3.id]
  ]);
  pushDateAvailability(db.teacherDateAvailability, "teacherId", teachers[1].id, [
    [daysFromToday(2), slot2.id],
    [daysFromToday(4), slot4.id]
  ]);

  const students = {
    hana: student("山田花子", 4),
    ren: student("中村蓮", 2),
    aoi: student("高橋葵", 5),
    haru: student("伊藤陽", 3),
    ao: student("小林碧", 1),
    hikaru: student("井上光", 5),
    missing: student("森未割当", 3),
    mathA: student("上限制約A", 3),
    mathB: student("上限制約B", 4),
    mathC: student("上限制約C", 2),
    mathD: student("上限制約D", 1),
    multi: student("複数教科生徒", 3),
    weeklyTwo: student("週2回希望生徒", 4),
    confirmed: student("確定済み衝突生徒", 2)
  };
  db.students.push(...Object.values(students));

  addStudentSubject(db, students.hana.id, math, 1);
  addStudentSubject(db, students.ren.id, math, 1);
  addStudentSubject(db, students.aoi.id, english, 1);
  addStudentSubject(db, students.haru.id, english, 1);
  addStudentSubject(db, students.ao.id, math, 1);
  addStudentSubject(db, students.hikaru.id, math, 1);
  addStudentSubject(db, students.missing.id, japanese, 1);
  addStudentSubject(db, students.mathA.id, math, 1);
  addStudentSubject(db, students.mathB.id, math, 1);
  addStudentSubject(db, students.mathC.id, math, 1);
  addStudentSubject(db, students.mathD.id, math, 1);
  addStudentSubject(db, students.multi.id, math, 1);
  addStudentSubject(db, students.multi.id, english, 2);
  addStudentSubject(db, students.weeklyTwo.id, english, 1);
  addStudentSubject(db, students.confirmed.id, math, 1);

  pushDateAvailability(db.studentDateAvailability, "studentId", students.hana.id, [
    [daysFromToday(1), slot1.id],
    [daysFromToday(5), slot2.id]
  ]);
  pushDateAvailability(db.studentDateAvailability, "studentId", students.ren.id, [
    [daysFromToday(2), slot2.id],
    [daysFromToday(4), slot3.id]
  ]);

  db.studentTeacherPreferences.push(
    link("student-pref", { studentId: students.hana.id, teacherId: teachers[0].id, preferenceType: "preferred" }),
    link("student-pref", { studentId: students.ren.id, teacherId: teachers[1].id, preferenceType: "preferred" }),
    link("student-pref", { studentId: students.aoi.id, teacherId: teachers[0].id, preferenceType: "preferred" }),
    link("student-pref", { studentId: students.ao.id, teacherId: teachers[1].id, preferenceType: "blocked" }),
    link("student-pref", { studentId: students.multi.id, teacherId: teachers[1].id, preferenceType: "blocked" })
  );

  db.studentGenderPreferences.push(
    link("gender-pref", { studentId: students.hana.id, gender: "female", priority: 1 }),
    link("gender-pref", { studentId: students.ren.id, gender: "male", priority: 1 }),
    link("gender-pref", { studentId: students.hikaru.id, gender: "female", priority: 1 })
  );

  db.lessonRequests.push(
    lessonRequest(students.hana.id, math, { preferredTeacherIds: [teachers[0].id], preferredGender: "female", priority: 1 }),
    lessonRequest(students.ren.id, math, { preferredTeacherIds: [teachers[1].id], preferredGender: "male", priority: 1 }),
    lessonRequest(students.aoi.id, english, { preferredTeacherIds: [teachers[0].id], priority: 1 }),
    lessonRequest(students.haru.id, english, { priority: 2 }),
    lessonRequest(students.ao.id, math, { blockedTeacherIds: [teachers[1].id], priority: 2 }),
    lessonRequest(students.hikaru.id, math, { preferredGender: "female", priority: 2 }),
    lessonRequest(students.missing.id, japanese, { priority: 1 }),
    lessonRequest(students.mathA.id, math, { priority: 3 }),
    lessonRequest(students.mathB.id, math, { priority: 3 }),
    lessonRequest(students.mathC.id, math, { priority: 3 }),
    lessonRequest(students.mathD.id, math, { priority: 3 }),
    lessonRequest(students.multi.id, math, { blockedTeacherIds: [teachers[1].id], priority: 1 }),
    lessonRequest(students.multi.id, english, { preferredTeacherIds: [teachers[0].id], priority: 2 }),
    lessonRequest(students.weeklyTwo.id, english, { lessonsPerWeek: 2, priority: 1 }),
    lessonRequest(students.confirmed.id, math, { lessonsPerWeek: 2, priority: 1 })
  );

  db.currentLessonAssignments.push({
    id: uid("current"),
    teacherId: teachers[0].id,
    studentId: students.hana.id,
    subjectId: math,
    timeSlotId: slot2.id,
    status: "active",
    effectiveFrom: now(),
    effectiveTo: null
  });

  const confirmedLessonRequest = db.lessonRequests.find((item) => item.studentId === students.confirmed.id && item.subjectId === math);
  db.confirmedAssignments.push({
    id: uid("confirmed-assignment"),
    studentId: students.confirmed.id,
    lessonRequestId: confirmedLessonRequest.id,
    teacherId: teachers[1].id,
    subjectId: math,
    timeSlotId: slot2.id,
    status: confirmedAssignmentStatus.confirmed,
    confirmedAt: now(),
    sourceScheduleSolutionId: null,
    memo: "既存確定授業"
  });

  return db;
}

function teacher(name, gender) {
  return { id: uid("teacher"), name, gender, memo: "", extraJson: {}, createdAt: now(), updatedAt: now() };
}

function student(name, supportLevel) {
  return { id: uid("student"), name, supportLevel, memo: "", extraJson: {}, createdAt: now(), updatedAt: now() };
}

function lessonRequest(studentId, subjectId, overrides = {}) {
  return {
    id: uid("lesson-request"),
    studentId,
    subjectId,
    lessonsPerWeek: overrides.lessonsPerWeek || 1,
    durationSlots: overrides.durationSlots || 1,
    priority: overrides.priority || 3,
    preferredTeacherIds: overrides.preferredTeacherIds || [],
    blockedTeacherIds: overrides.blockedTeacherIds || [],
    preferredGender: overrides.preferredGender || null,
    memo: overrides.memo || "",
    status: overrides.status || lessonRequestStatus.active
  };
}

function link(prefix, fields) {
  return { id: uid(prefix), ...fields };
}

function pushDateAvailability(collection, ownerKey, ownerId, entries) {
  for (const [date, lessonTimeSlotId] of entries) {
    collection.push({
      id: uid("date-availability"),
      [ownerKey]: ownerId,
      date,
      lessonTimeSlotId
    });
  }
}

function addStudentSubject(db, studentId, subjectId, priority) {
  db.studentSubjectRequests.push({
    id: uid("student-subject"),
    studentId,
    subjectId,
    priority
  });
}

function findSlot(db, startTime, endTime) {
  return db.timeSlots.find((slot) => slot.startTime === startTime && slot.endTime === endTime);
}

function daysFromToday(offset) {
  const base = new Date();
  base.setDate(base.getDate() + offset);
  const year = base.getFullYear();
  const month = String(base.getMonth() + 1).padStart(2, "0");
  const day = String(base.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
