import { genders, tabs, weekdays, now, uid } from "./src/constants.js";
import { buildSampleDb } from "./src/sampleData.js";
import { createConfirmedAssignmentsFromSolution, generateScheduleSolutions, summarizeTeachers } from "./src/scheduler.js";
import { cloneLessonRequestRecord, exportDb, importDb, loadDb, mergeDateAvailabilityRows, resetDb, saveDb } from "./src/storage.js";
import { generatorReadiness } from "./src/validation.js";

let db = loadDb();
let ui = {
  tab: "teachers",
  selectedTeacherId: db.teachers[0]?.id || null,
  selectedStudentId: db.students[0]?.id || null,
  activeDrawerType: null,
  activeDrawerEntityId: null,
  activeDrawerIsNew: false,
  hasUnsavedChanges: false,
  selectedTemplateId: db.timetableTemplates[0]?.id || null,
  selectedRunId: db.scheduleRuns[0]?.id || null,
  selectedSolutionId: db.scheduleSolutions[0]?.id || null,
  resultView: "students",
  dragActive: false,
  dragValue: null,
  teacherFilters: { search: "", subjectId: "", gender: "", dayOfWeek: "", missingOnly: false },
  studentFilters: { search: "", subjectId: "", supportLevel: "", requestState: "", missingAvailabilityOnly: false, noActiveRequestsOnly: false }
};
let modalState = null;

init();

function init() {
  bindShellActions();
  bindGlobalEvents();
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
  if (ui.activeDrawerType === "teacher" && !db.teachers.find((item) => item.id === ui.activeDrawerEntityId)) clearDrawerState();
  if (ui.activeDrawerType === "student" && !db.students.find((item) => item.id === ui.activeDrawerEntityId)) clearDrawerState();
  if (!db.scheduleRuns.find((item) => item.id === ui.selectedRunId)) ui.selectedRunId = db.scheduleRuns[0]?.id || null;
  if (!db.scheduleSolutions.find((item) => item.id === ui.selectedSolutionId)) ui.selectedSolutionId = db.scheduleSolutions[0]?.id || null;
}

function render() {
  ensureSelections();
  syncBodyScrollLock();
  renderSidebar();
  renderNav();
  renderPage();
}

function bindGlobalEvents() {
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !ui.activeDrawerType) return;
    event.preventDefault();
    requestCloseDrawer();
  });
}

function renderSidebar() {
  const steps = buildStepStatuses();
  const saveStatusNode = document.getElementById("saveStatus");
  saveStatusNode.innerHTML = db.lastSavedAt
    ? `<div class="stat-card compact"><span>最後に保存</span><strong class="mono">${formatDateTime(db.lastSavedAt)}</strong><div class="status-inline"><span class="status-dot success"></span><small>この端末に保存済み</small></div></div>`
    : `<div class="stat-card compact"><span>保存状況</span><strong>まだ保存されていません</strong><div class="status-inline"><span class="status-dot warning"></span><small>入力後に保存してください</small></div></div>`;
  const summaryNode = document.getElementById("summaryStats");
  const stepStats = [
    ["講師", db.teachers.length],
    ["生徒", db.students.length],
    ["授業希望", db.lessonRequests.filter((item) => item.status !== "inactive").length],
    ["授業枠", activeSlots().length],
    ["生成履歴", db.scheduleRuns.length]
  ];
  summaryNode.innerHTML = stepStats.map(([label, value]) => {
    const step = steps.find((item) => item.summaryKey === label);
    return `<div><dt>${label}</dt><dd>${value}</dd>${step ? `<small class="status-text ${step.tone}">${step.status}</small>` : ""}</div>`;
  }).join("");
}

function renderNav() {
  const container = document.getElementById("navTabs");
  const steps = buildStepStatuses();
  container.innerHTML = tabs.map((tab, index) => {
    const step = steps.find((item) => item.id === tab.id);
    return `
      <button class="nav-tab ${ui.tab === tab.id ? "active" : ""}" type="button" data-tab="${tab.id}">
        <span class="nav-step">STEP ${index + 1}</span>
        <strong>${tab.label}</strong>
        <small class="status-text ${step?.tone || "muted"}">${step?.status || ""}</small>
      </button>
    `;
  }).join("");
  container.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      ui.tab = button.dataset.tab;
      render();
    });
  });
}

function renderPage() {
  document.getElementById("pageTitle").textContent = tabs.find((tab) => tab.id === ui.tab)?.label || "";
  document.getElementById("pageLead").textContent = pageLeadForTab(ui.tab);
  const app = document.getElementById("app");
  if (ui.tab === "teachers") app.innerHTML = renderTeachersPage();
  if (ui.tab === "students") app.innerHTML = renderStudentsPage();
  if (ui.tab === "slots") app.innerHTML = renderSlotsPage();
  if (ui.tab === "generator") app.innerHTML = renderGeneratorPage();
  if (ui.tab === "results") app.innerHTML = renderResultsPage();
  bindPageEvents();
}

function renderTeachersPage() {
  const drawerTeacherId = ui.activeDrawerType === "teacher" ? ui.activeDrawerEntityId : null;
  const selected = db.teachers.find((item) => item.id === drawerTeacherId);
  const teachers = filteredTeachers();
  return `
    <div class="stack">
      <section class="panel">
        <div class="panel-header panel-header-inline">
          <div>
            <h3>講師</h3>
            <p class="section-copy">先生の担当教科と授業できる時間を登録します。</p>
          </div>
          <button class="secondary-btn" type="button" data-action="add-teacher">講師を追加</button>
        </div>
        <div class="panel-body">
          ${renderTeacherFilters()}
          <div class="entity-list roomy-list">
            ${db.teachers.length
              ? (teachers.length
                ? teachers.map(renderTeacherListItem).join("")
                : renderFilteredEmptyState("講師", "検索条件をゆるめるか、フィルタを解除してください。"))
              : renderActionEmptyState("講師がまだ登録されていません", "最初の講師を追加しましょう。", "講師を追加", "add-teacher")}
          </div>
        </div>
      </section>
      ${selected ? renderDrawer("teacher", selected.name?.trim() ? selected.name : "新しい講師", renderTeacherForm(selected), selected.id) : ""}
    </div>
  `;
}

function renderStudentsPage() {
  const drawerStudentId = ui.activeDrawerType === "student" ? ui.activeDrawerEntityId : null;
  const selected = db.students.find((item) => item.id === drawerStudentId);
  const students = filteredStudents();
  return `
    <div class="stack">
      <section class="panel">
        <div class="panel-header panel-header-inline">
          <div>
            <h3>生徒</h3>
            <p class="section-copy">生徒の授業希望と授業できる時間を登録します。</p>
          </div>
          <button class="secondary-btn" type="button" data-action="add-student">生徒を追加</button>
        </div>
        <div class="panel-body">
          ${renderStudentFilters()}
          <div class="entity-list roomy-list">
            ${db.students.length
              ? (students.length
                ? students.map(renderStudentListItem).join("")
                : renderFilteredEmptyState("生徒", "検索条件をゆるめるか、フィルタを解除してください。"))
              : renderActionEmptyState("生徒がまだ登録されていません", "最初の生徒を追加しましょう。", "生徒を追加", "add-student")}
          </div>
        </div>
      </section>
      ${selected ? renderDrawer("student", selected.name?.trim() ? selected.name : "新しい生徒", renderStudentForm(selected), selected.id) : ""}
    </div>
  `;
}

function renderTeacherFilters() {
  return `
    <div class="filter-toolbar">
      <label class="compact-field search-field"><input data-filter-target="teacher" data-filter-key="search" value="${escapeAttr(ui.teacherFilters.search)}" placeholder="講師名で検索" /></label>
    </div>
  `;
}

function renderStudentFilters() {
  return `
    <div class="filter-toolbar">
      <label class="compact-field search-field"><input data-filter-target="student" data-filter-key="search" value="${escapeAttr(ui.studentFilters.search)}" placeholder="生徒名で検索" /></label>
    </div>
  `;
}

function renderSlotsPage() {
  const bands = timeBands();
  return `
    <div class="stack">
      <section class="panel">
        <div class="panel-header panel-header-inline">
          <div>
            <h3>授業時間</h3>
            <p class="section-copy">設定した時間帯が毎日に適用される、時間帯マスタとして扱います。</p>
          </div>
          <div class="action-row">
            <button class="ghost-btn" type="button" data-action="export-db">バックアップ</button>
            <button class="ghost-btn" type="button" data-action="import-db">復元</button>
          </div>
        </div>
        <div class="panel-body stack">
          <div class="card flat-card">
            <div class="pill-row">
              ${bands.map((band) => `<span class="tag">${escapeHtml(band.startTime)}-${escapeHtml(band.endTime)}</span>`).join("") || `<span class="tag">未設定</span>`}
            </div>
          </div>
        </div>
      </section>
      <div class="layout-two wide-right">
        <section class="panel">
          <div class="panel-header panel-header-inline">
            <div>
              <h3>時間帯マスタ</h3>
              <p class="section-copy">時間帯を追加すると、同じ枠が毎日に適用されます。重なりは許可されます。</p>
            </div>
            <button class="secondary-btn" type="button" data-action="add-slot">時間帯を追加</button>
          </div>
          <div class="panel-body">
            ${bands.length ? `<table class="simple-table">
              <thead><tr><th>開始</th><th>終了</th><th>表示名</th><th>順番</th><th>状態</th><th></th></tr></thead>
              <tbody>${bands.map(renderTimeBandRow).join("")}</tbody>
            </table>` : renderActionEmptyState("授業時間がまだありません", "まずは時間帯を1つ追加しましょう。", "時間帯を追加", "add-slot")}
          </div>
        </section>
        <section class="panel compact-panel">
          <div class="panel-header panel-header-inline">
            <div>
              <h3>補足設定</h3>
              <p class="section-copy">教科は必要に応じて編集できます。</p>
            </div>
            <button class="secondary-btn" type="button" data-action="add-subject">教科を追加</button>
          </div>
          <div class="panel-body">
            <details class="details-card">
              <summary>教科を編集</summary>
              <table class="simple-table">
                <thead><tr><th>区分</th><th>教科名</th><th>順番</th><th>状態</th><th></th></tr></thead>
                <tbody>${db.subjects.map(renderSubjectRow).join("")}</tbody>
              </table>
            </details>
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
  const checklist = generatorChecklist();
  const canGenerate = checklist.every((item) => item.done) && issues.length === 0;
  const hints = [...new Set([...checklist.filter((item) => !item.done).map((item) => item.hint), ...issues.map(humanizeIssue)])];
  return `
    <div class="stack">
      <section class="summary-strip light-strip">
        <div class="summary-grid">
          <div class="kpi-card"><span>講師</span><strong>${db.teachers.length}</strong></div>
          <div class="kpi-card"><span>生徒</span><strong>${db.students.length}</strong></div>
          <div class="kpi-card"><span>授業希望</span><strong>${db.lessonRequests.filter((item) => item.status !== "inactive").length}</strong></div>
          <div class="kpi-card"><span>授業枠</span><strong>${activeSlots().length}</strong></div>
          <div class="kpi-card"><span>要確認</span><strong>${hints.length}</strong></div>
        </div>
      </section>
      <section class="panel">
        <div class="panel-header panel-header-inline">
          <div>
            <h3>準備チェック</h3>
            <p class="section-copy">足りない項目があるときは、次にやることをここで確認できます。</p>
          </div>
          <button class="primary-btn" type="button" data-action="generate-schedule" ${canGenerate ? "" : "disabled"}>日程案を作成</button>
        </div>
        <div class="panel-body">
          <div class="checklist">
            ${checklist.map((item) => `<div class="check-item ${item.done ? "done" : "todo"}"><span class="check-mark">${item.done ? "✓" : "!"}</span><div><strong>${item.label}</strong><div class="muted">${item.done ? item.success : item.hint}</div></div></div>`).join("")}
          </div>
          <div class="helper-text">講師の授業可能日: ${teacherDateAvailabilityDayCount()}日 / 生徒の授業可能日: ${studentDateAvailabilityDayCount()}日</div>
          ${hints.length ? `<div class="callout warn slim"><strong>次にやること</strong><div class="stack">${hints.map((issue) => `<div>${escapeHtml(issue)}</div>`).join("")}</div></div>` : `<div class="callout success slim"><strong>準備がそろいました</strong><div>日程案を作成して、候補を比べてみましょう。</div></div>`}
        </div>
      </section>
      <section class="panel">
        <div class="panel-header">
          <div>
            <h3>作成のしかた</h3>
            <p class="section-copy">候補数と、今の予定をどれだけ残すかを選べます。</p>
          </div>
        </div>
        <div class="panel-body">
          <div class="toolbar">
            <label class="field">
              <span>候補の数</span>
              <select id="candidateCount">
                <option value="3">3案</option>
                <option value="5" selected>5案</option>
                <option value="8">8案</option>
              </select>
            </label>
            <label class="checkbox-item">
              <input type="checkbox" id="respectLocked" checked />
              <span>今の予定をなるべく動かさない</span>
            </label>
          </div>
          ${canGenerate ? "" : `<div class="helper-text">準備チェックの未完了項目を先に整えると、ボタンが使えるようになります。</div>`}
        </div>
      </section>
      <section class="panel">
        <div class="panel-header"><div><h3>直近の作成結果</h3><p class="section-copy">最後に作った候補をここから見直せます。</p></div></div>
        <div class="panel-body">
          ${selectedRun ? `
            <div class="card-grid compact-grid">
              <div class="card flat-card">
                <div class="muted">作成日時</div>
                <div class="mono">${formatDateTime(selectedRun.createdAt)}</div>
                <div class="tag">${escapeHtml(selectedRun.status)}</div>
              </div>
              ${solutions.map((solution) => `
                <div class="lesson-request-card flat-card">
                  <header><div><h5>候補 ${solution.rank}</h5><p class="muted">スコア ${solution.totalScore}</p></div><button class="ghost-btn" type="button" data-action="open-solution" data-id="${solution.id}">結果を見る</button></header>
                  <div class="lesson-request-meta">
                    <span class="tag">割当 ${solution.assignedCount}</span>
                    <span class="tag">未割当 ${solution.unassignedCount}</span>
                  </div>
                </div>
              `).join("") || `<div class="callout warn">まだ候補はありません。</div>`}
            </div>
          ` : renderActionEmptyState("まだ日程案が作成されていません", "準備が整ったら最初の候補を作成しましょう。", "日程案を作成", "generate-schedule")}
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
  if (!runs.length) {
    return `
      <div class="panel">
        <div class="panel-body">
          ${renderActionEmptyState("まだ日程案が作成されていません", "先に日程案を作成してください。", "日程案を作成へ", "go-generator")}
        </div>
      </div>
    `;
  }
  return `
    <div class="split">
      <section class="panel">
        <div class="panel-header panel-header-inline">
          <div>
            <h3>作成結果</h3>
            <p class="section-copy">候補を見比べて、よさそうな案を選びましょう。</p>
          </div>
          ${selectedSolution ? `
            <div class="action-row">
              <button class="secondary-btn" type="button" data-action="regenerate-with-locks" data-id="${selectedSolution.id}">今の予定をなるべく動かさず再作成</button>
              <button class="primary-btn" type="button" data-action="confirm-solution" data-id="${selectedSolution.id}">この案で確定</button>
            </div>
          ` : ""}
        </div>
        <div class="panel-body">${selectedSolution ? renderSolutionDetail(selectedSolution) : renderActionEmptyState("候補がまだありません", "別の作成履歴を選ぶか、新しく日程案を作成してください。", "日程案を作成へ", "go-generator")}</div>
      </section>
      <section class="panel">
        <div class="panel-header"><div><h3>候補を切り替える</h3><p class="section-copy">作成日時ごとに候補案を確認できます。</p></div></div>
        <div class="panel-body">
          <div class="field">
            <label for="runSelect">作成日時</label>
            <select id="runSelect">
              ${runs.map((run) => `<option value="${run.id}" ${run.id === ui.selectedRunId ? "selected" : ""}>${formatDateTime(run.createdAt)} / ${escapeHtml(run.status)}</option>`).join("")}
            </select>
          </div>
          <div class="list">
            ${solutions.length ? solutions.map(renderSolutionListItem).join("") : `<div class="callout">この作成履歴には候補がありません。</div>`}
          </div>
        </div>
      </section>
    </div>
  `;
}

function renderTeacherListItem(teacher) {
  const subjectNames = teacherSubjectNames(teacher.id);
  return `
    <button class="entity-item ${teacher.id === ui.selectedTeacherId ? "active" : ""}" type="button" data-select-teacher="${teacher.id}">
      <div class="entity-title-row">
        <h4>${escapeHtml(teacher.name)}</h4>
        ${teacherHasMissingFields(teacher) ? `<span class="tag subtle-danger">未入力あり</span>` : ""}
      </div>
      <div class="entity-meta">
        <span class="tag">${genderLabel(teacher.gender)}</span>
        <span class="tag">${subjectNames.join(" / ") || "教科未設定"}</span>
      </div>
    </button>
  `;
}

function renderStudentListItem(student) {
  const totalLessons = lessonRequestsForStudent(student.id)
    .filter((item) => item.status !== "inactive")
    .reduce((sum, item) => sum + Number(item.lessonsPerWeek || 0), 0);
  const hasMissing = !String(student.name || "").trim();
  return `
    <button class="entity-item ${student.id === ui.selectedStudentId ? "active" : ""}" type="button" data-select-student="${student.id}">
      <div class="entity-title-row">
        <h4>${escapeHtml(student.name)}</h4>
        ${hasMissing ? `<span class="tag subtle-danger">未入力あり</span>` : ""}
      </div>
      <div class="entity-meta">
        <span class="tag">授業希望 ${totalLessons}回</span>
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
        <label class="field"><span>名前</span><input name="name" value="${escapeAttr(current.name)}" placeholder="例: 佐藤先生" required /></label>
        <label class="field"><span>性別</span><select name="gender">${genderOptions(current.gender)}</select></label>
      </div>
      <div class="card">
        <h4 class="card-title">担当可能教科</h4>
        ${renderSubjectCheckboxGroups("teacher-subject", teacherSubjectIds(current.id))}
      </div>
      <details class="card details-card">
        <summary>現在担当している生徒</summary>
        ${renderCurrentAssignmentsEditor(current.id)}
      </details>
      <div class="card">
        <div class="calendar-entry">
          <div>
            <h4 class="card-title">授業できる時間</h4>
            <p class="section-copy">日付ごとの授業可能時間はカレンダーで登録できます。曜日ごとの時間は詳細設定に残しています。</p>
            <div class="pill-row">
              <span class="tag">${teacherDateAvailabilitySummary(current.id)}</span>
            </div>
          </div>
          <button class="secondary-btn" type="button" data-action="open-date-availability" data-entity-type="teacher" data-owner-id="${current.id}">授業できる時間を設定</button>
        </div>
      </div>
      <details class="card details-card">
        <summary>現在の自動作成で使う曜日ごとの時間</summary>
        <p class="section-copy">日付ベースの作成は次のフェーズで対応予定です。今の自動作成では、こちらの曜日ごとの時間を使います。</p>
        ${renderAvailabilityEditor("teacher", current.id)}
      </details>
      <div class="card">
        <h4 class="card-title">メモ</h4>
        <label class="field"><span>メモ</span><textarea name="memo">${escapeHtml(current.memo || "")}</textarea></label>
      </div>
      <div class="action-row drawer-form-actions">
        <button class="ghost-btn" type="button" data-action="close-teacher-drawer">キャンセル</button>
        <button class="primary-btn" type="submit">保存</button>
      </div>
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
        <label class="field"><span>名前</span><input name="name" value="${escapeAttr(current.name)}" placeholder="例: 山田花子" required /></label>
        <label class="field">
          <span>サポート度</span>
          <select name="supportLevel">${[1, 2, 3, 4, 5].map((value) => `<option value="${value}" ${Number(current.supportLevel || 3) === value ? "selected" : ""}>${value}</option>`).join("")}</select>
          <small class="helper-text">1: 自立 / 2: やや自立 / 3: 標準 / 4: 手厚め / 5: とても手厚め</small>
        </label>
      </div>
      <div class="card emphasis-card">
        <h4 class="card-title">1. 授業希望</h4>
        <p class="section-copy">授業希望がない生徒も保存できます。必要な生徒だけ追加してください。</p>
        ${renderLessonRequestCards(current.id, lessonRequests)}
      </div>
      <details class="card details-card">
        <summary>希望講師・NG講師・相性を設定</summary>
        <div class="form-grid two">
          <fieldset class="field"><legend>希望する講師の性別</legend><div class="checkbox-grid">${genders.filter((item) => item.value !== "any").map((item) => checkboxChip("student-gender", item.value, item.label, studentPrefersGender(current.id, item.value))).join("")}</div></fieldset>
          <fieldset class="field"><legend>希望講師</legend><div class="checkbox-grid">${db.teachers.map((teacher) => checkboxChip("student-pref-preferred", teacher.id, teacher.name, studentPrefersTeacher(current.id, teacher.id, "preferred"))).join("")}</div></fieldset>
        </div>
        <fieldset class="field"><legend>NG講師</legend><div class="checkbox-grid">${db.teachers.map((teacher) => checkboxChip("student-pref-blocked", teacher.id, teacher.name, studentPrefersTeacher(current.id, teacher.id, "blocked"))).join("")}</div></fieldset>
        <div class="card inset-card">
          <h4 class="card-title">講師との相性</h4>
          <div class="compatibility-grid">
            ${db.teachers.map((teacher) => `
              <label class="field compact-field">
                <span>${escapeHtml(teacher.name)}</span>
                <select name="teacher-compatibility" data-teacher-id="${teacher.id}">
                  ${compatibilityOptions(studentTeacherCompatibility(current.id, teacher.id))}
                </select>
              </label>
            `).join("")}
          </div>
          <small class="helper-text">1: 避けたい / 2: やや避けたい / 3: 普通 / 4: 合う / 5: とても合う</small>
        </div>
      </details>
      <div class="card">
        <div class="calendar-entry">
          <div>
            <h4 class="card-title">授業できる時間</h4>
            <p class="section-copy">通える日付と時間帯はカレンダーで登録できます。曜日ごとの時間は詳細設定に残しています。</p>
            <div class="pill-row">
              <span class="tag">${studentDateAvailabilitySummary(current.id)}</span>
            </div>
          </div>
          <button class="secondary-btn" type="button" data-action="open-date-availability" data-entity-type="student" data-owner-id="${current.id}">授業できる時間を設定</button>
        </div>
      </div>
      <details class="card details-card">
        <summary>現在の自動作成で使う曜日ごとの時間</summary>
        <p class="section-copy">今の自動作成では、こちらの曜日ごとの時間を使います。</p>
        ${renderAvailabilityEditor("student", current.id)}
      </details>
      <div class="card">
        <h4 class="card-title">メモ</h4>
        <label class="field"><span>メモ</span><textarea name="memo">${escapeHtml(current.memo || "")}</textarea></label>
      </div>
      <div class="action-row drawer-form-actions">
        <button class="ghost-btn" type="button" data-action="close-student-drawer">キャンセル</button>
        <button class="primary-btn" type="submit">保存</button>
      </div>
    </form>
  `;
}

function renderLessonRequestSettings(studentId, requests) {
  const subjectIds = studentRequestedSubjects(studentId);
  if (!subjectIds.length) return `<div class="callout warn">希望教科を選ぶと受講希望設定が表示されます。</div>`;
  return `
    <div class="lesson-request-grid">
      ${subjectIds.map((subjectId) => {
        const request = requests.find((item) => item.subjectId === subjectId) || defaultLessonRequestDraft(studentId, subjectId);
        return `
          <section class="lesson-request-card">
            <header>
              <div>
                <h5>${escapeHtml(subjectName(subjectId))}</h5>
                <p class="muted">${request.status === "inactive" ? "無効化中" : "生成対象"}</p>
              </div>
              <div class="lesson-request-actions">
                <span class="tag">追加</span>
                <span class="tag">編集</span>
                <span class="tag">複製</span>
                <span class="tag">${request.status === "inactive" ? "再有効化" : "無効化"}</span>
              </div>
            </header>
            <div class="lesson-request-meta">
              <span class="tag">希望講師 ${request.preferredTeacherIds?.length || 0}</span>
              <span class="tag">NG講師 ${request.blockedTeacherIds?.length || 0}</span>
              <span class="tag">${request.preferredGender || "性別指定なし"}</span>
            </div>
            <div class="lesson-request-fields">
              <label class="field"><span>週回数</span><input type="number" min="1" max="7" name="lessonRequest-${subjectId}-lessonsPerWeek" value="${request.lessonsPerWeek || 1}" /></label>
              <label class="field"><span>コマ数</span><input type="number" min="1" max="4" name="lessonRequest-${subjectId}-durationSlots" value="${request.durationSlots || 1}" /></label>
              <label class="field"><span>優先度</span><input type="number" min="1" max="5" name="lessonRequest-${subjectId}-priority" value="${request.priority || 3}" /></label>
              <label class="field"><span>状態</span><select name="lessonRequest-${subjectId}-status"><option value="active" ${request.status !== "inactive" ? "selected" : ""}>active</option><option value="inactive" ${request.status === "inactive" ? "selected" : ""}>inactive</option></select></label>
            </div>
          </section>
        `;
      }).join("")}
    </div>
  `;
}

function renderAvailabilityEditor(entityType, entityId) {
  const selectedIds = new Set(getAvailability(entityType, entityId).map((item) => item.timeSlotId));
  const peers = entityType === "teacher" ? db.teachers : db.students;
  const selectedDays = selectedWeekdays(selectedIds);
  return `
    <div class="availability-shell" data-availability-type="${entityType}" data-availability-owner="${entityId}">
      <div class="availability-toolbar">
        <div class="availability-summary">
          <span class="tag strong">選択中: ${selectedIds.size}枠${selectedDays.length ? `（${selectedDays.join("・")}）` : ""}</span>
          <small class="helper-text">クリックまたはドラッグで選択できます。</small>
        </div>
        <button class="secondary-btn" type="button" data-action="availability-bulk" data-mode="weekday-night" data-entity-type="${entityType}" data-owner-id="${entityId}">平日夜</button>
        <button class="secondary-btn" type="button" data-action="availability-bulk" data-mode="weekend" data-entity-type="${entityType}" data-owner-id="${entityId}">土日</button>
        <button class="ghost-btn" type="button" data-action="copy-self" data-entity-type="${entityType}" data-owner-id="${entityId}">前回入力からコピー</button>
        <select data-copy-source="${entityType}" data-owner-id="${entityId}">
          <option value="">${entityType === "teacher" ? "他の講師" : "他の生徒"}からコピー</option>
          ${peers.filter((item) => item.id !== entityId).map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join("")}
        </select>
      </div>
      ${selectedIds.size ? "" : `<div class="callout warn"><strong>まだ時間が入っていません</strong><div>通える候補を少し広めに選ぶと、日程案を作りやすくなります。</div></div>`}
      <div class="availability-grid-wrap">
        <table class="availability-grid">
          <thead>
            <tr>
              <th>時間帯</th>
              ${weekdays.map((day, index) => `<th><button class="ghost-btn day-toggle" type="button" data-action="toggle-day" data-day="${index + 1}" data-entity-type="${entityType}" data-owner-id="${entityId}">${day}</button></th>`).join("")}
            </tr>
          </thead>
          <tbody>${timeRows().map((row) => `
            <tr>
              <td><button class="ghost-btn time-toggle" type="button" data-action="toggle-time-row" data-key="${escapeAttr(row.key)}" data-entity-type="${entityType}" data-owner-id="${entityId}">${escapeHtml(row.label)}</button></td>
              ${weekdays.map((day, index) => {
                const slot = activeSlots().find((item) => item.dayOfWeek === index + 1 && slotKey(item) === row.key);
                if (!slot) return "<td class=\"slot-missing\"></td>";
                const on = selectedIds.has(slot.id);
                return `<td><div class="slot-cell ${on ? "on" : ""}" data-slot-toggle="${slot.id}" data-entity-type="${entityType}" data-owner-id="${entityId}">${on ? "✓" : ""}</div></td>`;
              }).join("")}
            </tr>
          `).join("")}</tbody>
        </table>
      </div>
    </div>
  `;
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
        <label class="field"><span>教科</span><select id="currentAssignmentSubject"><option value="">選択してください</option>${subjectSelectOptions("")}</select></label>
        <div class="field"><span>&nbsp;</span><button class="secondary-btn" type="button" data-action="add-current-assignment" data-teacher-id="${teacherId}">担当追加</button></div>
      </div>
    </div>
  `;
}

function renderSlotRow(slot) {
  return `
    <tr>
      <td>${weekdays[slot.dayOfWeek - 1]}</td><td>${escapeHtml(slot.startTime)}</td><td>${escapeHtml(slot.endTime)}</td><td>${escapeHtml(slot.label)}</td><td>${slot.sortOrder}</td><td>${slot.isActive ? "使用中" : "停止中"}</td>
      <td><button class="ghost-btn" type="button" data-action="edit-slot" data-id="${slot.id}">編集</button> <button class="danger-btn" type="button" data-action="delete-slot" data-id="${slot.id}">削除</button></td>
    </tr>
  `;
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
      <td>${subject.stage === "high" ? "高校" : "中学"}</td><td>${escapeHtml(subject.name)}</td><td>${subject.sortOrder}</td><td>${subject.isActive ? "有効" : "無効"}</td>
      <td><button class="ghost-btn" type="button" data-action="edit-subject" data-id="${subject.id}">編集</button> <button class="danger-btn" type="button" data-action="delete-subject" data-id="${subject.id}">削除</button></td>
    </tr>
  `;
}

function renderTimeBandRow(band) {
  return `
    <tr>
      <td>${escapeHtml(band.startTime)}</td>
      <td>${escapeHtml(band.endTime)}</td>
      <td>${escapeHtml(band.label)}</td>
      <td>${band.sortOrder}</td>
      <td>${band.isActive ? "有効" : "無効"}</td>
      <td><button class="ghost-btn" type="button" data-action="edit-slot" data-id="${escapeAttr(band.key)}">編集</button> <button class="danger-btn" type="button" data-action="delete-slot" data-id="${escapeAttr(band.key)}">削除</button></td>
    </tr>
  `;
}

function renderSolutionListItem(solution) {
  return `
    <button class="entity-item ${solution.id === ui.selectedSolutionId ? "active" : ""}" type="button" data-select-solution="${solution.id}">
      <h4>候補 ${solution.rank}</h4>
      <div class="entity-meta">
        <span class="tag">スコア ${solution.totalScore}</span>
        <span class="tag">割当 ${solution.assignedCount}</span>
        <span class="tag">未割当 ${solution.unassignedCount}</span>
        ${db.confirmedSolutionId === solution.id ? `<span class="tag">確定済み</span>` : ""}
      </div>
    </button>
  `;
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
  const studentCards = `
    <div class="lesson-request-grid">
      ${assignments.map((assignment) => `
        <article class="lesson-request-card">
          <header>
            <div>
              <h5>${escapeHtml(studentName(assignment.studentId))}</h5>
              <p class="muted">${escapeHtml(subjectName(assignment.subjectId))}</p>
            </div>
            <span class="tag">候補 ${assignment.score}</span>
          </header>
          <div class="lesson-request-meta">
            <span class="tag">${escapeHtml(teacherName(assignment.teacherId))}</span>
            <span class="tag">${escapeHtml(slotLabel(assignment.timeSlotId))}</span>
            ${assignment.isLocked ? `<span class="tag">固定</span>` : ""}
          </div>
          <div class="muted">${(assignment.scoreBreakdownJson || []).map((item) => `${item.label}: ${item.value}`).join(" / ")}</div>
        </article>
      `).join("")}
    </div>
  `;
  const teacherView = `<table class="simple-table"><thead><tr><th>講師</th><th>コマ数</th><th>担当人数</th><th>負担</th></tr></thead><tbody>${teacherSummary.map((item) => `<tr><td>${escapeHtml(item.teacherName)}</td><td>${item.slotCount}</td><td>${item.studentCount}</td><td>${item.load}</td></tr>`).join("")}</tbody></table>`;
  const timetableView = renderAssignmentMatrix(assignments);
  const activeView = ui.resultView === "teachers" ? teacherView : ui.resultView === "timetable" ? timetableView : studentCards;
  return `
    <div class="stack">
      <div class="summary-grid">
        <div class="kpi-card"><span>候補</span><strong>${solution.rank}</strong></div>
        <div class="kpi-card"><span>合計スコア</span><strong>${solution.totalScore}</strong></div>
        <div class="kpi-card"><span>割当人数</span><strong>${solution.assignedCount}</strong></div>
        <div class="kpi-card"><span>未割当</span><strong>${solution.unassignedCount}</strong></div>
        <div class="kpi-card"><span>確定状況</span><strong>${db.confirmedSolutionId === solution.id ? "確定済み" : "未確定"}</strong></div>
      </div>
      <div class="result-view-tabs">
        <button class="ghost-btn ${ui.resultView === "students" ? "active-tab" : ""}" type="button" data-action="set-result-view" data-view="students">生徒別</button>
        <button class="ghost-btn ${ui.resultView === "teachers" ? "active-tab" : ""}" type="button" data-action="set-result-view" data-view="teachers">講師別</button>
        <button class="ghost-btn ${ui.resultView === "timetable" ? "active-tab" : ""}" type="button" data-action="set-result-view" data-view="timetable">時間割</button>
      </div>
      <div class="result-columns">
        <div class="card flat-card">
          <h4 class="card-title">未調整の授業</h4>
          ${unassigned.length ? renderUnassignedCards(unassigned) : `<div class="callout success">未割当はありません。</div>`}
        </div>
        <div class="card flat-card">
          <h4 class="card-title">見えているバランス</h4>
          ${teacherView}
        </div>
      </div>
      <div class="card flat-card">
        <h4 class="card-title">割当の見え方</h4>
        ${activeView}
      </div>
      <div class="card flat-card">
        <h4 class="card-title">調整する</h4>
        <table class="assignments-table">
          <thead><tr><th>生徒</th><th>講師</th><th>時間</th><th>教科</th><th>スコア</th><th>理由</th><th></th></tr></thead>
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
                <button class="ghost-btn" type="button" data-action="move-assignment" data-id="${assignment.id}" data-solution-id="${solution.id}">別の時間へ</button>
                <button class="ghost-btn" type="button" data-action="change-teacher" data-id="${assignment.id}" data-solution-id="${solution.id}">講師を変更</button>
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
  document.querySelectorAll("[data-select-teacher]").forEach((button) => button.addEventListener("click", () => {
    openDrawer("teacher", button.dataset.selectTeacher, false);
  }));
  document.querySelectorAll("[data-select-student]").forEach((button) => button.addEventListener("click", () => {
    openDrawer("student", button.dataset.selectStudent, false);
  }));
  document.querySelectorAll("[data-select-solution]").forEach((button) => button.addEventListener("click", () => { ui.selectedSolutionId = button.dataset.selectSolution; render(); }));
  document.getElementById("teacherForm")?.addEventListener("submit", saveTeacher);
  document.getElementById("studentForm")?.addEventListener("submit", saveStudent);
  document.getElementById("teacherForm")?.addEventListener("input", markDrawerDirty);
  document.getElementById("teacherForm")?.addEventListener("change", markDrawerDirty);
  document.getElementById("studentForm")?.addEventListener("input", markDrawerDirty);
  document.getElementById("studentForm")?.addEventListener("change", markDrawerDirty);
  document.querySelectorAll("[data-filter-target]").forEach((control) => {
    const eventName = control.type === "text" || control.tagName === "INPUT" && control.type !== "checkbox" ? "input" : "change";
    control.addEventListener(eventName, () => updateFilter(control));
  });
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
  document.querySelectorAll("[data-drawer-close]").forEach((node) => node.addEventListener("click", (event) => {
    if (event.target !== node) return;
    requestCloseDrawer();
  }));
  document.querySelectorAll("[data-drawer-panel]").forEach((panel) => panel.addEventListener("click", (event) => event.stopPropagation()));
}

function bindActions() {
  document.querySelectorAll("[data-action]").forEach((control) => control.addEventListener("click", () => handleAction(control.dataset.action, control.dataset)));
}

function handleAction(action, payload) {
  if (action === "add-teacher") return addTeacher();
  if (action === "close-teacher-drawer") return requestCloseDrawer();
  if (action === "delete-teacher") return removeTeacher(payload.id);
  if (action === "add-student") return addStudent();
  if (action === "close-student-drawer") return requestCloseDrawer();
  if (action === "delete-student") return removeStudent(payload.id);
  if (action === "open-date-availability") return openDateAvailabilityModal(payload.entityType, payload.ownerId);
  if (action === "clear-teacher-filters") return clearTeacherFilters();
  if (action === "clear-student-filters") return clearStudentFilters();
  if (action === "go-generator") {
    ui.tab = "generator";
    return render();
  }
  if (action === "set-result-view") {
    ui.resultView = payload.view || "students";
    return render();
  }
  if (action === "add-lesson-request") return openLessonRequestModal(payload.studentId || ui.selectedStudentId);
  if (action === "edit-lesson-request") return openLessonRequestModal(null, payload.id);
  if (action === "duplicate-lesson-request") return duplicateLessonRequest(payload.id);
  if (action === "toggle-lesson-request") return toggleLessonRequest(payload.id);
  if (action === "delete-lesson-request") return deleteLessonRequest(payload.id);
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
  ui.activeDrawerType = "teacher";
  ui.activeDrawerEntityId = teacher.id;
  ui.activeDrawerIsNew = true;
  ui.hasUnsavedChanges = false;
  persist();
  render();
}

function addStudent() {
  const student = createEmptyStudent();
  db.students.unshift(student);
  ui.selectedStudentId = student.id;
  ui.activeDrawerType = "student";
  ui.activeDrawerEntityId = student.id;
  ui.activeDrawerIsNew = true;
  ui.hasUnsavedChanges = false;
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
  ui.hasUnsavedChanges = false;
  ui.activeDrawerIsNew = false;
  closeDrawer();
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
  const selectedSubjectIds = lessonRequestsForStudent(student.id).map((item) => item.subjectId);
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
  db.studentTeacherCompatibilities = db.studentTeacherCompatibilities.filter((item) => item.studentId !== student.id);
  event.currentTarget.querySelectorAll('select[name="teacher-compatibility"]').forEach((select) => {
    const teacherId = select.dataset.teacherId;
    if (!teacherId) return;
    db.studentTeacherCompatibilities.push({
      id: uid("student-compatibility"),
      studentId: student.id,
      teacherId,
      score: Number(select.value || 3)
    });
  });
  syncStudentLessonRequests(student.id, selectedSubjectIds, preferredTeacherIds, blockedTeacherIds, preferredGenders[0] || null);
  rebuildStudentSubjectRequests(student.id, selectedSubjectIds);
  persist();
  ui.hasUnsavedChanges = false;
  ui.activeDrawerIsNew = false;
  closeDrawer();
}

function removeTeacher(id) {
  if (!window.confirm("この講師を削除します。")) return;
  db.teachers = db.teachers.filter((item) => item.id !== id);
  db.teacherSubjects = db.teacherSubjects.filter((item) => item.teacherId !== id);
  db.teacherAvailabilitySlots = db.teacherAvailabilitySlots.filter((item) => item.teacherId !== id);
  db.teacherDateAvailability = db.teacherDateAvailability.filter((item) => item.teacherId !== id);
  db.currentLessonAssignments = db.currentLessonAssignments.filter((item) => item.teacherId !== id);
  db.studentTeacherPreferences = db.studentTeacherPreferences.filter((item) => item.teacherId !== id);
  db.studentTeacherCompatibilities = db.studentTeacherCompatibilities.filter((item) => item.teacherId !== id);
  persist();
  render();
}

function removeStudent(id) {
  if (!window.confirm("この生徒を削除します。")) return;
  db.students = db.students.filter((item) => item.id !== id);
  db.studentAvailabilitySlots = db.studentAvailabilitySlots.filter((item) => item.studentId !== id);
  db.studentDateAvailability = db.studentDateAvailability.filter((item) => item.studentId !== id);
  db.studentSubjectRequests = db.studentSubjectRequests.filter((item) => item.studentId !== id);
  db.lessonRequests = db.lessonRequests.filter((item) => item.studentId !== id);
  db.confirmedAssignments = db.confirmedAssignments.filter((item) => item.studentId !== id);
  db.studentTeacherPreferences = db.studentTeacherPreferences.filter((item) => item.studentId !== id);
  db.studentTeacherCompatibilities = db.studentTeacherCompatibilities.filter((item) => item.studentId !== id);
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

function getDateAvailability(entityType, ownerId) {
  const collectionName = entityType === "teacher" ? "teacherDateAvailability" : "studentDateAvailability";
  const ownerKey = entityType === "teacher" ? "teacherId" : "studentId";
  return db[collectionName].filter((item) => item[ownerKey] === ownerId);
}

function setDateAvailability(entityType, ownerId, rows) {
  const collectionName = entityType === "teacher" ? "teacherDateAvailability" : "studentDateAvailability";
  const ownerKey = entityType === "teacher" ? "teacherId" : "studentId";
  db[collectionName] = db[collectionName].filter((item) => item[ownerKey] !== ownerId);
  db[collectionName].push(...mergeDateAvailabilityRows([], rows, ownerKey));
  persist();
}

function teacherDateAvailabilitySummary(teacherId) {
  const rows = getDateAvailability("teacher", teacherId);
  const dayCount = new Set(rows.map((item) => item.date)).size;
  return rows.length ? `${dayCount}日 / ${rows.length}件の時間帯を登録済み` : "まだ日付ごとの時間は登録されていません";
}

function studentDateAvailabilitySummary(studentId) {
  const rows = getDateAvailability("student", studentId);
  const dayCount = new Set(rows.map((item) => item.date)).size;
  return rows.length ? `${dayCount}日 / ${rows.length}件の時間帯を登録済み` : "まだ日付ごとの時間は登録されていません";
}

function teacherDateAvailabilityDayCount() {
  return new Set((db.teacherDateAvailability || []).map((item) => item.date)).size;
}

function studentDateAvailabilityDayCount() {
  return new Set((db.studentDateAvailability || []).map((item) => item.date)).size;
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
  const band = id ? timeBandByKey(id) : null;
  const draft = band || { key: "", startTime: "17:00", endTime: "18:30", label: "", sortOrder: timeBands().length + 1, isActive: true };
  openModal(id ? "時間帯を編集" : "時間帯を追加", `
    <form id="slotForm" class="stack">
      <input type="hidden" name="id" value="${escapeAttr(draft.key)}" />
      <div class="form-grid two">
        <label class="field"><span>開始時刻</span><input type="time" name="startTime" value="${draft.startTime}" /></label>
        <label class="field"><span>終了時刻</span><input type="time" name="endTime" value="${draft.endTime}" /></label>
        <label class="field"><span>表示順</span><input type="number" name="sortOrder" value="${draft.sortOrder}" /></label>
      </div>
      <label class="field"><span>表示ラベル</span><input name="label" value="${escapeAttr(draft.label)}" /></label>
      <label class="checkbox-item"><input type="checkbox" name="isActive" ${draft.isActive ? "checked" : ""} /><span>有効</span></label>
      <button class="primary-btn" type="submit">保存</button>
    </form>
  `, () => {
    document.getElementById("slotForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const startTime = String(form.get("startTime"));
      const endTime = String(form.get("endTime"));
      const label = String(form.get("label") || "").trim() || `${startTime}-${endTime}`;
      const sortOrder = Number(form.get("sortOrder") || 1);
      const isActive = form.get("isActive") === "on";
      const existingKey = String(form.get("id") || "");
      if (existingKey) {
        db.timeSlots = db.timeSlots.map((item) => bandKey(item) === existingKey ? {
          ...item,
          startTime,
          endTime,
          label,
          sortOrder,
          isActive
        } : item);
      } else {
        weekdays.forEach((_, index) => {
          db.timeSlots.push({
            id: uid("slot"),
            timetableTemplateId: ui.selectedTemplateId,
            dayOfWeek: index + 1,
            startTime,
            endTime,
            label,
            sortOrder,
            isActive
          });
        });
      }
      closeModal();
      persist();
      render();
    });
  });
}

function deleteSlot(id) {
  if (!window.confirm("この時間帯を削除します。")) return;
  const deletedSlotIds = new Set(db.timeSlots.filter((item) => bandKey(item) === id).map((item) => item.id));
  db.timeSlots = db.timeSlots.filter((item) => !deletedSlotIds.has(item.id));
  db.teacherAvailabilitySlots = db.teacherAvailabilitySlots.filter((item) => !deletedSlotIds.has(item.timeSlotId));
  db.studentAvailabilitySlots = db.studentAvailabilitySlots.filter((item) => !deletedSlotIds.has(item.timeSlotId));
  db.teacherDateAvailability = db.teacherDateAvailability.filter((item) => !deletedSlotIds.has(item.lessonTimeSlotId));
  db.studentDateAvailability = db.studentDateAvailability.filter((item) => !deletedSlotIds.has(item.lessonTimeSlotId));
  db.currentLessonAssignments = db.currentLessonAssignments.filter((item) => !deletedSlotIds.has(item.timeSlotId));
  persist();
  render();
}

function openSubjectModal(id) {
  const subject = db.subjects.find((item) => item.id === id) || { id: uid("subject"), name: "", stage: "middle", sortOrder: db.subjects.length + 1, isActive: true };
  openModal(id ? "科目編集" : "科目追加", `
    <form id="subjectForm" class="stack">
      <input type="hidden" name="id" value="${subject.id}" />
      <label class="field"><span>区分</span><select name="stage"><option value="middle" ${(subject.stage || "middle") === "middle" ? "selected" : ""}>中学</option><option value="high" ${subject.stage === "high" ? "selected" : ""}>高校</option></select></label>
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
        const payload = { id: String(form.get("id")), stage: String(form.get("stage") || "middle"), name: String(form.get("name") || "").trim(), sortOrder: Number(form.get("sortOrder") || 1), isActive: form.get("isActive") === "on" };
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
  openModal("バックアップ", `<div class="stack"><p class="section-copy">この内容をコピーして保管しておくと、あとで復元できます。</p><textarea>${escapeHtml(exportDb())}</textarea></div>`);
  return;
  openModal("DBエクスポート", `<div class="stack"><textarea>${escapeHtml(exportDb())}</textarea></div>`);
}

function openTextImportModal() {
  openModal("復元", `
    <form id="importDbForm" class="stack">
      <label class="field"><span>バックアップ内容</span><textarea name="json"></textarea></label>
      <button class="primary-btn" type="submit">復元する</button>
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
        window.alert("バックアップの読み込みに失敗しました。内容を確認してもう一度お試しください。");
      }
    });
  });
  return;
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

function renderLessonRequestCards(studentId, requests) {
  const sortedRequests = requests
    .slice()
    .sort((a, b) => Number(a.priority || 0) - Number(b.priority || 0) || subjectName(a.subjectId).localeCompare(subjectName(b.subjectId), "ja"));
  if (!requests.length) {
    return `
      <div class="empty-state action-empty">
        <div>
          <strong>授業希望がまだありません</strong>
          <div class="muted">教科と回数を追加してください</div>
          <div class="action-row center"><button class="secondary-btn" type="button" data-action="add-lesson-request" data-student-id="${studentId}">授業希望を追加</button></div>
        </div>
      </div>
    `;
  }
  return `
    <div class="stack">
      <div class="action-row">
        <button class="secondary-btn" type="button" data-action="add-lesson-request" data-student-id="${studentId}">授業希望を追加</button>
      </div>
      <div class="lesson-request-grid">
        ${sortedRequests.map((request) => `
          <section class="lesson-request-card ${request.status === "inactive" ? "is-inactive" : ""}">
            <header>
              <div>
                <h5>${escapeHtml(subjectName(request.subjectId))}</h5>
                <p class="muted">${request.status === "inactive" ? "いまは使わない" : "作成対象"}</p>
              </div>
              <div class="lesson-request-actions">
                <button class="secondary-btn" type="button" data-action="edit-lesson-request" data-id="${request.id}">編集</button>
                <button class="secondary-btn" type="button" data-action="duplicate-lesson-request" data-id="${request.id}">コピー</button>
                <button class="ghost-btn" type="button" data-action="toggle-lesson-request" data-id="${request.id}">${request.status === "inactive" ? "有効化" : "無効化"}</button>
                <button class="danger-btn" type="button" data-action="delete-lesson-request" data-id="${request.id}">削除</button>
              </div>
            </header>
            <div class="lesson-request-meta">
                <span class="tag">回数 ${request.lessonsPerWeek || 1}</span>
                <span class="tag">優先度 ${request.priority || 0}</span>
                <span class="tag">${request.status === "inactive" ? "inactive" : "active"}</span>
            </div>
            <div class="lesson-request-fields">
              <div class="field"><span>希望講師</span><div class="pill-row">${teacherTags(request.preferredTeacherIds, "指定なし")}</div></div>
              <div class="field"><span>NG講師</span><div class="pill-row">${teacherTags(request.blockedTeacherIds, "指定なし")}</div></div>
              <div class="field"><span>希望する性別</span><div class="pill-row"><span class="tag">${escapeHtml(request.preferredGender ? genderLabel(request.preferredGender) : "指定なし")}</span></div></div>
              <div class="field"><span>補足</span><div class="request-memo">${escapeHtml(request.memo || "メモなし")}</div></div>
            </div>
          </section>
        `).join("")}
      </div>
    </div>
  `;
  if (!requests.length) {
    return `
      <div class="stack">
        <div class="callout warn">受講希望がまだありません。カードを追加して条件を設定してください。</div>
        <div class="action-row">
          <button class="secondary-btn" type="button" data-action="add-lesson-request" data-student-id="${studentId}">受講希望を追加</button>
        </div>
      </div>
    `;
  }
  return `
    <div class="stack">
      <div class="action-row">
        <button class="secondary-btn" type="button" data-action="add-lesson-request" data-student-id="${studentId}">受講希望を追加</button>
      </div>
      <div class="lesson-request-grid">
        ${requests
          .slice()
          .sort((a, b) => Number(a.priority || 0) - Number(b.priority || 0) || subjectName(a.subjectId).localeCompare(subjectName(b.subjectId), "ja"))
          .map((request) => `
            <section class="lesson-request-card ${request.status === "inactive" ? "is-inactive" : ""}">
              <header>
                <div>
                  <h5>${escapeHtml(subjectName(request.subjectId))}</h5>
                  <p class="muted">${request.status === "inactive" ? "inactive" : "active"}</p>
                </div>
                <div class="lesson-request-actions">
                  <button class="ghost-btn" type="button" data-action="edit-lesson-request" data-id="${request.id}">編集</button>
                  <button class="ghost-btn" type="button" data-action="duplicate-lesson-request" data-id="${request.id}">複製</button>
                  <button class="secondary-btn" type="button" data-action="toggle-lesson-request" data-id="${request.id}">${request.status === "inactive" ? "有効化" : "無効化"}</button>
                  <button class="danger-btn" type="button" data-action="delete-lesson-request" data-id="${request.id}">削除</button>
                </div>
              </header>
              <div class="lesson-request-meta">
                 <span class="tag">回数 ${request.lessonsPerWeek || 1}</span>
                 <span class="tag">必要 ${request.durationSlots || 1} コマ</span>
                <span class="tag">優先度 ${request.priority || 0}</span>
                <span class="tag">${request.status || "active"}</span>
              </div>
              <div class="lesson-request-fields">
                <div class="field"><span>希望講師</span><div class="pill-row">${teacherTags(request.preferredTeacherIds, "指定なし")}</div></div>
                <div class="field"><span>NG講師</span><div class="pill-row">${teacherTags(request.blockedTeacherIds, "指定なし")}</div></div>
                <div class="field"><span>希望講師性別</span><div class="pill-row"><span class="tag">${escapeHtml(request.preferredGender ? genderLabel(request.preferredGender) : "指定なし")}</span></div></div>
                <div class="field"><span>メモ</span><div class="request-memo">${escapeHtml(request.memo || "メモなし")}</div></div>
              </div>
            </section>
          `).join("")}
      </div>
    </div>
  `;
}

function openLessonRequestModal(studentId, lessonRequestId = null) {
  const student = db.students.find((item) => item.id === (studentId || lessonRequestById(lessonRequestId)?.studentId));
  if (!student) return;
  const existing = lessonRequestId ? lessonRequestById(lessonRequestId) : null;
  const request = existing || defaultLessonRequestDraft(student.id, activeSubjects()[0]?.id || db.subjects[0]?.id || "");
  const selectedPreferred = new Set((request.preferredTeacherIds || []).filter((teacherId) => !(request.blockedTeacherIds || []).includes(teacherId)));
  const selectedBlocked = new Set(request.blockedTeacherIds || []);
  openModal(existing ? "授業希望を編集" : "授業希望を追加", `
    <form id="lessonRequestForm" class="stack">
      <input type="hidden" name="id" value="${request.id}" />
      <input type="hidden" name="studentId" value="${student.id}" />
      <div class="form-grid two">
        <label class="field"><span>教科</span><select name="subjectId">${subjectSelectOptions(request.subjectId)}</select></label>
        <label class="field"><span>状態</span><select name="status"><option value="active" ${request.status !== "inactive" ? "selected" : ""}>active</option><option value="inactive" ${request.status === "inactive" ? "selected" : ""}>inactive</option></select></label>
        <label class="field"><span>回数</span><input type="number" name="lessonsPerWeek" min="1" step="1" value="${Math.max(1, Number(request.lessonsPerWeek || 1))}" required /></label>
        <label class="field"><span>必要コマ数</span><input type="number" name="durationSlots" min="1" step="1" value="${Math.max(1, Number(request.durationSlots || 1))}" required /></label>
        <label class="field"><span>優先度</span><input type="number" name="priority" step="1" value="${Number(request.priority || 1)}" /></label>
        <label class="field"><span>希望する性別</span><select name="preferredGender"><option value="">指定なし</option>${genders.filter((item) => item.value !== "any").map((item) => `<option value="${item.value}" ${request.preferredGender === item.value ? "selected" : ""}>${item.label}</option>`).join("")}</select></label>
      </div>
      <fieldset class="field"><legend>希望講師</legend><div class="checkbox-grid">${db.teachers.map((teacher) => checkboxChip("lesson-request-preferred", teacher.id, teacher.name, selectedPreferred.has(teacher.id))).join("")}</div></fieldset>
      <fieldset class="field"><legend>NG講師</legend><div class="checkbox-grid">${db.teachers.map((teacher) => checkboxChip("lesson-request-blocked", teacher.id, teacher.name, selectedBlocked.has(teacher.id))).join("")}</div></fieldset>
      <label class="field"><span>メモ</span><textarea name="memo">${escapeHtml(request.memo || "")}</textarea></label>
      <div class="action-row">
        <button class="primary-btn" type="submit">保存</button>
        <button class="ghost-btn" type="button" data-close-modal="true">キャンセル</button>
      </div>
    </form>
  `, () => {
    document.querySelector("[data-close-modal='true']")?.addEventListener("click", closeModal);
    document.getElementById("lessonRequestForm")?.addEventListener("submit", saveLessonRequest);
  });
  return;
  openModal(existing ? "受講希望を編集" : "受講希望を追加", `
    <form id="lessonRequestForm" class="stack">
      <input type="hidden" name="id" value="${request.id}" />
      <input type="hidden" name="studentId" value="${student.id}" />
      <div class="form-grid two">
        <label class="field"><span>教科</span><select name="subjectId">${subjectSelectOptions(request.subjectId)}</select></label>
        <label class="field"><span>状態</span><select name="status"><option value="active" ${request.status !== "inactive" ? "selected" : ""}>active</option><option value="inactive" ${request.status === "inactive" ? "selected" : ""}>inactive</option></select></label>
        <label class="field"><span>回数</span><input type="number" name="lessonsPerWeek" min="1" step="1" value="${Math.max(1, Number(request.lessonsPerWeek || 1))}" required /></label>
        <label class="field"><span>必要コマ数</span><input type="number" name="durationSlots" min="1" step="1" value="${Math.max(1, Number(request.durationSlots || 1))}" required /></label>
        <label class="field"><span>優先度</span><input type="number" name="priority" step="1" value="${Number(request.priority || 1)}" /></label>
        <label class="field"><span>希望講師性別</span><select name="preferredGender"><option value="">指定なし</option>${genders.filter((item) => item.value !== "any").map((item) => `<option value="${item.value}" ${request.preferredGender === item.value ? "selected" : ""}>${item.label}</option>`).join("")}</select></label>
      </div>
      <fieldset class="field"><legend>希望講師</legend><div class="checkbox-grid">${db.teachers.map((teacher) => checkboxChip("lesson-request-preferred", teacher.id, teacher.name, selectedPreferred.has(teacher.id))).join("")}</div></fieldset>
      <fieldset class="field"><legend>NG講師</legend><div class="checkbox-grid">${db.teachers.map((teacher) => checkboxChip("lesson-request-blocked", teacher.id, teacher.name, selectedBlocked.has(teacher.id))).join("")}</div></fieldset>
      <label class="field"><span>メモ</span><textarea name="memo">${escapeHtml(request.memo || "")}</textarea></label>
      <div class="action-row">
        <button class="primary-btn" type="submit">保存</button>
        <button class="secondary-btn" type="button" data-close-modal="true">キャンセル</button>
      </div>
    </form>
  `, () => {
    document.querySelector("[data-close-modal='true']")?.addEventListener("click", closeModal);
    document.getElementById("lessonRequestForm")?.addEventListener("submit", saveLessonRequest);
  });
}

function saveLessonRequest(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const studentId = String(form.get("studentId") || "");
  const lessonRequestId = String(form.get("id") || "");
  const preferredTeacherIds = [...new Set(Array.from(event.currentTarget.querySelectorAll('input[name="lesson-request-preferred"]:checked')).map((input) => input.value))];
  const blockedTeacherIds = [...new Set(Array.from(event.currentTarget.querySelectorAll('input[name="lesson-request-blocked"]:checked')).map((input) => input.value))];
  const normalizedPreferred = preferredTeacherIds.filter((teacherId) => !blockedTeacherIds.includes(teacherId));
  const existing = db.lessonRequests.find((item) => item.id === lessonRequestId);
  const draft = {
    ...(existing || defaultLessonRequestDraft(studentId, String(form.get("subjectId") || ""))),
    id: existing?.id || lessonRequestId || uid("lesson-request"),
    studentId,
    subjectId: String(form.get("subjectId") || ""),
    lessonsPerWeek: Math.max(1, Number(form.get("lessonsPerWeek") || 1)),
    durationSlots: Math.max(1, Number(form.get("durationSlots") || 1)),
    priority: Number(form.get("priority") || 1),
    preferredTeacherIds: normalizedPreferred,
    blockedTeacherIds,
    preferredGender: String(form.get("preferredGender") || "") || null,
    memo: String(form.get("memo") || ""),
    status: String(form.get("status") || "active")
  };
  db.lessonRequests = existing
    ? db.lessonRequests.map((item) => item.id === existing.id ? draft : item)
    : [draft, ...db.lessonRequests];
  rebuildStudentSubjectRequests(studentId);
  persist();
  closeModal();
  render();
}

function duplicateLessonRequest(lessonRequestId) {
  const request = lessonRequestById(lessonRequestId);
  if (!request) return;
  const duplicate = cloneLessonRequestRecord(request, {
    priority: Number(request.priority || 0) + 1
  });
  db.lessonRequests.unshift(duplicate);
  rebuildStudentSubjectRequests(request.studentId);
  persist();
  render();
}

function toggleLessonRequest(lessonRequestId) {
  db.lessonRequests = db.lessonRequests.map((item) => item.id === lessonRequestId ? { ...item, status: item.status === "inactive" ? "active" : "inactive" } : item);
  persist();
  render();
}

function deleteLessonRequest(lessonRequestId) {
  const request = lessonRequestById(lessonRequestId);
  if (!request) return;
  if (!window.confirm("この受講希望カードを削除しますか？")) return;
  db.lessonRequests = db.lessonRequests.filter((item) => item.id !== lessonRequestId);
  rebuildStudentSubjectRequests(request.studentId);
  persist();
  render();
}

function openDrawer(type, entityId, isNew = false) {
  const isSwitching = ui.activeDrawerType && (ui.activeDrawerType !== type || ui.activeDrawerEntityId !== entityId);
  if (isSwitching && ui.hasUnsavedChanges) {
    const ok = window.confirm("保存していない変更があります。切り替えますか？");
    if (!ok) return;
    discardUnsavedNewDrawerRecord();
  }
  if (type === "teacher") ui.selectedTeacherId = entityId;
  if (type === "student") ui.selectedStudentId = entityId;
  ui.activeDrawerType = type;
  ui.activeDrawerEntityId = entityId;
  ui.activeDrawerIsNew = Boolean(isNew);
  ui.hasUnsavedChanges = false;
  render();
}

function markDrawerDirty() {
  if (!ui.activeDrawerType) return;
  ui.hasUnsavedChanges = true;
}

function requestCloseDrawer() {
  if (!ui.activeDrawerType) return;
  if (ui.hasUnsavedChanges) {
    const ok = window.confirm("保存していない変更があります。閉じますか？");
    if (!ok) return;
  }
  closeDrawer();
}

function closeDrawer() {
  discardUnsavedNewDrawerRecord();
  clearDrawerState();
  render();
}

function clearDrawerState() {
  ui.activeDrawerType = null;
  ui.activeDrawerEntityId = null;
  ui.activeDrawerIsNew = false;
  ui.hasUnsavedChanges = false;
  syncBodyScrollLock();
}

function discardUnsavedNewDrawerRecord() {
  if (!ui.activeDrawerIsNew || !ui.activeDrawerEntityId) return;
  if (ui.activeDrawerType === "teacher") {
    const teacherId = ui.activeDrawerEntityId;
    db.teachers = db.teachers.filter((item) => item.id !== teacherId);
    db.teacherSubjects = db.teacherSubjects.filter((item) => item.teacherId !== teacherId);
    db.teacherAvailabilitySlots = db.teacherAvailabilitySlots.filter((item) => item.teacherId !== teacherId);
    db.teacherDateAvailability = db.teacherDateAvailability.filter((item) => item.teacherId !== teacherId);
    db.currentLessonAssignments = db.currentLessonAssignments.filter((item) => item.teacherId !== teacherId);
    db.studentTeacherPreferences = db.studentTeacherPreferences.filter((item) => item.teacherId !== teacherId);
    db = saveDb(db);
    if (ui.selectedTeacherId === teacherId) ui.selectedTeacherId = db.teachers[0]?.id || null;
  }
  if (ui.activeDrawerType === "student") {
    const studentId = ui.activeDrawerEntityId;
    db.students = db.students.filter((item) => item.id !== studentId);
    db.studentAvailabilitySlots = db.studentAvailabilitySlots.filter((item) => item.studentId !== studentId);
    db.studentDateAvailability = db.studentDateAvailability.filter((item) => item.studentId !== studentId);
    db.studentSubjectRequests = db.studentSubjectRequests.filter((item) => item.studentId !== studentId);
    db.lessonRequests = db.lessonRequests.filter((item) => item.studentId !== studentId);
    db.confirmedAssignments = db.confirmedAssignments.filter((item) => item.studentId !== studentId);
    db.studentTeacherPreferences = db.studentTeacherPreferences.filter((item) => item.studentId !== studentId);
    db.studentGenderPreferences = db.studentGenderPreferences.filter((item) => item.studentId !== studentId);
    db.currentLessonAssignments = db.currentLessonAssignments.filter((item) => item.studentId !== studentId);
    db.studentTeacherCompatibilities = db.studentTeacherCompatibilities.filter((item) => item.studentId !== studentId);
    db = saveDb(db);
    if (ui.selectedStudentId === studentId) ui.selectedStudentId = db.students[0]?.id || null;
  }
}

function syncBodyScrollLock() {
  document.body.classList.toggle("drawer-open", Boolean(ui.activeDrawerType));
}

function syncStudentLessonRequests(studentId, selectedSubjectIds, preferredTeacherIds, blockedTeacherIds, preferredGender) {
  const subjectIdSet = new Set(selectedSubjectIds);
  const blockedSet = new Set(blockedTeacherIds);
  const normalizedPreferred = [...new Set(preferredTeacherIds)].filter((teacherId) => !blockedSet.has(teacherId));
  const existing = db.lessonRequests.filter((item) => item.studentId === studentId);
  selectedSubjectIds.forEach((subjectId, index) => {
    if (existing.some((item) => item.subjectId === subjectId)) return;
    db.lessonRequests.push({
      ...defaultLessonRequestDraft(studentId, subjectId),
      priority: index + 1,
      preferredTeacherIds: [...normalizedPreferred],
      blockedTeacherIds: [...blockedSet],
      preferredGender
    });
  });
  db.lessonRequests = db.lessonRequests.map((item) => {
    if (item.studentId !== studentId || !subjectIdSet.has(item.subjectId)) return item;
    return {
      ...item,
      preferredTeacherIds: [...normalizedPreferred],
      blockedTeacherIds: [...blockedSet],
      preferredGender
    };
  });
}

function rebuildStudentSubjectRequests(studentId, selectedSubjectIds = []) {
  const subjectIds = [...new Set([
    ...selectedSubjectIds,
    ...db.lessonRequests.filter((item) => item.studentId === studentId).map((item) => item.subjectId)
  ])].filter(Boolean);
  db.studentSubjectRequests = db.studentSubjectRequests.filter((item) => item.studentId !== studentId);
  subjectIds.forEach((subjectId, index) => {
    db.studentSubjectRequests.push({
      id: uid("student-subject"),
      studentId,
      subjectId,
      priority: index + 1
    });
  });
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

function pageLeadForTab(tabId) {
  return {
    teachers: "先生の担当教科と授業できる時間を登録します。",
    students: "生徒の授業希望と授業できる時間を登録します。",
    slots: "日程案で使う、毎日に適用される時間帯を設定します。",
    generator: "準備状況を確認して、日程案をまとめて作成します。",
    results: "作成した候補を見比べて、最終案を決めます。"
  }[tabId] || "";
}

function buildStepStatuses() {
  const teacherReady = db.teachers.length > 0 && db.teachers.every((teacher) => String(teacher.name || "").trim() && teacherSubjectIds(teacher.id).length && getAvailability("teacher", teacher.id).length);
  const studentReady = db.students.length > 0 && db.students.every((student) => {
    if (!String(student.name || "").trim()) return false;
    const hasActiveRequests = lessonRequestsForStudent(student.id).some((item) => item.status !== "inactive");
    if (!hasActiveRequests) return true;
    return getAvailability("student", student.id).length > 0;
  });
  const slotReady = activeSlots().length > 0;
  const generatorIssues = generatorChecklist().filter((item) => !item.done).length;
  return [
    { id: "teachers", summaryKey: "講師", status: db.teachers.length === 0 ? "未登録" : teacherReady ? "完了" : "入力中", tone: db.teachers.length === 0 ? "muted" : teacherReady ? "success" : "warning" },
    { id: "students", summaryKey: "授業希望", status: db.students.length === 0 ? "未登録" : studentReady ? "完了" : "入力中", tone: db.students.length === 0 ? "muted" : studentReady ? "success" : "warning" },
    { id: "slots", summaryKey: "授業枠", status: slotReady ? "完了" : "未登録", tone: slotReady ? "success" : "muted" },
    { id: "generator", summaryKey: null, status: generatorIssues ? "要確認" : "完了", tone: generatorIssues ? "warning" : "success" },
    { id: "results", summaryKey: "生成履歴", status: db.scheduleSolutions.length ? "完了" : "未登録", tone: db.scheduleSolutions.length ? "success" : "muted" }
  ];
}

function generatorChecklist() {
  return [
    { label: "講師が登録されている", done: db.teachers.length > 0, success: `${db.teachers.length}人登録済みです。`, hint: "講師画面で、まず1人追加してください。" },
    { label: "生徒が登録されている", done: db.students.length > 0, success: `${db.students.length}人登録済みです。`, hint: "生徒画面で、まず1人追加してください。" },
    { label: "授業希望が登録されている", done: db.lessonRequests.some((item) => item.status !== "inactive"), success: "有効な授業希望があります。", hint: "生徒ごとに教科と回数を追加してください。" },
    { label: "授業時間が設定されている", done: activeSlots().length > 0, success: `${activeSlots().length}枠あります。`, hint: "授業時間画面で時間帯を追加してください。" },
    { label: "可能時間が入力されている", done: db.teacherAvailabilitySlots.length > 0 && db.studentAvailabilitySlots.length > 0, success: "講師・生徒ともに時間が入力されています。", hint: "講師と生徒の両方で、授業できる時間を選んでください。" }
  ];
}

function humanizeIssue(issue) {
  const text = String(issue || "");
  if (text.includes("有効な受講希望")) return "生徒の授業希望がまだありません。教科と週回数を追加してください。";
  if (text.includes("講師が未登録") || text.includes("講師がまだ登録")) return "講師を1人以上登録してください。";
  if (text.includes("生徒が未登録") || text.includes("生徒がまだ登録")) return "生徒を1人以上登録してください。";
  if (text.includes("可能時間")) return "授業できる時間が不足しています。講師と生徒の両方で時間を選んでください。";
  if (text.includes("対応教科")) return "担当教科が未設定の講師がいます。教科を選んでください。";
  if (text.includes("studentAvailabilitySlots")) return "古い生徒データに紐づいた可能時間が残っています。整理または初期化が必要です。";
  if (text.includes("teacherAvailabilitySlots")) return "古い講師データに紐づいた可能時間が残っています。整理または初期化が必要です。";
  if (text.includes("日付ごとの授業可能時間") && text.includes("講師")) return "講師のカレンダー入力に古い参照や不正な日付があります。登録内容を見直してください。";
  if (text.includes("日付ごとの授業可能時間") && text.includes("生徒")) return "生徒のカレンダー入力に古い参照や不正な日付があります。登録内容を見直してください。";
  if (text.includes("lessonRequests")) return "授業希望の一部に古い参照や入力不足があります。授業希望カードを見直してください。";
  if (text.includes("confirmedAssignments")) return "固定済みの予定に古い参照や条件違反があります。結果画面で見直してください。";
  return text;
}

function renderActionEmptyState(title, message, buttonLabel, action) {
  return `
    <div class="empty-state action-empty">
      <div>
        <strong>${escapeHtml(title)}</strong>
        <div class="muted">${escapeHtml(message)}</div>
        <div class="action-row center"><button class="secondary-btn" type="button" data-action="${action}">${escapeHtml(buttonLabel)}</button></div>
      </div>
    </div>
  `;
}

function renderFilteredEmptyState(label, message) {
  return `<div class="empty-state"><div><strong>条件に一致する${escapeHtml(label)}がいません</strong><div class="muted">${escapeHtml(message)}</div></div></div>`;
}

function renderDrawer(kind, title, content, id) {
  const action = kind === "teacher" ? "close-teacher-drawer" : "close-student-drawer";
  const deleteAction = kind === "teacher" ? "delete-teacher" : "delete-student";
  const lead = kind === "teacher"
    ? "基本情報から授業できる時間まで、右側でまとめて編集できます。"
    : "授業希望と授業できる時間を、右側でまとめて編集できます。";
  return `
    <div class="drawer-backdrop" data-drawer-close="${action}">
      <aside class="drawer-panel" role="dialog" aria-modal="true" aria-label="${escapeAttr(title)}" data-drawer-panel="true">
        <div class="drawer-header">
          <div>
            <h3>${escapeHtml(title)}</h3>
            <p class="section-copy">${lead}</p>
          </div>
          <div class="action-row">
            ${id ? `<button class="ghost-btn subtle-danger" type="button" data-action="${deleteAction}" data-id="${id}">削除</button>` : ""}
            <button class="ghost-btn" type="button" data-action="${action}">閉じる</button>
          </div>
        </div>
        <div class="drawer-body">${content}</div>
      </aside>
    </div>
  `;
}

function selectedWeekdays(selectedIds) {
  return weekdays.filter((day, index) => activeSlots().some((slot) => slot.dayOfWeek === index + 1 && selectedIds.has(slot.id)));
}

function renderUnassignedCards(unassigned) {
  return `
    <div class="stack">
      ${unassigned.map((item) => `
        <div class="callout warn">
          <strong>${escapeHtml(studentName(item.studentId))} / ${escapeHtml(subjectName(lessonRequestById(item.lessonRequestId)?.subjectId))}</strong>
          <div>${(item.reasons || []).map((reason) => escapeHtml(reason.label || "")).join(" / ")}</div>
          <div class="helper-text">${(item.reasons || []).map((reason) => escapeHtml(unassignedHint(reason.code))).join(" / ")}</div>
        </div>
      `).join("")}
    </div>
  `;
}

function unassignedHint(code) {
  const hintMap = {
    NO_STUDENT_AVAILABILITY: "生徒の通える時間を少し広げると候補が見つかりやすくなります。",
    NO_SUBJECT_REQUEST: "授業希望カードに教科が入っているか確認してください。",
    NO_TEACHER_FOR_SUBJECT: "この教科を担当できる講師を追加するか、担当教科を見直してください。",
    NO_COMMON_TIME_SLOT: "講師と生徒のどちらかの可能時間を広げると改善することがあります。",
    ONLY_BLOCKED_TEACHERS_AVAILABLE: "NG講師の条件が厳しすぎないか見直してください。",
    TEACHER_SLOT_CAPACITY_FULL: "別の時間帯を増やすか、講師を追加してください。",
    STUDENT_TIME_CONFLICT: "同じ生徒の別授業と重なっています。時間をずらしてみてください。",
    LOCKED_ASSIGNMENT_CONFLICT: "固定している予定を一部だけ見直すと解決することがあります。"
  };
  return hintMap[code] || "条件を少し広げると候補が見つかることがあります。";
  const hints = {
    NO_STUDENT_AVAILABILITY: "生徒の通える時間を少し広げると候補が見つかりやすくなります。",
    NO_SUBJECT_REQUEST: "授業希望カードに教科が入っているか確認してください。",
    NO_TEACHER_FOR_SUBJECT: "この教科を担当できる講師を追加するか、担当教科を見直してください。",
    NO_COMMON_TIME_SLOT: "講師と生徒のどちらかの可能時間を広げると改善することがあります。",
    ONLY_BLOCKED_TEACHERS_AVAILABLE: "NG講師の条件が厳しすぎないか見直してください。",
    TEACHER_SLOT_CAPACITY_FULL: "別の時間帯を増やすか、講師を追加してください。",
    STUDENT_TIME_CONFLICT: "同じ生徒の別授業と重なっています。時間をずらしてみてください。",
    LOCKED_ASSIGNMENT_CONFLICT: "固定している予定を一部だけ見直すと解決することがあります。"
  };
  return hints[code] || "条件を少し広げると候補が見つかることがあります。";
}

function updateFilter(control) {
  const target = control.dataset.filterTarget;
  const key = control.dataset.filterKey;
  if (!target || !key) return;
  const nextValue = control.type === "checkbox" ? control.checked : control.value;
  if (target === "teacher") ui.teacherFilters = { ...ui.teacherFilters, [key]: nextValue };
  if (target === "student") ui.studentFilters = { ...ui.studentFilters, [key]: nextValue };
  render();
}

function clearTeacherFilters() {
  ui.teacherFilters = { search: "", subjectId: "", gender: "", dayOfWeek: "", missingOnly: false };
  render();
}

function clearStudentFilters() {
  ui.studentFilters = { search: "", subjectId: "", supportLevel: "", requestState: "", missingAvailabilityOnly: false, noActiveRequestsOnly: false };
  render();
}

function filteredTeachers() {
  const filters = ui.teacherFilters;
  const search = filters.search.trim().toLowerCase();
  return db.teachers.filter((teacher) => !search || teacher.name.toLowerCase().includes(search));
}

function filteredStudents() {
  const filters = ui.studentFilters;
  const search = filters.search.trim().toLowerCase();
  return db.students.filter((student) => !search || student.name.toLowerCase().includes(search));
}

function teacherHasMissingFields(teacher) {
  return !teacher.name.trim() || teacherSubjectIds(teacher.id).length === 0;
}

function subjectFilterOptions(selected, placeholder = "教科") {
  return [`<option value="">${escapeHtml(placeholder)}</option>`]
    .concat(activeSubjectGroups().flatMap((group) => [
      `<optgroup label="${group.label}">`,
      ...group.subjects.map((subject) => `<option value="${subject.id}" ${selected === subject.id ? "selected" : ""}>${escapeHtml(subject.name)}</option>`),
      "</optgroup>"
    ]))
    .join("");
}

function subjectSelectOptions(selected) {
  return activeSubjectGroups().flatMap((group) => [
    `<optgroup label="${group.label}">`,
    ...group.subjects.map((subject) => `<option value="${subject.id}" ${selected === subject.id ? "selected" : ""}>${escapeHtml(subject.name)}</option>`),
    "</optgroup>"
  ]).join("");
}

function genderFilterOptions(selected) {
  return [`<option value="">性別</option>`]
    .concat(genders.filter((item) => item.value !== "any").map((item) => `<option value="${item.value}" ${selected === item.value ? "selected" : ""}>${escapeHtml(item.label)}</option>`))
    .join("");
}

function weekdayFilterOptions(selected) {
  return [`<option value="">曜日</option>`]
    .concat(weekdays.map((day, index) => `<option value="${index + 1}" ${String(selected) === String(index + 1) ? "selected" : ""}>${day}</option>`))
    .join("");
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

function activeSubjectGroups() {
  const groups = [
    { key: "middle", label: "中学", subjects: [] },
    { key: "high", label: "高校", subjects: [] }
  ];
  activeSubjects().forEach((subject) => {
    const group = groups.find((item) => item.key === (subject.stage || "middle"));
    (group || groups[0]).subjects.push(subject);
  });
  return groups.filter((group) => group.subjects.length);
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

function bandKey(slot) {
  return `${slot.startTime}|${slot.endTime}`;
}

function subjectName(id) {
  const subject = db.subjects.find((item) => item.id === id);
  if (!subject) return "未設定";
  return `${subject.stage === "high" ? "高校" : "中学"} ${subject.name}`;
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
  const slot = db.timeSlots.find((item) => item.id === id);
  if (!slot) return "未設定";
  return `${weekdays[(slot.dayOfWeek || 1) - 1]} ${slot.startTime}-${slot.endTime}`;
}

function genderLabel(value) {
  return genders.find((item) => item.value === value)?.label || "指定なし";
}

function checkboxChip(name, value, label, checked) {
  return `<label class="chip ${checked ? "active" : ""}"><input type="checkbox" name="${name}" value="${value}" ${checked ? "checked" : ""} /><span>${escapeHtml(label)}</span></label>`;
}

function renderSubjectCheckboxGroups(name, selectedIds = []) {
  const selectedSet = new Set(selectedIds);
  return activeSubjectGroups().map((group) => `
    <div class="subject-group">
      <strong class="subject-group-title">${group.label}</strong>
      <div class="checkbox-grid">${group.subjects.map((subject) => checkboxChip(name, subject.id, subject.name, selectedSet.has(subject.id))).join("")}</div>
    </div>
  `).join("");
}

function compatibilityOptions(selected) {
  return [1, 2, 3, 4, 5].map((value) => `<option value="${value}" ${Number(selected) === value ? "selected" : ""}>${value}</option>`).join("");
}

function studentTeacherCompatibility(studentId, teacherId) {
  return db.studentTeacherCompatibilities?.find((item) => item.studentId === studentId && item.teacherId === teacherId)?.score || 3;
}

function openDateAvailabilityModal(entityType, ownerId) {
  const entity = entityType === "teacher"
    ? db.teachers.find((item) => item.id === ownerId)
    : db.students.find((item) => item.id === ownerId);
  if (!entity) return;
  modalState = {
    type: "date-availability",
    entityType,
    ownerId,
    month: startOfMonth(new Date()),
    selectedDates: [],
    draftRows: getDateAvailability(entityType, ownerId).map((item) => ({ ...item }))
  };
  renderDateAvailabilityModal();
}

function renderDateAvailabilityModal() {
  if (!modalState || modalState.type !== "date-availability") return;
  const entity = modalState.entityType === "teacher"
    ? db.teachers.find((item) => item.id === modalState.ownerId)
    : db.students.find((item) => item.id === modalState.ownerId);
  if (!entity) {
    closeDateAvailabilityModal();
    return;
  }
  const title = `${modalState.entityType === "teacher" ? "講師" : "生徒"}の授業できる時間`;
  openModal(title, buildDateAvailabilityModalContent(entity), bindDateAvailabilityModalEvents);
}

function buildDateAvailabilityModalContent(entity) {
  const monthStart = ensureMonthDate(modalState.month);
  const selectedDates = new Set(modalState.selectedDates || []);
  const rowsByDate = groupDateAvailabilityRows(modalState.draftRows || []);
  const selectionLabel = modalState.selectedDates.length
    ? modalState.selectedDates.map((date) => formatShortDate(date)).join(" / ")
    : "まだ選択されていません";
  return `
    <div class="stack calendar-modal">
      <div class="calendar-toolbar">
        <div>
          <strong>${escapeHtml(entity.name || "未設定")}</strong>
          <div class="muted">${modalState.entityType === "teacher" ? "講師" : "生徒"}の授業可能日を選びます</div>
        </div>
        <div class="action-row">
          <button class="ghost-btn" type="button" data-calendar-nav="-1">前月</button>
          <strong>${monthStart.getFullYear()}年${monthStart.getMonth() + 1}月</strong>
          <button class="ghost-btn" type="button" data-calendar-nav="1">次月</button>
          <button class="ghost-btn" type="button" data-calendar-today="true">今日へ戻る</button>
        </div>
      </div>
      <div class="calendar-layout">
        <section class="calendar-board">
          <div class="calendar-weekdays">${["月", "火", "水", "木", "金", "土", "日"].map((day) => `<div>${day}</div>`).join("")}</div>
          <div class="calendar-grid">
            ${buildCalendarCells(monthStart).map((cell) => {
              const rowItems = rowsByDate.get(cell.date) || [];
              const visible = rowItems.slice(0, 3);
              const hiddenCount = Math.max(0, rowItems.length - visible.length);
              const classNames = [
                "calendar-day",
                cell.inMonth ? "" : "outside",
                cell.isToday ? "today" : "",
                selectedDates.has(cell.date) ? "selected" : ""
              ].filter(Boolean).join(" ");
              return `
                <button class="${classNames}" type="button" data-calendar-date="${cell.date}">
                  <span class="calendar-day-number">${cell.day}</span>
                  <span class="calendar-day-slots">
                    ${visible.map((item) => `<span class="calendar-slot-pill">${escapeHtml(slotTimeLabel(item.lessonTimeSlotId))}</span>`).join("")}
                    ${hiddenCount ? `<span class="calendar-slot-more">ほか${hiddenCount}件</span>` : ""}
                  </span>
                </button>
              `;
            }).join("")}
          </div>
        </section>
        <section class="calendar-sidepanel">
          <div class="card flat-card">
            <h4 class="card-title">選択中の日付</h4>
            <div class="muted">${escapeHtml(selectionLabel)}</div>
          </div>
          <div class="card flat-card">
            <h4 class="card-title">時間帯を選ぶ</h4>
            <div class="checkbox-grid stacked-chip-grid">
              ${lessonTimeSlotOptions().map((slot) => `
                <label class="chip slot-choice">
                  <input type="checkbox" name="calendar-slot" value="${slot.id}" />
                  <span>${escapeHtml(slot.label)}</span>
                </label>
              `).join("") || `<div class="muted">時間帯を先に登録してください。</div>`}
            </div>
            <div class="helper-text">日付を複数選んでから、まとめて追加できます。</div>
          </div>
          <div class="action-row calendar-actions">
            <button class="secondary-btn" type="button" data-calendar-bulk-add="true">一括追加</button>
            <button class="ghost-btn" type="button" data-calendar-clear-days="true">選択日の時間を消去</button>
            <button class="ghost-btn" type="button" data-calendar-clear-selection="true">選択解除</button>
          </div>
          <div class="action-row drawer-form-actions modal-sticky-actions">
            <button class="ghost-btn" type="button" data-calendar-cancel="true">閉じる</button>
            <button class="primary-btn" type="button" data-calendar-save="true">保存</button>
          </div>
        </section>
      </div>
    </div>
  `;
}

function bindDateAvailabilityModalEvents() {
  document.querySelectorAll("[data-calendar-nav]").forEach((button) => button.addEventListener("click", () => {
    modalState.month = addMonths(ensureMonthDate(modalState.month), Number(button.dataset.calendarNav || 0));
    renderDateAvailabilityModal();
  }));
  document.querySelector("[data-calendar-today='true']")?.addEventListener("click", () => {
    modalState.month = startOfMonth(new Date());
    renderDateAvailabilityModal();
  });
  document.querySelectorAll("[data-calendar-date]").forEach((button) => button.addEventListener("click", () => {
    toggleCalendarDate(button.dataset.calendarDate);
    renderDateAvailabilityModal();
  }));
  document.querySelector("[data-calendar-bulk-add='true']")?.addEventListener("click", addCalendarSlotsToSelectedDates);
  document.querySelector("[data-calendar-clear-days='true']")?.addEventListener("click", clearCalendarSelectedDates);
  document.querySelector("[data-calendar-clear-selection='true']")?.addEventListener("click", () => {
    modalState.selectedDates = [];
    renderDateAvailabilityModal();
  });
  document.querySelector("[data-calendar-cancel='true']")?.addEventListener("click", closeDateAvailabilityModal);
  document.querySelector("[data-calendar-save='true']")?.addEventListener("click", saveDateAvailabilityModal);
}

function toggleCalendarDate(date) {
  const selected = new Set(modalState.selectedDates || []);
  if (selected.has(date)) selected.delete(date);
  else selected.add(date);
  modalState.selectedDates = [...selected].sort();
}

function addCalendarSlotsToSelectedDates() {
  const selectedDates = modalState.selectedDates || [];
  const slotIds = Array.from(document.querySelectorAll('input[name="calendar-slot"]:checked')).map((input) => input.value);
  if (!selectedDates.length || !slotIds.length) return;
  const ownerKey = modalState.entityType === "teacher" ? "teacherId" : "studentId";
  const additions = [];
  selectedDates.forEach((date) => {
    slotIds.forEach((lessonTimeSlotId) => {
      additions.push({
        id: uid("date-availability"),
        [ownerKey]: modalState.ownerId,
        date,
        lessonTimeSlotId
      });
    });
  });
  modalState.draftRows = mergeDateAvailabilityRows(modalState.draftRows, additions, ownerKey);
  renderDateAvailabilityModal();
}

function clearCalendarSelectedDates() {
  const selectedDates = new Set(modalState.selectedDates || []);
  if (!selectedDates.size) return;
  modalState.draftRows = (modalState.draftRows || []).filter((item) => !selectedDates.has(item.date));
  renderDateAvailabilityModal();
}

function saveDateAvailabilityModal() {
  if (!modalState || modalState.type !== "date-availability") return;
  setDateAvailability(modalState.entityType, modalState.ownerId, modalState.draftRows || []);
  closeDateAvailabilityModal();
  render();
}

function closeDateAvailabilityModal() {
  modalState = null;
  closeModal();
}

function timeBands() {
  const rows = new Map();
  timeSlotsForTemplate(ui.selectedTemplateId).forEach((slot) => {
    const key = bandKey(slot);
    if (!rows.has(key)) {
      rows.set(key, {
        key,
        startTime: slot.startTime,
        endTime: slot.endTime,
        label: slot.label || `${slot.startTime}-${slot.endTime}`,
        sortOrder: slot.sortOrder,
        isActive: slot.isActive
      });
    } else {
      const row = rows.get(key);
      row.isActive = row.isActive || slot.isActive;
      row.sortOrder = Math.min(row.sortOrder, slot.sortOrder);
      if (!row.label || row.label.includes("月 ") || row.label.includes("火 ") || row.label.includes("水 ") || row.label.includes("木 ") || row.label.includes("金 ") || row.label.includes("土 ") || row.label.includes("日 ")) {
        row.label = `${slot.startTime}-${slot.endTime}`;
      }
    }
  });
  return [...rows.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime));
}

function timeBandByKey(key) {
  return timeBands().find((item) => item.key === key) || null;
}

function lessonTimeSlotOptions() {
  return timeBands().filter((band) => band.isActive).map((band) => {
    const slot = timeSlotsForTemplate(ui.selectedTemplateId).find((item) => bandKey(item) === band.key);
    return { id: slot?.id || "", label: `${band.startTime}-${band.endTime}` };
  }).filter((item) => item.id);
}

function teacherTags(ids = [], emptyLabel = "なし") {
  if (!ids.length) return `<span class="tag">${escapeHtml(emptyLabel)}</span>`;
  return ids.map((id) => `<span class="tag">${escapeHtml(teacherName(id))}</span>`).join("");
}

function genderOptions(value) {
  return genders.map((item) => `<option value="${item.value}" ${item.value === value ? "selected" : ""}>${item.label}</option>`).join("");
}

function groupDateAvailabilityRows(rows) {
  const map = new Map();
  [...(rows || [])]
    .sort((a, b) => a.date.localeCompare(b.date) || slotTimeLabel(a.lessonTimeSlotId).localeCompare(slotTimeLabel(b.lessonTimeSlotId)))
    .forEach((item) => {
      if (!map.has(item.date)) map.set(item.date, []);
      map.get(item.date).push(item);
    });
  return map;
}

function buildCalendarCells(monthStart) {
  const start = new Date(monthStart);
  const offset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - offset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      date: formatDateKey(date),
      day: date.getDate(),
      inMonth: date.getMonth() === monthStart.getMonth(),
      isToday: formatDateKey(date) === formatDateKey(new Date())
    };
  });
}

function ensureMonthDate(value) {
  return startOfMonth(value instanceof Date ? value : new Date(value));
}

function startOfMonth(value) {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(value, amount) {
  return new Date(value.getFullYear(), value.getMonth() + amount, 1);
}

function formatDateKey(value) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatShortDate(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function slotTimeLabel(id) {
  const slot = db.timeSlots.find((item) => item.id === id);
  if (!slot) return "未設定";
  return `${slot.startTime}-${slot.endTime}`;
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
  modalState = null;
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
