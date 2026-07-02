# Scheduling MVP データ構造

## schemaVersion

- `schemaVersion`: 現在は `1`
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
- `priority` で希望順を保持

### studentTeacherPreferences

- 主キー: `id`
- 中間テーブル
- `studentId -> students.id`
- `teacherId -> teachers.id`
- `preferenceType`: `preferred` or `blocked`

### studentGenderPreferences

- 主キー: `id`
- `studentId -> students.id`
- 希望講師性別を複数保持できる

### currentLessonAssignments

- 主キー: `id`
- 現在担当中の授業
- `teacherId`, `studentId`, `subjectId`, `timeSlotId` を参照

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
- 割当本体
- `scoreBreakdownJson` にスコア内訳を保持
- `isLocked` で固定状態を保持

## 参照関係

- `teachers` 1 - n `teacherSubjects`
- `teachers` 1 - n `teacherAvailabilitySlots`
- `students` 1 - n `studentAvailabilitySlots`
- `students` 1 - n `studentSubjectRequests`
- `students` 1 - n `studentTeacherPreferences`
- `timeSlots` は可能時間と割当に共通で使う
- `scheduleRuns` 1 - n `scheduleSolutions`
- `scheduleSolutions` 1 - n `scheduleAssignments`

## 中間テーブルの意味

- 複数選択項目を文字列配列で持たないための構造
- 将来 DB 化したときもそのままテーブルへ移しやすい

## Supabase へ移す場合の対応表

- 各配列をそのままテーブルへ移行可能
- `id` は UUID へ置き換え可能
- `extraJson`, `inputSnapshotJson`, `summaryJson`, `scoreBreakdownJson` は `jsonb` 候補
- `createdAt`, `updatedAt` は `timestamp with time zone`
- 中間配列は複合ユニーク制約候補あり
