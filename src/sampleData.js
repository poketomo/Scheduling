import { now, uid } from "./constants.js";
import { createEmptyDb } from "./storage.js";

export function buildSampleDb() {
  const db = createEmptyDb();
  const [math, english, japanese] = db.subjects.map((item) => item.id);
  const slots = db.timeSlots.filter((slot) => slot.isActive);
  const [slot1, slot2, slot3, slot4, slot5, slot6] = slots;

  const teachers = [
    { id: uid("teacher"), name: "佐藤先生", gender: "female", memo: "", extraJson: {}, createdAt: now(), updatedAt: now() },
    { id: uid("teacher"), name: "田中先生", gender: "male", memo: "", extraJson: {}, createdAt: now(), updatedAt: now() },
    { id: uid("teacher"), name: "鈴木先生", gender: "female", memo: "", extraJson: {}, createdAt: now(), updatedAt: now() }
  ];
  db.teachers.push(...teachers);

  db.teacherSubjects.push(
    link("teacher-subject", { teacherId: teachers[0].id, subjectId: math }),
    link("teacher-subject", { teacherId: teachers[0].id, subjectId: english }),
    link("teacher-subject", { teacherId: teachers[1].id, subjectId: math }),
    link("teacher-subject", { teacherId: teachers[1].id, subjectId: japanese }),
    link("teacher-subject", { teacherId: teachers[2].id, subjectId: english })
  );

  pushAvailability(db.teacherAvailabilitySlots, "teacherId", teachers[0].id, [slot1, slot2, slot3, slot4]);
  pushAvailability(db.teacherAvailabilitySlots, "teacherId", teachers[1].id, [slot2, slot3, slot4, slot5]);
  pushAvailability(db.teacherAvailabilitySlots, "teacherId", teachers[2].id, [slot1, slot3, slot5, slot6]);

  const students = [
    sampleStudent("山田花子", 4),
    sampleStudent("中村蓮", 2),
    sampleStudent("高橋葵", 5),
    sampleStudent("伊藤陽", 3),
    sampleStudent("小林碧", 1),
    sampleStudent("井上光", 5),
    sampleStudent("森未割当", 3),
    sampleStudent("上限制約A", 3),
    sampleStudent("上限制約B", 4),
    sampleStudent("上限制約C", 2),
    sampleStudent("上限制約D", 1)
  ];
  db.students.push(...students);

  linkStudentSubjects(db, students[0], [math]);
  linkStudentSubjects(db, students[1], [math]);
  linkStudentSubjects(db, students[2], [english]);
  linkStudentSubjects(db, students[3], [english]);
  linkStudentSubjects(db, students[4], [math]);
  linkStudentSubjects(db, students[5], [math]);
  linkStudentSubjects(db, students[6], [japanese]);
  linkStudentSubjects(db, students[7], [math]);
  linkStudentSubjects(db, students[8], [math]);
  linkStudentSubjects(db, students[9], [math]);
  linkStudentSubjects(db, students[10], [math]);

  pushAvailability(db.studentAvailabilitySlots, "studentId", students[0].id, [slot1, slot2]);
  pushAvailability(db.studentAvailabilitySlots, "studentId", students[1].id, [slot2, slot3]);
  pushAvailability(db.studentAvailabilitySlots, "studentId", students[2].id, [slot1, slot3]);
  pushAvailability(db.studentAvailabilitySlots, "studentId", students[3].id, [slot3, slot5]);
  pushAvailability(db.studentAvailabilitySlots, "studentId", students[4].id, [slot4]);
  pushAvailability(db.studentAvailabilitySlots, "studentId", students[5].id, [slot2, slot3]);
  pushAvailability(db.studentAvailabilitySlots, "studentId", students[6].id, [slot6]);
  pushAvailability(db.studentAvailabilitySlots, "studentId", students[7].id, [slot2]);
  pushAvailability(db.studentAvailabilitySlots, "studentId", students[8].id, [slot2]);
  pushAvailability(db.studentAvailabilitySlots, "studentId", students[9].id, [slot2]);
  pushAvailability(db.studentAvailabilitySlots, "studentId", students[10].id, [slot2]);

  db.studentTeacherPreferences.push(
    link("student-pref", { studentId: students[0].id, teacherId: teachers[0].id, preferenceType: "preferred" }),
    link("student-pref", { studentId: students[1].id, teacherId: teachers[1].id, preferenceType: "preferred" }),
    link("student-pref", { studentId: students[2].id, teacherId: teachers[0].id, preferenceType: "preferred" }),
    link("student-pref", { studentId: students[4].id, teacherId: teachers[1].id, preferenceType: "blocked" })
  );

  db.studentGenderPreferences.push(
    link("gender-pref", { studentId: students[0].id, gender: "female", priority: 1 }),
    link("gender-pref", { studentId: students[1].id, gender: "male", priority: 1 }),
    link("gender-pref", { studentId: students[5].id, gender: "female", priority: 1 })
  );

  db.currentLessonAssignments.push({
    id: uid("current"),
    teacherId: teachers[0].id,
    studentId: students[0].id,
    subjectId: math,
    timeSlotId: slot2.id,
    status: "active",
    effectiveFrom: now(),
    effectiveTo: null
  });

  return db;
}

export function mergeSampleData(targetDb) {
  return buildSampleDb({ ...targetDb });
}

function sampleStudent(name, supportLevel) {
  return { id: uid("student"), name, supportLevel, memo: "", extraJson: {}, createdAt: now(), updatedAt: now() };
}

function link(prefix, fields) {
  return { id: uid(prefix), ...fields };
}

function pushAvailability(collection, ownerKey, ownerId, slots) {
  for (const slot of slots) {
    collection.push({
      id: uid("availability"),
      [ownerKey]: ownerId,
      timeSlotId: slot.id,
      availabilityLevel: "available"
    });
  }
}

function linkStudentSubjects(db, student, subjectIds) {
  subjectIds.forEach((subjectId, index) => {
    db.studentSubjectRequests.push({
      id: uid("student-subject"),
      studentId: student.id,
      subjectId,
      priority: index + 1
    });
  });
}
