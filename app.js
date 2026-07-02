import { genders, tabs, weekdays, now, uid } from "./src/constants.js";
import { buildSampleDb } from "./src/sampleData.js";
import { createConfirmedAssignmentsFromSolution, generateScheduleSolutions, summarizeTeachers } from "./src/scheduler.js";
import { exportDb, importDb, loadDb, resetDb, saveDb } from "./src/storage.js";
import { generatorReadiness } from "./src/validation.js";

let db = loadDb();
let ui = {
  tab: "teachers",
  selectedTeacherId: db.teachers[0]?.id || null,
  selectedStudentId: db.students[0]?.id || null,
  selectedTemplateId: db.timetableTemplates[0]?.id || null,
  selectedRunId: db.scheduleRuns[0]?.id || null,
  selectedSolutionId: db.scheduleSolutions[0]?.id || null,
  dragActive: false,
  dragValue: null
};

init();

function init() {
  bindShellActions();
  ensureSelections();
  render();
}

function bindShellActions() {
  document.getElementById("seedButton").addEventListener("click", seedSampleData);
  document.getElementById("resetButton").addEventListener("click", () => {
    if (!window.confirm("保存済みデータを初期化します。よろしいですか。")) return;
    resetDb();
    db = loadDb();
    ensureSelections();
    render();
  });
}

function persist() {
  db = saveDb(db);
  renderSidebar();
}

function ensureSelections() {
  if (!db.timetableTemplates.find((item) => item.id === ui.selectedTemplateId)) ui.selectedTemplateId = db.timetableTemplates[0]?.id || null;
  if (!db.teachers.find((item) => item.id === ui.selectedTeacherId)) ui.selectedTeacherId = db.teachers[0]?.id || null;
  if (!db.students.find((item) => item.id === ui.selectedStudentId)) ui.selectedStudentId = db.students[0]?.id || null;
  if (!db.scheduleRuns.find((item) => item.id === ui.selectedRunId)) ui.selectedRunId = db.scheduleRuns[0]?.id || null;
  if (!db.scheduleSolutions.find((item) => item.id === ui.selectedSolutionId)) ui.selectedSolutionId = db.scheduleSolutions[0]?.id || null;
}

function render() {
  ensureSelections();
  renderSidebar();
  renderNav();
  renderPage();
}

function renderSidebar() {
  const saveStatus = document.getElementById("saveStatus");
  saveStatus.innerHTML = db.lastSavedAt
    ? `<div class="callout success">最終保存: <span class="mono">${formatDateTime(db.lastSavedAt)}</span></div>`
    : `<div class="callout">まだ保存前です</div>`;
  const summary = document.getElementById("summaryStats");
  const stats = {
    講師: db.teachers.length,
    生徒: db.students.length,
    科目: activeSubjects().length,
    有効枠: activeSlots().length,
    実行履歴: db.scheduleRuns.length
  };
  summary.innerHTML = Object.entries(stats).map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`).join("");
}

function renderNav() {
  const container = document.getElementById("navTabs");
  container.innerHTML = tabs.map((tab) => `
    <button class="nav-tab ${ui.tab === tab.id ? "active" : ""}" type="button" data-tab="${tab.id}">
      ${tab.label}
    </button>
  `).join("");
  container.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      ui.tab = button.dataset.tab;
      render();
    });
  });
}

function renderPage() {
  document.getElementById("pageTitle").textContent = tabs.find((tab) => tab.id === ui.tab)?.label || "";
  const app = document.getElementById("app");
  if (ui.tab === "teachers") app.innerHTML = renderTeachersPage();
  if (ui.tab === "students") app.innerHTML = renderStudentsPage();
  if (ui.tab === "slots") app.innerHTML = renderSlotsPage();
  if (ui.tab === "generator") app.innerHTML = renderGeneratorPage();
  if (ui.tab === "results") app.innerHTML = renderResultsPage();
  bindPageEvents();
}

function renderTeachersPage() {
  const selected = db.teachers.find((item) => item.id === ui.selectedTeacherId);
  return `
    <div class="layout-two">
      <section class="panel">
        <div class="panel-header">
          <h3>講師一覧</h3>
          <button class="primary-btn" type="button" data-action="add-teacher">追加</button>
        </div>
        <div class="panel-body">
          <div class="entity-list">
            ${db.teachers.length ? db.teachers.map(renderTeacherListItem).join("") : `<div class="callout warn">講師が未登録です。</div>`}
          </div>
        </div>
      </section>
      <section class="panel">
        <div class="panel-header">
          <h3>${selected ? "講師編集" : "講師追加"}</h3>
          ${selected ? `<button class="danger-btn" type="button" data-action="delete-teacher" data-id="${selected.id}">削除</button>` : ""}
        </div>
        <div class="panel-body">${renderTeacherForm(selected)}</div>
      </section>
    </div>
  `;
}

function renderStudentsPage() {
  const selected = db.students.find((item) => item.id === ui.selectedStudentId);
  return `
    <div class="layout-two">
      <section class="panel">
        <div class="panel-header">
          <h3>生徒一覧</h3>
          <button class="primary-btn" type="button" data-action="add-student">追加</button>
        </div>
        <div class="panel-body">
          <div class="entity-list">
            ${db.students.length ? db.students.map(renderStudentListItem).join("") : `<div class="callout warn">生徒が未登録です。</div>`}
          </div>
        </div>
      </section>
      <section class="panel">
        <div class="panel-header">
          <h3>${selected ? "生徒編集" : "生徒追加"}</h3>
          ${selected ? `<button class="danger-btn" type="button" data-action="delete-student" data-id="${selected.id}">削除</button>` : ""}
        </div>
        <div class="panel-body">${renderStudentForm(selected)}</div>
      </section>
    </div>
  `;
}

function renderSlotsPage() {
  const selectedTemplate = db.timetableTemplates.find((item) => item.id === ui.selectedTemplateId);
  const slots = timeSlotsForTemplate(ui.selectedTemplateId);
  return `
    <div class="stack">
      <section class="summary-strip">
        <div class="toolbar">
          <div class="field">
            <label for="templateSelect">時間割テンプレート</label>
            <select id="templateSelect">
              ${db.timetableTemplates.map((template) => `<option value="${template.id}" ${template.id === ui.selectedTemplateId ? "selected" : ""}>${escapeHtml(template.name)}</option>`).join("")}
            </select>
          </div>
          <button class="primary-btn" type="button" data-action="add-template">テンプレート追加</button>
          ${selectedTemplate ? `<button class="secondary-btn" type="button" data-action="rename-template" data-id="${selectedTemplate.id}">名称変更</button>` : ""}
        </div>
      </section>
      <div class="layout-two">
        <section class="panel">
          <div class="panel-header">
            <h3>時間帯一覧</h3>
            <button class="primary-btn" type="button" data-action="add-slot">スロット追加</button>
          </div>
          <div class="panel-body">
            <table class="simple-table">
              <thead><tr><th>曜日</th><th>開始</th><th>終了</th><th>表示名</th><th>順序</th><th>状態</th><th></th></tr></thead>
              <tbody>${slots.map(renderSlotRow).join("")}</tbody>
            </table>
          </div>
        </section>
        <section class="panel">
          <div class="panel-header">
            <h3>科目マスタ</h3>
            <div class="action-row">
              <button class="secondary-btn" type="button" data-action="export-db">DB出力</button>
              <button class="secondary-btn" type="button" data-action="import-db">DB取込</button>
              <button class="primary-btn" type="button" data-action="add-subject">科目追加</button>
            </div>
          </div>
          <div class="panel-body">
            <table class="simple-table">
              <thead><tr><th>科目名</th><th>表示順</th><th>状態</th><th></th></tr></thead>
              <tbody>${db.subjects.map(renderSubjectRow).join("")}</tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  `;
}

function renderGeneratorPage() {
  const issues = generatorReadiness(db);
  const selectedRun = db.scheduleRuns.find((item) => item.id === ui.selectedRunId);
  const solutions = db.scheduleSolutions.filter((item) => item.scheduleRunId === selectedRun?.id).sort((a, b) => a.rank - b.rank);
  return `
    <div class="stack">
      <section class="summary-strip">
        <div class="summary-grid">
          <div class="card"><div class="muted">講師</div><strong>${db.teachers.length}</strong></div>
          <div class="card"><div class="muted">生徒</div><strong>${db.students.length}</strong></div>
          <div class="card"><div class="muted">有効スロット</div><strong>${activeSlots().length}</strong></div>
          <div class="card"><div class="muted">実行可能性</div><strong>${issues.length ? "要確認" : "準備完了"}</strong></div>
        </div>
      </section>
      ${issues.length ? `<div class="callout warn">${issues.map((issue) => `<div>${escapeHtml(issue)}</div>`).join("")}</div>` : `<div class="callout success">生成に必要な基本条件は満たしています。</div>`}
      <section class="panel">
        <div class="panel-header">
          <h3>生成設定</h3>
          <button class="primary-btn" type="button" data-action="generate-schedule" ${issues.length ? "disabled" : ""}>作成する</button>
        </div>
        <div class="panel-body">
          <div class="toolbar">
            <label class="field">
              <span>候補案数</span>
              <select id="candidateCount">
                <option value="3">3案</option>
                <option value="5" selected>5案</option>
                <option value="8">8案</option>
              </select>
            </label>
            <label class="checkbox-item">
              <input type="checkbox" id="respectLocked" checked />
              <span>固定済み割当を維持</span>
            </label>
          </div>
        </div>
      </section>
      <section class="panel">
        <div class="panel-header"><h3>直近の生成結果</h3></div>
        <div class="panel-body">
          ${selectedRun ? `
            <div class="stack">
              <div class="card">
                <div class="muted">実行日時</div>
                <div class="mono">${formatDateTime(selectedRun.createdAt)}</div>
                <div class="muted">状態: ${escapeHtml(selectedRun.status)}</div>
              </div>
              ${solutions.length ? `
                <table class="simple-table">
                  <thead><tr><th>順位</th><th>総合スコア</th><th>割当</th><th>未割当</th><th></th></tr></thead>
                  <tbody>${solutions.map((solution) => `
                    <tr>
                      <td>${solution.rank}</td><td>${solution.totalScore}</td><td>${solution.assignedCount}</td><td>${solution.unassignedCount}</td>
                      <td><button class="ghost-btn" type="button" data-action="open-solution" data-id="${solution.id}">確認</button></td>
                    </tr>
                  `).join("")}</tbody>
                </table>
              ` : `<div class="callout warn">候補案がありません。</div>`}
            </div>
          ` : `<div class="callout">まだ生成していません。</div>`}
        </div>
      </section>
    </div>
  `;
}

function renderResultsPage() {
  const runs = [...db.scheduleRuns].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const selectedRun = runs.find((item) => item.id === ui.selectedRunId);
  const solutions = db.scheduleSolutions.filter((item) => item.scheduleRunId === selectedRun?.id).sort((a, b) => a.rank - b.rank);
  const selectedSolution = solutions.find((item) => item.id === ui.selectedSolutionId) || solutions[0];
  if (selectedSolution && ui.selectedSolutionId !== selectedSolution.id) ui.selectedSolutionId = selectedSolution.id;
  return `
    <div class="split">
      <section class="panel">
        <div class="panel-header">
          <h3>生成結果</h3>
          ${selectedSolution ? `
            <div class="action-row">
              <button class="secondary-btn" type="button" data-action="regenerate-with-locks" data-id="${selectedSolution.id}">固定を維持して再生成</button>
              <button class="primary-btn" type="button" data-action="confirm-solution" data-id="${selectedSolution.id}">候補案を確定</button>
            </div>
          ` : ""}
        </div>
        <div class="panel-body">${selectedSolution ? renderSolutionDetail(selectedSolution) : `<div class="callout warn">表示する候補案がありません。</div>`}</div>
      </section>
      <section class="panel">
        <div class="panel-header"><h3>候補一覧</h3></div>
        <div class="panel-body">
          <div class="field">
            <label for="runSelect">生成回</label>
            <select id="runSelect">
              ${runs.map((run) => `<option value="${run.id}" ${run.id === ui.selectedRunId ? "selected" : ""}>${formatDateTime(run.createdAt)} / ${escapeHtml(run.status)}</option>`).join("")}
            </select>
          </div>
          <div class="list">
            ${solutions.length ? solutions.map(renderSolutionListItem).join("") : `<div class="callout">この生成回には候補がありません。</div>`}
          </div>
        </div>
      </section>
    </div>
  `;
}

function renderTeacherListItem(teacher) {
  return `
    <button class="entity-item ${teacher.id === ui.selectedTeacherId ? "active" : ""}" type="button" data-select-teacher="${teacher.id}">
      <h4>${escapeHtml(teacher.name)}</h4>
      <div class="entity-meta">
        <span class="tag">${genderLabel(teacher.gender)}</span>
        <span class="tag">${teacherSubjectNames(teacher.id).join(" / ") || "教科未設定"}</span>
        <span class="tag">可能枠 ${db.teacherAvailabilitySlots.filter((item) => item.teacherId === teacher.id).length}</span>
      </div>
    </button>
  `;
}

function renderStudentListItem(student) {
  return `
    <button class="entity-item ${student.id === ui.selectedStudentId ? "active" : ""}" type="button" data-select-student="${student.id}">
      <h4>${escapeHtml(student.name)}</h4>
      <div class="entity-meta">
        <span class="tag">手のかかる度 ${student.supportLevel}</span>
        <span class="tag">${studentRequestedSubjectNames(student.id).join(" / ") || "希望教科未設定"}</span>
        <span class="tag">可能枠 ${db.studentAvailabilitySlots.filter((item) => item.studentId === student.id).length}</span>
      </div>
    </button>
  `;
}

function renderTeacherForm(teacher) {
  const current = teacher || createEmptyTeacher();
  return `
    <form id="teacherForm" class="stack">
      <input type="hidden" name="id" value="${current.id}" />
      <div class="form-grid two">
        <label class="field"><span>名前</span><input name="name" value="${escapeAttr(current.name)}" required /></label>
        <label class="field"><span>性別</span><select name="gender">${genderOptions(current.gender)}</select></label>
      </div>
      <fieldset class="field">
        <legend>対応教科</legend>
        <div class="checkbox-grid">${activeSubjects().map((subject) => checkboxChip("teacher-subject", subject.id, subject.name, teacherHasSubject(current.id, subject.id))).join("")}</div>
      </fieldset>
      <label class="field"><span>メモ</span><textarea name="memo">${escapeHtml(current.memo || "")}</textarea></label>
      <label class="field"><span>拡張用フィールド(JSON)</span><textarea name="extraJson">${escapeHtml(JSON.stringify(current.extraJson || {}, null, 2))}</textarea></label>
      <div class="card"><h4 class="card-title">現在担当している生徒</h4>${renderCurrentAssignmentsEditor(current.id)}</div>
      <div class="card"><h4 class="card-title">可能時間</h4>${renderAvailabilityEditor("teacher", current.id)}</div>
      <div class="action-row"><button class="primary-btn" type="submit">保存</button></div>
    </form>
  `;
}

function renderStudentForm(student) {
  const current = student || createEmptyStudent();
  const lessonRequests = lessonRequestsForStudent(current.id);
  return `
    <form id="studentForm" class="stack">
      <input type="hidden" name="id" value="${current.id}" />
      <div class="form-grid two">
        <label class="field"><span>名前</span><input name="name" value="${escapeAttr(current.name)}" required /></label>
        <label class="field">
          <span>手のかかる度</span>
          <select name="supportLevel">${[1, 2, 3, 4, 5].map((value) => `<option value="${value}" ${Number(current.supportLevel || 3) === value ? "selected" : ""}>${value}</option>`).join("")}</select>
        </label>
      </div>
      <div class="form-grid two">
        <fieldset class="field"><legend>希望教科</legend><div class="checkbox-grid">${activeSubjects().map((subject) => checkboxChip("student-subject", subject.id, subject.name, studentRequestsSubject(current.id, subject.id))).join("")}</div></fieldset>
        <fieldset class="field"><legend>希望講師性別</legend><div class="checkbox-grid">${genders.filter((item) => item.value !== "any").map((item) => checkboxChip("student-gender", item.value, item.label, studentPrefersGender(current.id, item.value))).join("")}</div></fieldset>
      </div>
      <div class="form-grid two">
        <fieldset class="field"><legend>希望の先生</legend><div class="checkbox-grid">${db.teachers.map((teacher) => checkboxChip("student-pref-preferred", teacher.id, teacher.name, studentPrefersTeacher(current.id, teacher.id, "preferred"))).join("")}</div></fieldset>
        <fieldset class="field"><legend>希望しない先生</legend><div class="checkbox-grid">${db.teachers.map((teacher) => checkboxChip("student-pref-blocked", teacher.id, teacher.name, studentPrefersTeacher(current.id, teacher.id, "blocked"))).join("")}</div></fieldset>
      </div>
      <label class="field"><span>メモ</span><textarea name="memo">${escapeHtml(current.memo || "")}</textarea></label>
      <label class="field"><span>拡張用フィールド(JSON)</span><textarea name="extraJson">${escapeHtml(JSON.stringify(current.extraJson || {}, null, 2))}</textarea></label>
      <div class="card">
        <h4 class="card-title">受講希望設定</h4>
        ${renderLessonRequestSettings(current.id, lessonRequests)}
      </div>
      <div class="card"><h4 class="card-title">可能時間</h4>${renderAvailabilityEditor("student", current.id)}</div>
      <div class="action-row"><button class="primary-btn" type="submit">保存</button></div>
    </form>
  `;
}

function renderLessonRequestSettings(studentId, requests) {
  const subjectIds = studentRequestedSubjects(studentId);
  if (!subjectIds.length) return `<div class="callout warn">希望教科を選ぶと受講希望設定が表示されます。</div>`;
  return `
    <table class="simple-table">
      <thead><tr><th>教科</th><th>週回数</th><th>コマ数</th><th>優先度</th><th>状態</th></tr></thead>
      <tbody>
        ${subjectIds.map((subjectId) => {
          const request = requests.find((item) => item.subjectId === subjectId) || defaultLessonRequestDraft(studentId, subjectId);
          return `
            <tr>
              <td>${escapeHtml(subjectName(subjectId))}</td>
              <td><input type="number" min="1" max="7" name="lessonRequest-${subjectId}-lessonsPerWeek" value="${request.lessonsPerWeek || 1}" /></td>
              <td><input type="number" min="1" max="4" name="lessonRequest-${subjectId}-durationSlots" value="${request.durationSlots || 1}" /></td>
              <td><input type="number" min="1" max="5" name="lessonRequest-${subjectId}-priority" value="${request.priority || 3}" /></td>
              <td>
                <select name="lessonRequest-${subjectId}-status">
                  <option value="active" ${request.status !== "inactive" ? "selected" : ""}>active</option>
                  <option value="inactive" ${request.status === "inactive" ? "selected" : ""}>inactive</option>
                </select>
              </td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}

function renderAvailabilityEditor(entityType, entityId) {
  const selectedIds = new Set(getAvailability(entityType, entityId).map((item) => item.timeSlotId));
  const peers = entityType === "teacher" ? db.teachers : db.students;
  return `
    <div class="availability-shell" data-availability-type="${entityType}" data-availability-owner="${entityId}">
      <div class="availability-toolbar">
        <span class="tag">選択数 ${selectedIds.size}</span>
        <button class="secondary-btn" type="button" data-action="availability-bulk" data-mode="weekday-night" data-entity-type="${entityType}" data-owner-id="${entityId}">平日夜</button>
        <button class="secondary-btn" type="button" data-action="availability-bulk" data-mode="weekend" data-entity-type="${entityType}" data-owner-id="${entityId}">土日</button>
        <button class="secondary-btn" type="button" data-action="copy-self" data-entity-type="${entityType}" data-owner-id="${entityId}">前回入力からコピー</button>
        <select data-copy-source="${entityType}" data-owner-id="${entityId}">
          <option value="">他の${entityType === "teacher" ? "講師" : "生徒"}からコピー</option>
          ${peers.filter((item) => item.id !== entityId).map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join("")}
        </select>
      </div>
      ${selectedIds.size ? "" : `<div class="callout warn">可能時間が未入力です。</div>`}
      <div class="availability-grid-wrap">
        <table class="availability-grid">
          <thead>
            <tr>
              <th>時間帯</th>
              ${weekdays.map((day, index) => `<th><button class="ghost-btn" type="button" data-action="toggle-day" data-day="${index + 1}" data-entity-type="${entityType}" data-owner-id="${entityId}">${day}</button></th>`).join("")}
            </tr>
          </thead>
          <tbody>${timeRows().map((row) => `
            <tr>
              <td><button class="ghost-btn" type="button" data-action="toggle-time-row" data-key="${escapeAttr(row.key)}" data-entity-type="${entityType}" data-owner-id="${entityId}">${escapeHtml(row.label)}</button></td>
              ${weekdays.map((day, index) => {
                const slot = activeSlots().find((item) => item.dayOfWeek === index + 1 && slotKey(item) === row.key);
                if (!slot) return "<td></td>";
                const on = selectedIds.has(slot.id);
                return `<td><div class="slot-cell ${on ? "on" : ""}" data-slot-toggle="${slot.id}" data-entity-type="${entityType}" data-owner-id="${entityId}">${on ? "ON" : ""}</div></td>`;
              }).join("")}
            </tr>
          `).join("")}</tbody>
        </table>
      </div>
    </div>
  `;
}

function renderCurrentAssignmentsEditor(teacherId) {
  const rows = db.currentLessonAssignments.filter((item) => item.teacherId === teacherId);
  return `
    <div class="stack">
      <table class="simple-table">
        <thead><tr><th>生徒</th><th>曜日・時間</th><th>教科</th><th></th></tr></thead>
        <tbody>
          ${rows.length ? rows.map((item) => `
            <tr>
              <td>${escapeHtml(studentName(item.studentId))}</td>
              <td>${escapeHtml(slotLabel(item.timeSlotId))}</td>
              <td>${escapeHtml(subjectName(item.subjectId))}</td>
              <td><button class="ghost-btn" type="button" data-action="delete-current-assignment" data-id="${item.id}">削除</button></td>
            </tr>
          `).join("") : `<tr><td colspan="4">担当中の生徒は未登録です。</td></tr>`}
        </tbody>
      </table>
      <div class="form-grid two">
        <label class="field"><span>生徒</span><select id="currentAssignmentStudent"><option value="">選択してください</option>${db.students.map((student) => `<option value="${student.id}">${escapeHtml(student.name)}</option>`).join("")}</select></label>
        <label class="field"><span>時間帯</span><select id="currentAssignmentSlot"><option value="">選択してください</option>${activeSlots().map((slot) => `<option value="${slot.id}">${escapeHtml(slot.label)}</option>`).join("")}</select></label>
        <label class="field"><span>教科</span><select id="currentAssignmentSubject"><option value="">選択してください</option>${activeSubjects().map((subject) => `<option value="${subject.id}">${escapeHtml(subject.name)}</option>`).join("")}</select></label>
        <div class="field"><span>&nbsp;</span><button class="secondary-btn" type="button" data-action="add-current-assignment" data-teacher-id="${teacherId}">担当追加</button></div>
      </div>
    </div>
  `;
}

function renderSlotRow(slot) {
  return `
    <tr>
      <td>${weekdays[slot.dayOfWeek - 1]}</td><td>${escapeHtml(slot.startTime)}</td><td>${escapeHtml(slot.endTime)}</td><td>${escapeHtml(slot.label)}</td><td>${slot.sortOrder}</td><td>${slot.isActive ? "有効" : "無効"}</td>
      <td><button class="ghost-btn" type="button" data-action="edit-slot" data-id="${slot.id}">編集</button> <button class="danger-btn" type="button" data-action="delete-slot" data-id="${slot.id}">削除</button></td>
    </tr>
  `;
}

function renderSubjectRow(subject) {
  return `
    <tr>
      <td>${escapeHtml(subject.name)}</td><td>${subject.sortOrder}</td><td>${subject.isActive ? "有効" : "無効"}</td>
      <td><button class="ghost-btn" type="button" data-action="edit-subject" data-id="${subject.id}">編集</button> <button class="danger-btn" type="button" data-action="delete-subject" data-id="${subject.id}">削除</button></td>
    </tr>
  `;
}

function renderSolutionListItem(solution) {
  return `
    <button class="entity-item ${solution.id === ui.selectedSolutionId ? "active" : ""}" type="button" data-select-solution="${solution.id}">
      <h4>候補 ${solution.rank}</h4>
      <div class="entity-meta">
        <span class="tag">総合 ${solution.totalScore}</span>
        <span class="tag">割当 ${solution.assignedCount}</span>
        <span class="tag">未割当 ${solution.unassignedCount}</span>
        ${db.confirmedSolutionId === solution.id ? `<span class="tag">確定済み</span>` : ""}
      </div>
    </button>
  `;
}

function renderSolutionDetail(solution) {
  const assignments = scheduleAssignmentsForSolution(solution.id);
  const unassigned = solution.summaryJson.unassigned || [];
  const teacherSummary = summarizeTeachers(db, assignments);
  return `
    <div class="stack">
      <div class="summary-grid">
        <div class="card"><div class="muted">候補順位</div><strong>${solution.rank}</strong></div>
        <div class="card"><div class="muted">総合スコア</div><strong>${solution.totalScore}</strong></div>
        <div class="card"><div class="muted">割当人数</div><strong>${solution.assignedCount}</strong></div>
        <div class="card"><div class="muted">未割当人数</div><strong>${solution.unassignedCount}</strong></div>
      </div>
      <div class="card-grid">
        <div class="card">
          <h4 class="card-title">未割当生徒</h4>
          ${unassigned.length ? `<table class="simple-table"><thead><tr><th>生徒</th><th>受講希望</th><th>理由</th></tr></thead><tbody>${unassigned.map((item) => `<tr><td>${escapeHtml(studentName(item.studentId))}</td><td>${escapeHtml(subjectName(lessonRequestById(item.lessonRequestId)?.subjectId))}</td><td>${(item.reasons || []).map((reason) => `${escapeHtml(reason.code)}: ${escapeHtml(reason.label)}`).join("<br>")}</td></tr>`).join("")}</tbody></table>` : `<div class="callout success">未割当はありません。</div>`}
        </div>
        <div class="card">
          <h4 class="card-title">講師別サマリ</h4>
          <table class="simple-table"><thead><tr><th>講師</th><th>コマ数</th><th>担当人数</th><th>負担</th></tr></thead><tbody>${teacherSummary.map((item) => `<tr><td>${escapeHtml(item.teacherName)}</td><td>${item.slotCount}</td><td>${item.studentCount}</td><td>${item.load}</td></tr>`).join("")}</tbody></table>
        </div>
      </div>
      <div class="card"><h4 class="card-title">曜日・時間帯ごとの割当表</h4>${renderAssignmentMatrix(assignments)}</div>
      <div class="card">
        <h4 class="card-title">各割当のスコア内訳</h4>
        <table class="assignments-table">
          <thead><tr><th>生徒</th><th>講師</th><th>時間帯</th><th>教科</th><th>スコア</th><th>内訳</th><th></th></tr></thead>
          <tbody>${assignments.map((assignment) => `
            <tr>
              <td>${escapeHtml(studentName(assignment.studentId))}</td>
              <td>${escapeHtml(teacherName(assignment.teacherId))}</td>
              <td>${escapeHtml(slotLabel(assignment.timeSlotId))}</td>
              <td>${escapeHtml(subjectName(assignment.subjectId))}</td>
              <td>${assignment.score}</td>
              <td>${(assignment.scoreBreakdownJson || []).map((item) => `${escapeHtml(item.label)}: ${item.value}`).join("<br>")}</td>
              <td>
                <label class="checkbox-item"><input type="checkbox" data-action="toggle-lock" data-id="${assignment.id}" ${assignment.isLocked ? "checked" : ""} /><span>固定</span></label>
                <button class="ghost-btn" type="button" data-action="move-assignment" data-id="${assignment.id}" data-solution-id="${solution.id}">移動</button>
                <button class="ghost-btn" type="button" data-action="change-teacher" data-id="${assignment.id}" data-solution-id="${solution.id}">講師変更</button>
              </td>
            </tr>
          `).join("")}</tbody>
        </table>
      </div>
    </div>
  `;
}

function renderAssignmentMatrix(assignments) {
  const grouped = {};
  assignments.forEach((item) => {
    grouped[item.timeSlotId] = grouped[item.timeSlotId] || [];
    grouped[item.timeSlotId].push(item);
  });
  return `
    <table class="matrix-table">
      <thead><tr><th>時間帯</th>${weekdays.map((day) => `<th>${day}</th>`).join("")}</tr></thead>
      <tbody>${timeRows().map((row) => `
        <tr>
          <td>${escapeHtml(row.label)}</td>
          ${weekdays.map((day, index) => {
            const slot = activeSlots().find((item) => item.dayOfWeek === index + 1 && slotKey(item) === row.key);
            if (!slot) return "<td></td>";
            const items = grouped[slot.id] || [];
            return `<td>${items.map((item) => `${escapeHtml(teacherName(item.teacherId))}: ${escapeHtml(studentName(item.studentId))}`).join("<br>")}</td>`;
          }).join("")}
        </tr>
      `).join("")}</tbody>
    </table>
  `;
}

function bindPageEvents() {
  document.querySelectorAll("[data-select-teacher]").forEach((button) => button.addEventListener("click", () => { ui.selectedTeacherId = button.dataset.selectTeacher; render(); }));
  document.querySelectorAll("[data-select-student]").forEach((button) => button.addEventListener("click", () => { ui.selectedStudentId = button.dataset.selectStudent; render(); }));
  document.querySelectorAll("[data-select-solution]").forEach((button) => button.addEventListener("click", () => { ui.selectedSolutionId = button.dataset.selectSolution; render(); }));
  document.getElementById("teacherForm")?.addEventListener("submit", saveTeacher);
  document.getElementById("studentForm")?.addEventListener("submit", saveStudent);
  document.querySelectorAll("[data-slot-toggle]").forEach((cell) => {
    cell.addEventListener("mousedown", (event) => {
      event.preventDefault();
      ui.dragValue = !cell.classList.contains("on");
      ui.dragActive = true;
      setAvailability(cell.dataset.entityType, cell.dataset.ownerId, cell.dataset.slotToggle, ui.dragValue);
      render();
    });
    cell.addEventListener("mouseenter", () => {
      if (!ui.dragActive || (window.event && window.event.buttons !== 1)) return;
      setAvailability(cell.dataset.entityType, cell.dataset.ownerId, cell.dataset.slotToggle, ui.dragValue);
      render();
    });
  });
  document.onmouseup = () => {
    ui.dragActive = false;
    ui.dragValue = null;
  };
  bindActions();
  document.getElementById("templateSelect")?.addEventListener("change", (event) => {
    ui.selectedTemplateId = event.target.value;
    render();
  });
  document.getElementById("runSelect")?.addEventListener("change", (event) => {
    ui.selectedRunId = event.target.value;
    ui.selectedSolutionId = db.scheduleSolutions.find((item) => item.scheduleRunId === ui.selectedRunId)?.id || null;
    render();
  });
  document.querySelectorAll("[data-copy-source]").forEach((select) => select.addEventListener("change", () => {
    if (!select.value) return;
    copyAvailabilityFromPeer(select.dataset.copySource, select.dataset.ownerId, select.value);
    select.value = "";
    render();
  }));
}

function bindActions() {
  document.querySelectorAll("[data-action]").forEach((control) => control.addEventListener("click", () => handleAction(control.dataset.action, control.dataset)));
}

function handleAction(action, payload) {
  if (action === "add-teacher") return addTeacher();
  if (action === "delete-teacher") return removeTeacher(payload.id);
  if (action === "add-student") return addStudent();
  if (action === "delete-student") return removeStudent(payload.id);
  if (action === "add-template") return addTemplate();
  if (action === "rename-template") return renameTemplate(payload.id);
  if (action === "add-slot") return openSlotModal();
  if (action === "edit-slot") return openSlotModal(payload.id);
  if (action === "delete-slot") return deleteSlot(payload.id);
  if (action === "add-subject") return openSubjectModal();
  if (action === "edit-subject") return openSubjectModal(payload.id);
  if (action === "delete-subject") return deleteSubject(payload.id);
  if (action === "availability-bulk") return applyAvailabilityPreset(payload.entityType, payload.ownerId, payload.mode);
  if (action === "toggle-day") return toggleAvailabilityDay(payload.entityType, payload.ownerId, Number(payload.day));
  if (action === "toggle-time-row") return toggleAvailabilityTimeRow(payload.entityType, payload.ownerId, payload.key);
  if (action === "copy-self") return copyLastAvailability(payload.entityType, payload.ownerId);
  if (action === "add-current-assignment") return addCurrentAssignment(payload.teacherId);
  if (action === "delete-current-assignment") return deleteCurrentAssignment(payload.id);
  if (action === "generate-schedule") return runScheduleGeneration();
  if (action === "open-solution") {
    ui.tab = "results";
    ui.selectedSolutionId = payload.id;
    ui.selectedRunId = db.scheduleSolutions.find((item) => item.id === payload.id)?.scheduleRunId || ui.selectedRunId;
    return render();
  }
  if (action === "toggle-lock") return toggleAssignmentLock(payload.id);
  if (action === "confirm-solution") return confirmSolution(payload.id);
  if (action === "regenerate-with-locks") return runScheduleGeneration(true);
  if (action === "move-assignment") return openMoveAssignmentModal(payload.id, payload.solutionId);
  if (action === "change-teacher") return openChangeTeacherModal(payload.id, payload.solutionId);
  if (action === "export-db") return openTextExportModal();
  if (action === "import-db") return openTextImportModal();
}

function addTeacher() {
  const teacher = createEmptyTeacher();
  db.teachers.unshift(teacher);
  ui.selectedTeacherId = teacher.id;
  persist();
  render();
}

function addStudent() {
  const student = createEmptyStudent();
  db.students.unshift(student);
  ui.selectedStudentId = student.id;
  persist();
  render();
}

function createEmptyTeacher() {
  return { id: uid("teacher"), name: "", gender: "any", memo: "", extraJson: {}, createdAt: now(), updatedAt: now() };
}

function createEmptyStudent() {
  return { id: uid("student"), name: "", supportLevel: 3, memo: "", extraJson: {}, createdAt: now(), updatedAt: now() };
}

function saveTeacher(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const teacher = db.teachers.find((item) => item.id === form.get("id"));
  if (!teacher) return;
  teacher.name = String(form.get("name") || "").trim();
  teacher.gender = String(form.get("gender") || "any");
  teacher.memo = String(form.get("memo") || "");
  teacher.extraJson = safeJson(form.get("extraJson"));
  teacher.updatedAt = now();
  db.teacherSubjects = db.teacherSubjects.filter((item) => item.teacherId !== teacher.id);
  event.currentTarget.querySelectorAll('input[name="teacher-subject"]:checked').forEach((input) => {
    db.teacherSubjects.push({ id: uid("teacher-subject"), teacherId: teacher.id, subjectId: input.value });
  });
  persist();
  render();
}

function saveStudent(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const student = db.students.find((item) => item.id === form.get("id"));
  if (!student) return;
  student.name = String(form.get("name") || "").trim();
  student.supportLevel = Number(form.get("supportLevel") || 3);
  student.memo = String(form.get("memo") || "");
  student.extraJson = safeJson(form.get("extraJson"));
  student.updatedAt = now();
  const preferredTeacherIds = [];
  const blockedTeacherIds = [];
  const preferredGenders = [];
  db.studentSubjectRequests = db.studentSubjectRequests.filter((item) => item.studentId !== student.id);
  const selectedSubjectIds = [];
  event.currentTarget.querySelectorAll('input[name="student-subject"]:checked').forEach((input, index) => {
    selectedSubjectIds.push(input.value);
    db.studentSubjectRequests.push({ id: uid("student-subject"), studentId: student.id, subjectId: input.value, priority: index + 1 });
  });
  db.studentGenderPreferences = db.studentGenderPreferences.filter((item) => item.studentId !== student.id);
  event.currentTarget.querySelectorAll('input[name="student-gender"]:checked').forEach((input, index) => {
    preferredGenders.push(input.value);
    db.studentGenderPreferences.push({ id: uid("student-gender"), studentId: student.id, gender: input.value, priority: index + 1 });
  });
  db.studentTeacherPreferences = db.studentTeacherPreferences.filter((item) => item.studentId !== student.id);
  event.currentTarget.querySelectorAll('input[name="student-pref-preferred"]:checked').forEach((input) => {
    preferredTeacherIds.push(input.value);
    db.studentTeacherPreferences.push({ id: uid("student-pref"), studentId: student.id, teacherId: input.value, preferenceType: "preferred" });
  });
  event.currentTarget.querySelectorAll('input[name="student-pref-blocked"]:checked').forEach((input) => {
    blockedTeacherIds.push(input.value);
    db.studentTeacherPreferences.push({ id: uid("student-pref"), studentId: student.id, teacherId: input.value, preferenceType: "blocked" });
  });
  syncLessonRequestsForStudent(student.id, selectedSubjectIds, form, preferredTeacherIds, blockedTeacherIds, preferredGenders[0] || null);
  persist();
  render();
}

function removeTeacher(id) {
  if (!window.confirm("この講師を削除します。")) return;
  db.teachers = db.teachers.filter((item) => item.id !== id);
  db.teacherSubjects = db.teacherSubjects.filter((item) => item.teacherId !== id);
  db.teacherAvailabilitySlots = db.teacherAvailabilitySlots.filter((item) => item.teacherId !== id);
  db.currentLessonAssignments = db.currentLessonAssignments.filter((item) => item.teacherId !== id);
  db.studentTeacherPreferences = db.studentTeacherPreferences.filter((item) => item.teacherId !== id);
  persist();
  render();
}

function removeStudent(id) {
  if (!window.confirm("この生徒を削除します。")) return;
  db.students = db.students.filter((item) => item.id !== id);
  db.studentAvailabilitySlots = db.studentAvailabilitySlots.filter((item) => item.studentId !== id);
  db.studentSubjectRequests = db.studentSubjectRequests.filter((item) => item.studentId !== id);
  db.lessonRequests = db.lessonRequests.filter((item) => item.studentId !== id);
  db.confirmedAssignments = db.confirmedAssignments.filter((item) => item.studentId !== id);
  db.studentTeacherPreferences = db.studentTeacherPreferences.filter((item) => item.studentId !== id);
  db.studentGenderPreferences = db.studentGenderPreferences.filter((item) => item.studentId !== id);
  db.currentLessonAssignments = db.currentLessonAssignments.filter((item) => item.studentId !== id);
  persist();
  render();
}

function getAvailability(entityType, entityId) {
  return entityType === "teacher"
    ? db.teacherAvailabilitySlots.filter((item) => item.teacherId === entityId)
    : db.studentAvailabilitySlots.filter((item) => item.studentId === entityId);
}

function setAvailability(entityType, entityId, timeSlotId, enabled) {
  const collectionName = entityType === "teacher" ? "teacherAvailabilitySlots" : "studentAvailabilitySlots";
  const ownerKey = entityType === "teacher" ? "teacherId" : "studentId";
  const existing = db[collectionName].find((item) => item[ownerKey] === entityId && item.timeSlotId === timeSlotId);
  if (enabled && !existing) db[collectionName].push({ id: uid("availability"), [ownerKey]: entityId, timeSlotId, availabilityLevel: "available" });
  if (!enabled && existing) db[collectionName] = db[collectionName].filter((item) => item.id !== existing.id);
  persist();
}

function toggleAvailabilityDay(entityType, entityId, day) {
  const slots = activeSlots().filter((item) => item.dayOfWeek === day);
  const selected = new Set(getAvailability(entityType, entityId).map((item) => item.timeSlotId));
  const next = slots.some((item) => !selected.has(item.id));
  slots.forEach((slot) => setAvailability(entityType, entityId, slot.id, next));
  render();
}

function toggleAvailabilityTimeRow(entityType, entityId, key) {
  const slots = activeSlots().filter((item) => slotKey(item) === key);
  const selected = new Set(getAvailability(entityType, entityId).map((item) => item.timeSlotId));
  const next = slots.some((item) => !selected.has(item.id));
  slots.forEach((slot) => setAvailability(entityType, entityId, slot.id, next));
  render();
}

function applyAvailabilityPreset(entityType, entityId, mode) {
  const slots = activeSlots().filter((slot) => {
    if (mode === "weekday-night") return slot.dayOfWeek <= 5 && slot.startTime >= "17:00";
    if (mode === "weekend") return slot.dayOfWeek >= 6;
    return false;
  });
  slots.forEach((slot) => setAvailability(entityType, entityId, slot.id, true));
  render();
}

function copyLastAvailability(entityType, entityId) {
  const peers = entityType === "teacher" ? db.teachers : db.students;
  const currentIndex = peers.findIndex((item) => item.id === entityId);
  if (currentIndex <= 0) return;
  copyAvailabilityFromPeer(entityType, entityId, peers[currentIndex - 1].id);
}

function copyAvailabilityFromPeer(entityType, ownerId, sourceId) {
  const collectionName = entityType === "teacher" ? "teacherAvailabilitySlots" : "studentAvailabilitySlots";
  const ownerKey = entityType === "teacher" ? "teacherId" : "studentId";
  const source = db[collectionName].filter((item) => item[ownerKey] === sourceId);
  db[collectionName] = db[collectionName].filter((item) => item[ownerKey] !== ownerId);
  source.forEach((item) => db[collectionName].push({ id: uid("availability-copy"), [ownerKey]: ownerId, timeSlotId: item.timeSlotId, availabilityLevel: item.availabilityLevel }));
  persist();
}

function addCurrentAssignment(teacherId) {
  const studentId = document.getElementById("currentAssignmentStudent").value;
  const timeSlotId = document.getElementById("currentAssignmentSlot").value;
  const subjectId = document.getElementById("currentAssignmentSubject").value;
  if (!studentId || !timeSlotId || !subjectId) return;
  db.currentLessonAssignments.push({ id: uid("current"), teacherId, studentId, subjectId, timeSlotId, status: "active", effectiveFrom: now(), effectiveTo: null });
  persist();
  render();
}

function deleteCurrentAssignment(id) {
  db.currentLessonAssignments = db.currentLessonAssignments.filter((item) => item.id !== id);
  persist();
  render();
}

function addTemplate() {
  const name = window.prompt("テンプレート名");
  if (!name) return;
  const template = { id: uid("template"), name, isActive: true, createdAt: now(), updatedAt: now() };
  db.timetableTemplates.push(template);
  ui.selectedTemplateId = template.id;
  persist();
  render();
}

function renameTemplate(id) {
  const template = db.timetableTemplates.find((item) => item.id === id);
  if (!template) return;
  const name = window.prompt("新しい名前", template.name);
  if (!name) return;
  template.name = name;
  template.updatedAt = now();
  persist();
  render();
}

function openSlotModal(id) {
  const slot = db.timeSlots.find((item) => item.id === id) || { id: uid("slot"), timetableTemplateId: ui.selectedTemplateId, dayOfWeek: 1, startTime: "17:00", endTime: "18:30", label: "", sortOrder: timeSlotsForTemplate(ui.selectedTemplateId).length + 1, isActive: true };
  openModal(id ? "スロット編集" : "スロット追加", `
    <form id="slotForm" class="stack">
      <input type="hidden" name="id" value="${slot.id}" />
      <div class="form-grid two">
        <label class="field"><span>曜日</span><select name="dayOfWeek">${weekdays.map((day, index) => `<option value="${index + 1}" ${slot.dayOfWeek === index + 1 ? "selected" : ""}>${day}</option>`).join("")}</select></label>
        <label class="field"><span>表示順</span><input type="number" name="sortOrder" value="${slot.sortOrder}" /></label>
        <label class="field"><span>開始時刻</span><input type="time" name="startTime" value="${slot.startTime}" /></label>
        <label class="field"><span>終了時刻</span><input type="time" name="endTime" value="${slot.endTime}" /></label>
      </div>
      <label class="field"><span>表示ラベル</span><input name="label" value="${escapeAttr(slot.label)}" /></label>
      <label class="checkbox-item"><input type="checkbox" name="isActive" ${slot.isActive ? "checked" : ""} /><span>有効</span></label>
      <button class="primary-btn" type="submit">保存</button>
    </form>
  `, () => {
    document.getElementById("slotForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const existing = db.timeSlots.find((item) => item.id === form.get("id"));
      const day = Number(form.get("dayOfWeek"));
      const startTime = String(form.get("startTime"));
      const endTime = String(form.get("endTime"));
      const payload = {
        id: String(form.get("id")),
        timetableTemplateId: ui.selectedTemplateId,
        dayOfWeek: day,
        startTime,
        endTime,
        label: String(form.get("label") || "").trim() || `${weekdays[day - 1]} ${startTime}-${endTime}`,
        sortOrder: Number(form.get("sortOrder") || 1),
        isActive: form.get("isActive") === "on"
      };
      if (existing) Object.assign(existing, payload);
      else db.timeSlots.push(payload);
      closeModal();
      persist();
      render();
    });
  });
}

function deleteSlot(id) {
  if (!window.confirm("このスロットを削除します。")) return;
  db.timeSlots = db.timeSlots.filter((item) => item.id !== id);
  db.teacherAvailabilitySlots = db.teacherAvailabilitySlots.filter((item) => item.timeSlotId !== id);
  db.studentAvailabilitySlots = db.studentAvailabilitySlots.filter((item) => item.timeSlotId !== id);
  db.currentLessonAssignments = db.currentLessonAssignments.filter((item) => item.timeSlotId !== id);
  persist();
  render();
}

function openSubjectModal(id) {
  const subject = db.subjects.find((item) => item.id === id) || { id: uid("subject"), name: "", sortOrder: db.subjects.length + 1, isActive: true };
  openModal(id ? "科目編集" : "科目追加", `
    <form id="subjectForm" class="stack">
      <input type="hidden" name="id" value="${subject.id}" />
      <label class="field"><span>科目名</span><input name="name" value="${escapeAttr(subject.name)}" required /></label>
      <label class="field"><span>表示順</span><input type="number" name="sortOrder" value="${subject.sortOrder}" /></label>
      <label class="checkbox-item"><input type="checkbox" name="isActive" ${subject.isActive ? "checked" : ""} /><span>有効</span></label>
      <button class="primary-btn" type="submit">保存</button>
    </form>
  `, () => {
    document.getElementById("subjectForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const existing = db.subjects.find((item) => item.id === form.get("id"));
      const payload = { id: String(form.get("id")), name: String(form.get("name") || "").trim(), sortOrder: Number(form.get("sortOrder") || 1), isActive: form.get("isActive") === "on" };
      if (existing) Object.assign(existing, payload);
      else db.subjects.push(payload);
      closeModal();
      persist();
      render();
    });
  });
}

function deleteSubject(id) {
  if (!window.confirm("この科目を削除します。")) return;
  db.subjects = db.subjects.filter((item) => item.id !== id);
  db.teacherSubjects = db.teacherSubjects.filter((item) => item.subjectId !== id);
  db.studentSubjectRequests = db.studentSubjectRequests.filter((item) => item.subjectId !== id);
  db.currentLessonAssignments = db.currentLessonAssignments.filter((item) => item.subjectId !== id);
  persist();
  render();
}

function runScheduleGeneration(forcePreserveLocks = false) {
  const result = generateScheduleSolutions(db, {
    candidateCount: Number(document.getElementById("candidateCount")?.value || 5),
    preserveLocks: forcePreserveLocks || Boolean(document.getElementById("respectLocked")?.checked),
    lockedAssignments: db.scheduleAssignments.filter((item) => item.isLocked),
    templateId: ui.selectedTemplateId
  });
  db.scheduleRuns.unshift(result.run);
  db.scheduleSolutions = db.scheduleSolutions.filter((item) => item.scheduleRunId !== result.run.id).concat(result.solutions);
  const newSolutionIds = new Set(result.solutions.map((item) => item.id));
  db.scheduleAssignments = db.scheduleAssignments
    .filter((item) => !newSolutionIds.has(item.scheduleSolutionId))
    .concat(result.assignments);
  ui.selectedRunId = result.run.id;
  ui.selectedSolutionId = result.solutions[0]?.id || null;
  persist();
  ui.tab = "results";
  render();
}

function scheduleAssignmentsForSolution(solutionId) {
  return db.scheduleAssignments.filter((item) => item.scheduleSolutionId === solutionId);
}

function toggleAssignmentLock(id) {
  const assignment = db.scheduleAssignments.find((item) => item.id === id);
  if (!assignment) return;
  assignment.isLocked = !assignment.isLocked;
  persist();
  render();
}

function confirmSolution(solutionId) {
  db.confirmedSolutionId = solutionId;
  const toConfirm = createConfirmedAssignmentsFromSolution(db, solutionId);
  const lessonRequestIds = new Set(toConfirm.map((item) => item.lessonRequestId).filter(Boolean));
  db.confirmedAssignments = db.confirmedAssignments.map((item) =>
    lessonRequestIds.has(item.lessonRequestId) && item.status === "confirmed"
      ? { ...item, status: "cancelled" }
      : item
  );
  db.confirmedAssignments.push(...toConfirm);
  persist();
  render();
}

function openMoveAssignmentModal(assignmentId, solutionId) {
  const assignment = db.scheduleAssignments.find((item) => item.id === assignmentId);
  if (!assignment) return;
  const solutionAssignments = scheduleAssignmentsForSolution(solutionId).filter((item) => item.id !== assignmentId);
  const options = activeSlots().filter((slot) => slot.id !== assignment.timeSlotId).filter((slot) => {
    if (!db.teacherAvailabilitySlots.some((item) => item.teacherId === assignment.teacherId && item.timeSlotId === slot.id)) return false;
    if (!db.studentAvailabilitySlots.some((item) => item.studentId === assignment.studentId && item.timeSlotId === slot.id)) return false;
    if (solutionAssignments.filter((item) => item.teacherId === assignment.teacherId && item.timeSlotId === slot.id).length >= 3) return false;
    if (solutionAssignments.some((item) => item.studentId === assignment.studentId && item.timeSlotId === slot.id)) return false;
    return true;
  });
  if (!options.length) return window.alert("移動可能な別枠がありません。");
  openModal("生徒を別枠に移動", `
    <form id="moveAssignmentForm" class="stack">
      <input type="hidden" name="assignmentId" value="${assignment.id}" />
      <label class="field"><span>移動先時間帯</span><select name="timeSlotId">${options.map((slot) => `<option value="${slot.id}">${escapeHtml(slot.label)}</option>`).join("")}</select></label>
      <button class="primary-btn" type="submit">反映</button>
    </form>
  `, () => {
    document.getElementById("moveAssignmentForm").addEventListener("submit", (event) => {
      event.preventDefault();
      assignment.timeSlotId = String(new FormData(event.currentTarget).get("timeSlotId"));
      assignment.isLocked = true;
      persist();
      closeModal();
      ui.selectedSolutionId = solutionId;
      render();
    });
  });
}

function openChangeTeacherModal(assignmentId, solutionId) {
  const assignment = db.scheduleAssignments.find((item) => item.id === assignmentId);
  if (!assignment) return;
  const blocked = db.studentTeacherPreferences.filter((item) => item.studentId === assignment.studentId && item.preferenceType === "blocked").map((item) => item.teacherId);
  const solutionAssignments = scheduleAssignmentsForSolution(solutionId).filter((item) => item.id !== assignmentId);
  const options = db.teachers.filter((teacher) => teacher.id !== assignment.teacherId).filter((teacher) => !blocked.includes(teacher.id)).filter((teacher) => db.teacherSubjects.some((item) => item.teacherId === teacher.id && item.subjectId === assignment.subjectId)).filter((teacher) => db.teacherAvailabilitySlots.some((item) => item.teacherId === teacher.id && item.timeSlotId === assignment.timeSlotId)).filter((teacher) => solutionAssignments.filter((item) => item.teacherId === teacher.id && item.timeSlotId === assignment.timeSlotId).length < 3);
  if (!options.length) return window.alert("変更可能な講師候補がありません。");
  openModal("講師を変更", `
    <form id="changeTeacherForm" class="stack">
      <input type="hidden" name="assignmentId" value="${assignment.id}" />
      <label class="field"><span>変更先講師</span><select name="teacherId">${options.map((teacher) => `<option value="${teacher.id}">${escapeHtml(teacher.name)}</option>`).join("")}</select></label>
      <button class="primary-btn" type="submit">反映</button>
    </form>
  `, () => {
    document.getElementById("changeTeacherForm").addEventListener("submit", (event) => {
      event.preventDefault();
      assignment.teacherId = String(new FormData(event.currentTarget).get("teacherId"));
      assignment.isLocked = true;
      persist();
      closeModal();
      ui.selectedSolutionId = solutionId;
      render();
    });
  });
}

function openTextExportModal() {
  openModal("DBエクスポート", `<div class="stack"><textarea>${escapeHtml(exportDb())}</textarea></div>`);
}

function openTextImportModal() {
  openModal("DBインポート", `
    <form id="importDbForm" class="stack">
      <label class="field"><span>JSON</span><textarea name="json"></textarea></label>
      <button class="primary-btn" type="submit">取込</button>
    </form>
  `, () => {
    document.getElementById("importDbForm").addEventListener("submit", (event) => {
      event.preventDefault();
      try {
        db = importDb(new FormData(event.currentTarget).get("json"));
        closeModal();
        ensureSelections();
        render();
      } catch (_error) {
        window.alert("JSONの取込に失敗しました。");
      }
    });
  });
}

function seedSampleData() {
  if (db.teachers.length || db.students.length) {
    if (!window.confirm("現在のデータをサンプルデータで置き換えます。よろしいですか。")) return;
  }
  db = buildSampleDb();
  persist();
  ui.selectedTeacherId = db.teachers[0]?.id || null;
  ui.selectedStudentId = db.students[0]?.id || null;
  ui.selectedTemplateId = db.timetableTemplates[0]?.id || null;
  render();
}

function syncLessonRequestsForStudent(studentId, selectedSubjectIds, form, preferredTeacherIds, blockedTeacherIds, preferredGender) {
  const existing = db.lessonRequests.filter((item) => item.studentId === studentId);
  const nextRequests = [];
  selectedSubjectIds.forEach((subjectId, index) => {
    const current = existing.find((item) => item.subjectId === subjectId) || defaultLessonRequestDraft(studentId, subjectId);
    nextRequests.push({
      ...current,
      studentId,
      subjectId,
      lessonsPerWeek: Number(form.get(`lessonRequest-${subjectId}-lessonsPerWeek`) || 1),
      durationSlots: Number(form.get(`lessonRequest-${subjectId}-durationSlots`) || 1),
      priority: Number(form.get(`lessonRequest-${subjectId}-priority`) || index + 1 || 3),
      preferredTeacherIds: [...preferredTeacherIds],
      blockedTeacherIds: [...blockedTeacherIds],
      preferredGender,
      status: String(form.get(`lessonRequest-${subjectId}-status`) || "active"),
      memo: current.memo || ""
    });
  });
  db.lessonRequests = db.lessonRequests
    .filter((item) => item.studentId !== studentId)
    .concat(nextRequests);
}

function teacherSubjectIds(teacherId) {
  return db.teacherSubjects.filter((item) => item.teacherId === teacherId).map((item) => item.subjectId);
}

function teacherSubjectNames(teacherId) {
  return teacherSubjectIds(teacherId).map(subjectName);
}

function teacherHasSubject(teacherId, subjectId) {
  return db.teacherSubjects.some((item) => item.teacherId === teacherId && item.subjectId === subjectId);
}

function studentRequestedSubjects(studentId) {
  return db.studentSubjectRequests.filter((item) => item.studentId === studentId).sort((a, b) => a.priority - b.priority).map((item) => item.subjectId);
}

function lessonRequestsForStudent(studentId) {
  return db.lessonRequests.filter((item) => item.studentId === studentId);
}

function defaultLessonRequestDraft(studentId, subjectId) {
  return {
    id: uid("lesson-request"),
    studentId,
    subjectId,
    lessonsPerWeek: 1,
    durationSlots: 1,
    priority: 3,
    preferredTeacherIds: [],
    blockedTeacherIds: [],
    preferredGender: null,
    memo: "",
    status: "active"
  };
}

function studentRequestedSubjectNames(studentId) {
  return studentRequestedSubjects(studentId).map(subjectName);
}

function studentRequestsSubject(studentId, subjectId) {
  return db.studentSubjectRequests.some((item) => item.studentId === studentId && item.subjectId === subjectId);
}

function studentPrefersTeacher(studentId, teacherId, type) {
  return db.studentTeacherPreferences.some((item) => item.studentId === studentId && item.teacherId === teacherId && item.preferenceType === type);
}

function studentPrefersGender(studentId, gender) {
  return db.studentGenderPreferences.some((item) => item.studentId === studentId && item.gender === gender);
}

function timeSlotsForTemplate(templateId) {
  return db.timeSlots.filter((slot) => slot.timetableTemplateId === templateId).sort((a, b) => a.sortOrder - b.sortOrder || a.dayOfWeek - b.dayOfWeek);
}

function activeSlots() {
  return timeSlotsForTemplate(ui.selectedTemplateId).filter((slot) => slot.isActive);
}

function activeSubjects() {
  return [...db.subjects].filter((item) => item.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
}

function timeRows() {
  const rowMap = {};
  activeSlots().forEach((slot) => {
    const key = slotKey(slot);
    rowMap[key] = rowMap[key] || { key, label: `${slot.startTime}-${slot.endTime}`, sortOrder: slot.sortOrder };
  });
  return Object.values(rowMap).sort((a, b) => a.sortOrder - b.sortOrder);
}

function slotKey(slot) {
  return `${slot.startTime}-${slot.endTime}`;
}

function subjectName(id) {
  return db.subjects.find((item) => item.id === id)?.name || "未設定";
}

function lessonRequestById(id) {
  return db.lessonRequests.find((item) => item.id === id) || null;
}

function teacherName(id) {
  return db.teachers.find((item) => item.id === id)?.name || "未設定";
}

function studentName(id) {
  return db.students.find((item) => item.id === id)?.name || "未設定";
}

function slotLabel(id) {
  return db.timeSlots.find((item) => item.id === id)?.label || "未設定";
}

function genderLabel(value) {
  return genders.find((item) => item.value === value)?.label || "指定なし";
}

function checkboxChip(name, value, label, checked) {
  return `<label class="chip ${checked ? "active" : ""}"><input type="checkbox" name="${name}" value="${value}" ${checked ? "checked" : ""} /><span>${escapeHtml(label)}</span></label>`;
}

function genderOptions(value) {
  return genders.map((item) => `<option value="${item.value}" ${item.value === value ? "selected" : ""}>${item.label}</option>`).join("");
}

function safeJson(text) {
  const value = String(text || "").trim();
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch (_error) {
    return { invalidJson: value };
  }
}

function openModal(title, content, onReady) {
  closeModal();
  const fragment = document.getElementById("modalTemplate").content.cloneNode(true);
  fragment.querySelector(".modal-title").textContent = title;
  fragment.querySelector(".modal-content").innerHTML = content;
  const node = fragment.querySelector(".modal-backdrop");
  document.body.appendChild(node);
  node.querySelector(".modal-close").addEventListener("click", closeModal);
  node.addEventListener("click", (event) => {
    if (event.target === node) closeModal();
  });
  if (onReady) onReady();
}

function closeModal() {
  document.querySelector(".modal-backdrop")?.remove();
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleString("ja-JP");
}

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}
