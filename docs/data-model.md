# Scheduling MVP データ構造

## schemaVersion

- `schemaVersion`: 現在は `2`
- `localStorage` キー: `scheduling-mvp-db-v1`
- 旧キー `scheduling-mvp-state-v1` は初回読込時に移行する

## テーブル相当配列

### teachers

- 主キー: `id`
- 講師本体
- 主な列: `name`, `gender`, `memo`, `extraJson`, `createdAt`, `updatedAt`

### students

- 主キー: `id`
- 生徒本体
- 主な列: `name`, `supportLevel`, `memo`, `extraJson`, `createdAt`, `updatedAt`

### subjects

- 主キー: `id`
- 教科マスタ

### timetableTemplates

- 主キー: `id`
- 時間割テンプレート

### timeSlots

- 主キー: `id`
- `timetableTemplateId` で `timetableTemplates` を参照
- 曜日、開始時刻、終了時刻、表示ラベル、表示順、有効フラグを保持

### teacherSubjects

- 主キー: `id`
- 中間テーブル
- `teacherId -> teachers.id`
- `subjectId -> subjects.id`

### teacherAvailabilitySlots

- 主キー: `id`
- 中間テーブル
- `teacherId -> teachers.id`
- `timeSlotId -> timeSlots.id`
- `availabilityLevel` は将来拡張用

### studentAvailabilitySlots

- 主キー: `id`
- 中間テーブル
- `studentId -> students.id`
- `timeSlotId -> timeSlots.id`

### studentSubjectRequests

- 主キー: `id`
- 中間テーブル
- `studentId -> students.id`
- `subjectId -> subjects.id`
- 旧MVP互換の希望教科入力
- 保存は維持するが、生成の中心は `lessonRequests`

### lessonRequests

- 主キー: `id`
- `studentId -> students.id`
- `subjectId -> subjects.id`
- 実際の受講希望単位
- 主な列:
  - `lessonsPerWeek`
  - `durationSlots`
  - `priority`
  - `preferredTeacherIds`
  - `blockedTeacherIds`
  - `preferredGender`
  - `memo`
  - `status`

### lessonsPerWeek の扱い

- `lessonsPerWeek = 2` のとき、内部では2件の割当ユニットに展開する
- 生成時は同じ生徒の同時間重複を禁止する
- 同じ `lessonRequest` の複数回は、可能なら別曜日へ分散する

### studentTeacherPreferences

- 主キー: `id`
- 中間テーブル
- `studentId -> students.id`
- `teacherId -> teachers.id`
- `preferenceType`: `preferred` or `blocked`
- 既存UI互換のため残し、必要に応じて `lessonRequests` へ同期する

### studentGenderPreferences

- 主キー: `id`
- `studentId -> students.id`
- 希望講師性別を複数保持できる

### currentLessonAssignments

- 主キー: `id`
- 現在担当中の授業
- `teacherId`, `studentId`, `subjectId`, `timeSlotId` を参照
- 主に継続担当スコアへ使う

### scheduleRuns

- 主キー: `id`
- 生成実行履歴
- `inputSnapshotJson` にその時点の入力断面を保存

### scheduleSolutions

- 主キー: `id`
- `scheduleRunId -> scheduleRuns.id`
- 候補順位、総合スコア、割当人数、未割当人数、要約を保持

### scheduleAssignments

- 主キー: `id`
- `scheduleSolutionId -> scheduleSolutions.id`
- 生成候補の割当本体
- `lessonRequestId` と `occurrenceIndex` を持つ
- `scoreBreakdownJson` にスコア内訳を保持
- `isLocked` で固定状態を保持

### confirmedAssignments

- 主キー: `id`
- 正式確定した授業割当
- `studentId`, `lessonRequestId`, `teacherId`, `subjectId`, `timeSlotId` を参照
- `status`: `confirmed` or `cancelled`
- `confirmedAt`, `sourceScheduleSolutionId`, `memo` を保持

## currentLessonAssignments / scheduleAssignments / confirmedAssignments の違い

- `currentLessonAssignments`
  - 現在運用中の担当情報
  - 継続担当スコアの材料
- `scheduleAssignments`
  - 自動生成された候補案の中身
  - まだ正式確定ではない
- `confirmedAssignments`
  - 正式に確定した授業
  - 次回生成時の衝突チェック対象
  - 同じ `lessonRequest` の必要回数も消化扱いにする

## 未割当理由コード

- `NO_STUDENT_AVAILABILITY`
- `NO_SUBJECT_REQUEST`
- `NO_TEACHER_FOR_SUBJECT`
- `NO_COMMON_TIME_SLOT`
- `ONLY_BLOCKED_TEACHERS_AVAILABLE`
- `TEACHER_SLOT_CAPACITY_FULL`
- `STUDENT_TIME_CONFLICT`
- `LOCKED_ASSIGNMENT_CONFLICT`
- `UNKNOWN`

## 参照関係

- `teachers` 1 - n `teacherSubjects`
- `teachers` 1 - n `teacherAvailabilitySlots`
- `students` 1 - n `studentAvailabilitySlots`
- `students` 1 - n `studentSubjectRequests`
- `students` 1 - n `lessonRequests`
- `timeSlots` は可能時間と割当に共通で使う
- `scheduleRuns` 1 - n `scheduleSolutions`
- `scheduleSolutions` 1 - n `scheduleAssignments`

## Supabase へ移す場合のテーブル候補

- `teachers`
- `students`
- `subjects`
- `timetable_templates`
- `time_slots`
- `teacher_subjects`
- `teacher_availability_slots`
- `student_availability_slots`
- `student_subject_requests`
- `lesson_requests`
- `student_teacher_preferences`
- `student_gender_preferences`
- `current_lesson_assignments`
- `schedule_runs`
- `schedule_solutions`
- `schedule_assignments`
- `confirmed_assignments`

## JSON系の列候補

- `extraJson`
- `inputSnapshotJson`
- `summaryJson`
- `scoreBreakdownJson`

これらは Supabase では `jsonb` 候補。
