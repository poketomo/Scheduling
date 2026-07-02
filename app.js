(function () {
  const STORAGE_KEY = "scheduling-mvp-state-v1";
  const tabs = [
    { id: "teachers", label: "講師一覧・追加編集" },
    { id: "students", label: "生徒一覧・追加編集" },
    { id: "slots", label: "時間割設定" },
    { id: "generator", label: "自動生成" },
    { id: "results", label: "生成結果確認" }
  ];
  const weekdays = ["月", "火", "水", "木", "金", "土", "日"];
  const genders = [
    { value: "any", label: "指定なし" },
    { value: "male", label: "男性" },
    { value: "female", label: "女性" },
    { value: "other", label: "その他" }
  ];
  const state = loadState();
  let ui = {
    tab: "teachers",
    selectedTeacherId: state.teachers[0]?.id || null,
    selectedStudentId: state.students[0]?.id || null,
    selectedTemplateId: state.timetableTemplates[0]?.id || null,
    selectedRunId: state.scheduleRuns[0]?.id || null,
    selectedSolutionId: state.scheduleSolutions[0]?.id || null,
    availabilityClipboard: null
  };

  init();

  function init() {
    bindShellActions();
    ensureSelections();
    render();
  }

  function loadState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        return withDefaults(parsed);
      } catch (error) {
        console.error(error);
      }
    }
    return withDefaults({});
  }

  function withDefaults(data) {
    const fallbackTemplateId = data.timetableTemplates?.[0]?.id || uid("template");
    return {
      teachers: data.teachers || [],
      teacherSubjects: data.teacherSubjects || [],
      students: data.students || [],
      subjects: data.subjects || defaultSubjects(),
      timetableTemplates: data.timetableTemplates || defaultTemplates(fallbackTemplateId),
      timeSlots: data.timeSlots || defaultSlots(fallbackTemplateId),
      teacherAvailabilitySlots: data.teacherAvailabilitySlots || [],
      studentAvailabilitySlots: data.studentAvailabilitySlots || [],
      studentSubjectRequests: data.studentSubjectRequests || [],
      studentTeacherPreferences: data.studentTeacherPreferences || [],
      studentGenderPreferences: data.studentGenderPreferences || [],
      currentLessonAssignments: data.currentLessonAssignments || [],
      scheduleRuns: data.scheduleRuns || [],
      scheduleSolutions: data.scheduleSolutions || [],
      scheduleAssignments: data.scheduleAssignments || [],
      confirmedSolutionId: data.confirmedSolutionId || null,
      lastSavedAt: data.lastSavedAt || null
    };
  }

  function defaultSubjects() {
    return [
      { id: uid("subject"), name: "数学", sortOrder: 1, isActive: true },
      { id: uid("subject"), name: "英語", sortOrder: 2, isActive: true },
      { id: uid("subject"), name: "国語", sortOrder: 3, isActive: true }
    ];
  }

  function defaultTemplates(templateId) {
    return [{ id: templateId, name: "標準時間割", isActive: true, createdAt: now(), updatedAt: now() }];
  }

  function defaultSlots(templateId) {
    const windows = [
      ["16:00", "17:30"],
      ["17:40", "19:10"],
      ["19:20", "20:50"]
    ];
    return weekdays.flatMap((day, dayIndex) =>
      windows.map((window, index) => ({
        id: uid("slot"),
        timetableTemplateId: templateId,
        dayOfWeek: dayIndex + 1,
        startTime: window[0],
        endTime: window[1],
        label: `${day} ${window[0]}-${window[1]}`,
        sortOrder: dayIndex * windows.length + index + 1,
        isActive: true
      }))
    );
  }

  function bindShellActions() {
    document.getElementById("seedButton").addEventListener("click", seedSampleData);
    document.getElementById("resetButton").addEventListener("click", () => {
      if (!window.confirm("保存済みデータを初期化します。よろしいですか。")) return;
      localStorage.removeItem(STORAGE_KEY);
      window.location.reload();
    });
  }

  function saveState() {
    state.lastSavedAt = now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    renderSidebar();
  }

  function ensureSelections() {
    if (!state.timetableTemplates.find((item) => item.id === ui.selectedTemplateId)) {
      ui.selectedTemplateId = state.timetableTemplates[0]?.id || null;
    }
    if (!state.teachers.find((item) => item.id === ui.selectedTeacherId)) {
      ui.selectedTeacherId = state.teachers[0]?.id || null;
    }
    if (!state.students.find((item) => item.id === ui.selectedStudentId)) {
      ui.selectedStudentId = state.students[0]?.id || null;
    }
    if (!state.scheduleRuns.find((item) => item.id === ui.selectedRunId)) {
      ui.selectedRunId = state.scheduleRuns[0]?.id || null;
    }
    if (!state.scheduleSolutions.find((item) => item.id === ui.selectedSolutionId)) {
      ui.selectedSolutionId = state.scheduleSolutions[0]?.id || null;
    }
  }

  function render() {
    ensureSelections();
    renderSidebar();
    renderNav();
    renderPage();
  }

  function renderSidebar() {
    const saveStatus = document.getElementById("saveStatus");
    saveStatus.innerHTML = state.lastSavedAt
      ? `<div class="callout success">最終保存: <span class="mono">${formatDateTime(state.lastSavedAt)}</span></div>`
      : `<div class="callout">まだ保存前です</div>`;

    const stats = {
      講師: state.teachers.length,
      生徒: state.students.length,
      科目: activeSubjects().length,
      有効枠: activeSlots().length,
      実行履歴: state.scheduleRuns.length
    };
    const summary = document.getElementById("summaryStats");
    summary.innerHTML = Object.entries(stats)
      .map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`)
      .join("");
  }

  function renderNav() {
    const container = document.getElementById("navTabs");
    container.innerHTML = tabs
      .map(
        (tab) => `
          <button class="nav-tab ${ui.tab === tab.id ? "active" : ""}" type="button" data-tab="${tab.id}">
            ${tab.label}
          </button>
        `
      )
      .join("");
    container.querySelectorAll("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        ui.tab = button.dataset.tab;
        render();
      });
    });
  }

  function renderPage() {
    const title = tabs.find((tab) => tab.id === ui.tab)?.label || "";
    document.getElementById("pageTitle").textContent = title;
    const app = document.getElementById("app");
    if (ui.tab === "teachers") app.innerHTML = renderTeachersPage();
    if (ui.tab === "students") app.innerHTML = renderStudentsPage();
    if (ui.tab === "slots") app.innerHTML = renderSlotsPage();
    if (ui.tab === "generator") app.innerHTML = renderGeneratorPage();
    if (ui.tab === "results") app.innerHTML = renderResultsPage();
    bindPageEvents();
  }

  function renderTeachersPage() {
    const selected = state.teachers.find((item) => item.id === ui.selectedTeacherId);
    return `
      <div class="layout-two">
        <section class="panel">
          <div class="panel-header">
            <h3>講師一覧</h3>
            <button class="primary-btn" type="button" data-action="add-teacher">追加</button>
          </div>
          <div class="panel-body">
            <div class="entity-list">
              ${state.teachers.length ? state.teachers.map(renderTeacherListItem).join("") : `<div class="callout warn">講師が未登録です。</div>`}
            </div>
          </div>
        </section>
        <section class="panel">
          <div class="panel-header">
            <h3>${selected ? "講師編集" : "講師追加"}</h3>
            ${selected ? `<button class="danger-btn" type="button" data-action="delete-teacher" data-id="${selected.id}">削除</button>` : ""}
          </div>
          <div class="panel-body">
            ${renderTeacherForm(selected)}
          </div>
        </section>
      </div>
    `;
  }

  function renderStudentsPage() {
    const selected = state.students.find((item) => item.id === ui.selectedStudentId);
    return `
      <div class="layout-two">
        <section class="panel">
          <div class="panel-header">
            <h3>生徒一覧</h3>
            <button class="primary-btn" type="button" data-action="add-student">追加</button>
          </div>
          <div class="panel-body">
            <div class="entity-list">
              ${state.students.length ? state.students.map(renderStudentListItem).join("") : `<div class="callout warn">生徒が未登録です。</div>`}
            </div>
          </div>
        </section>
        <section class="panel">
          <div class="panel-header">
            <h3>${selected ? "生徒編集" : "生徒追加"}</h3>
            ${selected ? `<button class="danger-btn" type="button" data-action="delete-student" data-id="${selected.id}">削除</button>` : ""}
          </div>
          <div class="panel-body">
            ${renderStudentForm(selected)}
          </div>
        </section>
      </div>
    `;
  }

  function renderSlotsPage() {
    const templates = state.timetableTemplates;
    const selectedTemplate = templates.find((item) => item.id === ui.selectedTemplateId);
    const slots = timeSlotsForTemplate(ui.selectedTemplateId);
    return `
      <div class="stack">
        <section class="summary-strip">
          <div class="toolbar">
            <div class="field">
              <label for="templateSelect">時間割テンプレート</label>
              <select id="templateSelect">
                ${templates.map((template) => `<option value="${template.id}" ${template.id === ui.selectedTemplateId ? "selected" : ""}>${escapeHtml(template.name)}</option>`).join("")}
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
                <thead>
                  <tr><th>曜日</th><th>開始</th><th>終了</th><th>表示名</th><th>順序</th><th>状態</th><th></th></tr>
                </thead>
                <tbody>
                  ${slots.map(renderSlotRow).join("")}
                </tbody>
              </table>
            </div>
          </section>
          <section class="panel">
            <div class="panel-header">
              <h3>科目マスタ</h3>
              <button class="primary-btn" type="button" data-action="add-subject">科目追加</button>
            </div>
            <div class="panel-body">
              <table class="simple-table">
                <thead>
                  <tr><th>科目名</th><th>表示順</th><th>状態</th><th></th></tr>
                </thead>
                <tbody>
                  ${state.subjects.map(renderSubjectRow).join("")}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    `;
  }

  function renderGeneratorPage() {
    const issues = generatorReadiness();
    const selectedRun = state.scheduleRuns.find((item) => item.id === ui.selectedRunId);
    const solutions = state.scheduleSolutions.filter((item) => item.scheduleRunId === selectedRun?.id).sort((a, b) => a.rank - b.rank);
    return `
      <div class="stack">
        <section class="summary-strip">
          <div class="summary-grid">
            <div class="card"><div class="muted">講師</div><strong>${state.teachers.length}</strong></div>
            <div class="card"><div class="muted">生徒</div><strong>${state.students.length}</strong></div>
            <div class="card"><div class="muted">有効スロット</div><strong>${activeSlots().length}</strong></div>
            <div class="card"><div class="muted">実行可能性</div><strong>${issues.length ? "要確認" : "準備完了"}</strong></div>
          </div>
        </section>
        ${issues.length ? `<div class="callout warn">${issues.map((issue) => `<div>${escapeHtml(issue)}</div>`).join("")}</div>` : `<div class="callout success">絶対条件の入力に必要な基本データは揃っています。</div>`}
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
          <div class="panel-header">
            <h3>直近の生成結果</h3>
          </div>
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
                    <thead>
                      <tr><th>順位</th><th>総合スコア</th><th>割当</th><th>未割当</th><th></th></tr>
                    </thead>
                    <tbody>
                      ${solutions.map((solution) => `
                        <tr>
                          <td>${solution.rank}</td>
                          <td>${solution.totalScore}</td>
                          <td>${solution.assignedCount}</td>
                          <td>${solution.unassignedCount}</td>
                          <td><button class="ghost-btn" type="button" data-action="open-solution" data-id="${solution.id}">確認</button></td>
                        </tr>
                      `).join("")}
                    </tbody>
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
    const runs = [...state.scheduleRuns].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const selectedRun = runs.find((item) => item.id === ui.selectedRunId);
    const solutions = state.scheduleSolutions.filter((item) => item.scheduleRunId === selectedRun?.id).sort((a, b) => a.rank - b.rank);
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
          <div class="panel-body">
            ${selectedSolution ? renderSolutionDetail(selectedSolution) : `<div class="callout warn">表示する候補案がありません。</div>`}
          </div>
        </section>
        <section class="panel">
          <div class="panel-header">
            <h3>候補一覧</h3>
          </div>
          <div class="panel-body">
            <div class="field">
              <label for="runSelect">生成回</label>
              <select id="runSelect">
                ${runs.map((run) => `<option value="${run.id}" ${run.id === ui.selectedRunId ? "selected" : ""}>${formatDateTime(run.createdAt)} / ${escapeHtml(run.status)}</option>`).join("")}
              </select>
            </div>
            <div class="list">
              ${solutions.length ? solutions.map((solution) => renderSolutionListItem(solution)).join("") : `<div class="callout">この生成回には候補がありません。</div>`}
            </div>
          </div>
        </section>
      </div>
    `;
  }

  function renderTeacherListItem(teacher) {
    const subjects = teacherSubjectNames(teacher.id).join(" / ");
    const slotCount = state.teacherAvailabilitySlots.filter((slot) => slot.teacherId === teacher.id).length;
    return `
      <button class="entity-item ${teacher.id === ui.selectedTeacherId ? "active" : ""}" type="button" data-select-teacher="${teacher.id}">
        <h4>${escapeHtml(teacher.name)}</h4>
        <div class="entity-meta">
          <span class="tag">${genderLabel(teacher.gender)}</span>
          <span class="tag">${subjects || "教科未設定"}</span>
          <span class="tag">可能枠 ${slotCount}</span>
        </div>
      </button>
    `;
  }

  function renderStudentListItem(student) {
    const subjects = studentRequestedSubjectNames(student.id).join(" / ");
    const slotCount = state.studentAvailabilitySlots.filter((slot) => slot.studentId === student.id).length;
    return `
      <button class="entity-item ${student.id === ui.selectedStudentId ? "active" : ""}" type="button" data-select-student="${student.id}">
        <h4>${escapeHtml(student.name)}</h4>
        <div class="entity-meta">
          <span class="tag">手のかかる度 ${student.supportLevel}</span>
          <span class="tag">${subjects || "希望教科未設定"}</span>
          <span class="tag">可能枠 ${slotCount}</span>
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
          <label class="field">
            <span>名前</span>
            <input name="name" value="${escapeAttr(current.name)}" required />
          </label>
          <label class="field">
            <span>性別</span>
            <select name="gender">${genderOptions(current.gender)}</select>
          </label>
        </div>
        <fieldset class="field">
          <legend>対応教科</legend>
          <div class="checkbox-grid">
            ${activeSubjects().map((subject) => checkboxChip("teacher-subject", subject.id, subject.name, teacherHasSubject(current.id, subject.id))).join("")}
          </div>
        </fieldset>
        <label class="field">
          <span>メモ</span>
          <textarea name="memo">${escapeHtml(current.memo || "")}</textarea>
        </label>
        <label class="field">
          <span>拡張用フィールド(JSON)</span>
          <textarea name="extraJson">${escapeHtml(JSON.stringify(current.extraJson || {}, null, 2))}</textarea>
        </label>
        <div class="card">
          <h4 class="card-title">現在担当している生徒</h4>
          ${renderCurrentAssignmentsEditor(current.id)}
        </div>
        <div class="card">
          <h4 class="card-title">可能時間</h4>
          ${renderAvailabilityEditor("teacher", current.id)}
        </div>
        <div class="action-row">
          <button class="primary-btn" type="submit">保存</button>
        </div>
      </form>
    `;
  }

  function renderStudentForm(student) {
    const current = student || createEmptyStudent();
    return `
      <form id="studentForm" class="stack">
        <input type="hidden" name="id" value="${current.id}" />
        <div class="form-grid two">
          <label class="field">
            <span>名前</span>
            <input name="name" value="${escapeAttr(current.name)}" required />
          </label>
          <label class="field">
            <span>手のかかる度</span>
            <select name="supportLevel">
              ${[1, 2, 3, 4, 5].map((value) => `<option value="${value}" ${Number(current.supportLevel || 3) === value ? "selected" : ""}>${value}</option>`).join("")}
            </select>
          </label>
        </div>
        <div class="form-grid two">
          <fieldset class="field">
            <legend>希望教科</legend>
            <div class="checkbox-grid">
              ${activeSubjects().map((subject) => checkboxChip("student-subject", subject.id, subject.name, studentRequestsSubject(current.id, subject.id))).join("")}
            </div>
          </fieldset>
          <fieldset class="field">
            <legend>希望講師性別</legend>
            <div class="checkbox-grid">
              ${genders.filter((item) => item.value !== "any").map((item) => checkboxChip("student-gender", item.value, item.label, studentPrefersGender(current.id, item.value))).join("")}
            </div>
          </fieldset>
        </div>
        <div class="form-grid two">
          <fieldset class="field">
            <legend>希望の先生</legend>
            <div class="checkbox-grid">
              ${state.teachers.map((teacher) => checkboxChip("student-pref-preferred", teacher.id, teacher.name, studentPrefersTeacher(current.id, teacher.id, "preferred"))).join("")}
            </div>
          </fieldset>
          <fieldset class="field">
            <legend>希望しない先生</legend>
            <div class="checkbox-grid">
              ${state.teachers.map((teacher) => checkboxChip("student-pref-blocked", teacher.id, teacher.name, studentPrefersTeacher(current.id, teacher.id, "blocked"))).join("")}
            </div>
          </fieldset>
        </div>
        <label class="field">
          <span>メモ</span>
          <textarea name="memo">${escapeHtml(current.memo || "")}</textarea>
        </label>
        <label class="field">
          <span>拡張用フィールド(JSON)</span>
          <textarea name="extraJson">${escapeHtml(JSON.stringify(current.extraJson || {}, null, 2))}</textarea>
        </label>
        <div class="card">
          <h4 class="card-title">可能時間</h4>
          ${renderAvailabilityEditor("student", current.id)}
        </div>
        <div class="action-row">
          <button class="primary-btn" type="submit">保存</button>
        </div>
      </form>
    `;
  }

  function renderAvailabilityEditor(entityType, entityId) {
    const slots = activeSlots();
    const rowGroups = timeRows();
    const selectedIds = new Set(getAvailability(entityType, entityId).map((item) => item.timeSlotId));
    const peers = entityType === "teacher" ? state.teachers : state.students;
    const warning = selectedIds.size ? "" : `<div class="callout warn">可能時間が未入力です。</div>`;
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
        ${warning}
        <div class="availability-grid-wrap">
          <table class="availability-grid">
            <thead>
              <tr>
                <th>時間帯</th>
                ${weekdays.map((day, index) => `<th><button class="ghost-btn" type="button" data-action="toggle-day" data-day="${index + 1}" data-entity-type="${entityType}" data-owner-id="${entityId}">${day}</button></th>`).join("")}
              </tr>
            </thead>
            <tbody>
              ${rowGroups.map((row) => `
                <tr>
                  <td><button class="ghost-btn" type="button" data-action="toggle-time-row" data-key="${escapeAttr(row.key)}" data-entity-type="${entityType}" data-owner-id="${entityId}">${escapeHtml(row.label)}</button></td>
                  ${weekdays.map((day, index) => {
                    const slot = slots.find((item) => item.dayOfWeek === index + 1 && slotKey(item) === row.key);
                    if (!slot) return `<td></td>`;
                    const on = selectedIds.has(slot.id);
                    return `<td>
                      <div class="slot-cell ${on ? "on" : ""}" data-slot-toggle="${slot.id}" data-entity-type="${entityType}" data-owner-id="${entityId}">${on ? "ON" : ""}</div>
                    </td>`;
                  }).join("")}
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderCurrentAssignmentsEditor(teacherId) {
    const rows = state.currentLessonAssignments.filter((item) => item.teacherId === teacherId);
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
          <label class="field">
            <span>生徒</span>
            <select id="currentAssignmentStudent">
              <option value="">選択してください</option>
              ${state.students.map((student) => `<option value="${student.id}">${escapeHtml(student.name)}</option>`).join("")}
            </select>
          </label>
          <label class="field">
            <span>時間帯</span>
            <select id="currentAssignmentSlot">
              <option value="">選択してください</option>
              ${activeSlots().map((slot) => `<option value="${slot.id}">${escapeHtml(slot.label)}</option>`).join("")}
            </select>
          </label>
          <label class="field">
            <span>教科</span>
            <select id="currentAssignmentSubject">
              <option value="">選択してください</option>
              ${activeSubjects().map((subject) => `<option value="${subject.id}">${escapeHtml(subject.name)}</option>`).join("")}
            </select>
          </label>
          <div class="field">
            <span>&nbsp;</span>
            <button class="secondary-btn" type="button" data-action="add-current-assignment" data-teacher-id="${teacherId}">担当追加</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderSlotRow(slot) {
    return `
      <tr>
        <td>${weekdays[slot.dayOfWeek - 1]}</td>
        <td>${escapeHtml(slot.startTime)}</td>
        <td>${escapeHtml(slot.endTime)}</td>
        <td>${escapeHtml(slot.label)}</td>
        <td>${slot.sortOrder}</td>
        <td>${slot.isActive ? "有効" : "無効"}</td>
        <td>
          <button class="ghost-btn" type="button" data-action="edit-slot" data-id="${slot.id}">編集</button>
          <button class="danger-btn" type="button" data-action="delete-slot" data-id="${slot.id}">削除</button>
        </td>
      </tr>
    `;
  }

  function renderSubjectRow(subject) {
    return `
      <tr>
        <td>${escapeHtml(subject.name)}</td>
        <td>${subject.sortOrder}</td>
        <td>${subject.isActive ? "有効" : "無効"}</td>
        <td>
          <button class="ghost-btn" type="button" data-action="edit-subject" data-id="${subject.id}">編集</button>
          <button class="danger-btn" type="button" data-action="delete-subject" data-id="${subject.id}">削除</button>
        </td>
      </tr>
    `;
  }

  function renderSolutionListItem(solution) {
    const selected = solution.id === ui.selectedSolutionId;
    return `
      <button class="entity-item ${selected ? "active" : ""}" type="button" data-select-solution="${solution.id}">
        <h4>候補 ${solution.rank}</h4>
        <div class="entity-meta">
          <span class="tag">総合 ${solution.totalScore}</span>
          <span class="tag">割当 ${solution.assignedCount}</span>
          <span class="tag">未割当 ${solution.unassignedCount}</span>
          ${state.confirmedSolutionId === solution.id ? `<span class="tag">確定済み</span>` : ""}
        </div>
      </button>
    `;
  }

  function renderSolutionDetail(solution) {
    const assignments = scheduleAssignmentsForSolution(solution.id);
    const unassigned = solution.summaryJson.unassigned || [];
    const teacherSummary = summarizeTeachers(assignments);
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
            ${unassigned.length ? `
              <table class="simple-table">
                <thead><tr><th>生徒</th><th>理由</th></tr></thead>
                <tbody>${unassigned.map((item) => `<tr><td>${escapeHtml(studentName(item.studentId))}</td><td>${escapeHtml(item.reason)}</td></tr>`).join("")}</tbody>
              </table>
            ` : `<div class="callout success">未割当はありません。</div>`}
          </div>
          <div class="card">
            <h4 class="card-title">講師別サマリ</h4>
            <table class="simple-table">
              <thead><tr><th>講師</th><th>コマ数</th><th>担当人数</th><th>負担</th></tr></thead>
              <tbody>${teacherSummary.map((item) => `<tr><td>${escapeHtml(item.teacherName)}</td><td>${item.slotCount}</td><td>${item.studentCount}</td><td>${item.load}</td></tr>`).join("")}</tbody>
            </table>
          </div>
        </div>
        <div class="card">
          <h4 class="card-title">曜日・時間帯ごとの割当表</h4>
          ${renderAssignmentMatrix(assignments)}
        </div>
        <div class="card">
          <h4 class="card-title">各割当のスコア内訳</h4>
          <table class="assignments-table">
            <thead><tr><th>生徒</th><th>講師</th><th>時間帯</th><th>教科</th><th>スコア</th><th>内訳</th><th></th></tr></thead>
            <tbody>
              ${assignments.map((assignment) => `
                <tr>
                  <td>${escapeHtml(studentName(assignment.studentId))}</td>
                  <td>${escapeHtml(teacherName(assignment.teacherId))}</td>
                  <td>${escapeHtml(slotLabel(assignment.timeSlotId))}</td>
                  <td>${escapeHtml(subjectName(assignment.subjectId))}</td>
                  <td>${assignment.score}</td>
                  <td>${assignment.scoreBreakdownJson.map((item) => `${escapeHtml(item.label)}: ${item.score}`).join("<br>")}</td>
                  <td>
                    <label class="checkbox-item">
                      <input type="checkbox" data-action="toggle-lock" data-id="${assignment.id}" ${assignment.isLocked ? "checked" : ""} />
                      <span>固定</span>
                    </label>
                    <button class="ghost-btn" type="button" data-action="move-assignment" data-id="${assignment.id}" data-solution-id="${solution.id}">移動</button>
                    <button class="ghost-btn" type="button" data-action="change-teacher" data-id="${assignment.id}" data-solution-id="${solution.id}">講師変更</button>
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderAssignmentMatrix(assignments) {
    const rows = timeRows();
    const active = activeSlots();
    const grouped = {};
    assignments.forEach((item) => {
      const key = `${item.timeSlotId}`;
      grouped[key] = grouped[key] || [];
      grouped[key].push(item);
    });
    return `
      <table class="matrix-table">
        <thead>
          <tr><th>時間帯</th>${weekdays.map((day) => `<th>${day}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${escapeHtml(row.label)}</td>
              ${weekdays.map((day, index) => {
                const slot = active.find((item) => item.dayOfWeek === index + 1 && slotKey(item) === row.key);
                if (!slot) return "<td></td>";
                const items = grouped[slot.id] || [];
                return `<td>${items.length ? items.map((item) => `${escapeHtml(teacherName(item.teacherId))}: ${escapeHtml(studentName(item.studentId))}`).join("<br>") : ""}</td>`;
              }).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  function bindPageEvents() {
    document.querySelectorAll("[data-select-teacher]").forEach((button) =>
      button.addEventListener("click", () => {
        ui.selectedTeacherId = button.dataset.selectTeacher;
        render();
      })
    );
    document.querySelectorAll("[data-select-student]").forEach((button) =>
      button.addEventListener("click", () => {
        ui.selectedStudentId = button.dataset.selectStudent;
        render();
      })
    );
    document.querySelectorAll("[data-select-solution]").forEach((button) =>
      button.addEventListener("click", () => {
        ui.selectedSolutionId = button.dataset.selectSolution;
        render();
      })
    );

    const teacherForm = document.getElementById("teacherForm");
    if (teacherForm) teacherForm.addEventListener("submit", saveTeacher);
    const studentForm = document.getElementById("studentForm");
    if (studentForm) studentForm.addEventListener("submit", saveStudent);

    document.querySelectorAll("[data-slot-toggle]").forEach((cell) => {
      cell.addEventListener("mousedown", (event) => {
        event.preventDefault();
        const next = !cell.classList.contains("on");
        ui.dragValue = next;
        ui.dragActive = true;
        setAvailability(cell.dataset.entityType, cell.dataset.ownerId, cell.dataset.slotToggle, next);
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

    const templateSelect = document.getElementById("templateSelect");
    if (templateSelect) {
      templateSelect.addEventListener("change", () => {
        ui.selectedTemplateId = templateSelect.value;
        render();
      });
    }

    const runSelect = document.getElementById("runSelect");
    if (runSelect) {
      runSelect.addEventListener("change", () => {
        ui.selectedRunId = runSelect.value;
        ui.selectedSolutionId = state.scheduleSolutions.find((item) => item.scheduleRunId === ui.selectedRunId)?.id || null;
        render();
      });
    }

    document.querySelectorAll("[data-copy-source]").forEach((select) => {
      select.addEventListener("change", () => {
        if (!select.value) return;
        copyAvailabilityFromPeer(select.dataset.copySource, select.dataset.ownerId, select.value);
        select.value = "";
        render();
      });
    });
  }

  function bindActions() {
    document.querySelectorAll("[data-action]").forEach((control) => {
      control.addEventListener("click", () => handleAction(control.dataset.action, control.dataset));
    });
  }

  function handleAction(action, payload) {
    if (action === "add-teacher") {
      const teacher = createEmptyTeacher();
      state.teachers.unshift(teacher);
      ui.selectedTeacherId = teacher.id;
      saveState();
      render();
      return;
    }
    if (action === "delete-teacher") return removeTeacher(payload.id);
    if (action === "add-student") {
      const student = createEmptyStudent();
      state.students.unshift(student);
      ui.selectedStudentId = student.id;
      saveState();
      render();
      return;
    }
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
    if (action === "generate-schedule") return generateSchedules();
    if (action === "open-solution") {
      ui.tab = "results";
      ui.selectedSolutionId = payload.id;
      ui.selectedRunId = state.scheduleSolutions.find((item) => item.id === payload.id)?.scheduleRunId || ui.selectedRunId;
      render();
      return;
    }
    if (action === "toggle-lock") return toggleAssignmentLock(payload.id);
    if (action === "confirm-solution") return confirmSolution(payload.id);
    if (action === "regenerate-with-locks") return generateSchedules(true);
    if (action === "move-assignment") return openMoveAssignmentModal(payload.id, payload.solutionId);
    if (action === "change-teacher") return openChangeTeacherModal(payload.id, payload.solutionId);
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
    const id = form.get("id");
    const teacher = state.teachers.find((item) => item.id === id);
    if (!teacher) return;
    teacher.name = String(form.get("name") || "").trim();
    teacher.gender = String(form.get("gender") || "any");
    teacher.memo = String(form.get("memo") || "");
    teacher.extraJson = safeJson(form.get("extraJson"));
    teacher.updatedAt = now();
    state.teacherSubjects = state.teacherSubjects.filter((item) => item.teacherId !== id);
    event.currentTarget.querySelectorAll('input[name="teacher-subject"]:checked').forEach((input) => {
      state.teacherSubjects.push({ id: uid("teacher-subject"), teacherId: id, subjectId: input.value });
    });
    saveState();
    render();
  }

  function saveStudent(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const id = form.get("id");
    const student = state.students.find((item) => item.id === id);
    if (!student) return;
    student.name = String(form.get("name") || "").trim();
    student.supportLevel = Number(form.get("supportLevel") || 3);
    student.memo = String(form.get("memo") || "");
    student.extraJson = safeJson(form.get("extraJson"));
    student.updatedAt = now();
    state.studentSubjectRequests = state.studentSubjectRequests.filter((item) => item.studentId !== id);
    event.currentTarget.querySelectorAll('input[name="student-subject"]:checked').forEach((input, index) => {
      state.studentSubjectRequests.push({ id: uid("student-subject"), studentId: id, subjectId: input.value, priority: index + 1 });
    });
    state.studentGenderPreferences = state.studentGenderPreferences.filter((item) => item.studentId !== id);
    event.currentTarget.querySelectorAll('input[name="student-gender"]:checked').forEach((input, index) => {
      state.studentGenderPreferences.push({ id: uid("student-gender"), studentId: id, gender: input.value, priority: index + 1 });
    });
    state.studentTeacherPreferences = state.studentTeacherPreferences.filter((item) => item.studentId !== id);
    event.currentTarget.querySelectorAll('input[name="student-pref-preferred"]:checked').forEach((input) => {
      state.studentTeacherPreferences.push({ id: uid("student-pref"), studentId: id, teacherId: input.value, preferenceType: "preferred" });
    });
    event.currentTarget.querySelectorAll('input[name="student-pref-blocked"]:checked').forEach((input) => {
      state.studentTeacherPreferences.push({ id: uid("student-pref"), studentId: id, teacherId: input.value, preferenceType: "blocked" });
    });
    saveState();
    render();
  }

  function removeTeacher(id) {
    if (!window.confirm("この講師を削除します。")) return;
    state.teachers = state.teachers.filter((item) => item.id !== id);
    state.teacherSubjects = state.teacherSubjects.filter((item) => item.teacherId !== id);
    state.teacherAvailabilitySlots = state.teacherAvailabilitySlots.filter((item) => item.teacherId !== id);
    state.currentLessonAssignments = state.currentLessonAssignments.filter((item) => item.teacherId !== id);
    state.studentTeacherPreferences = state.studentTeacherPreferences.filter((item) => item.teacherId !== id);
    saveState();
    render();
  }

  function removeStudent(id) {
    if (!window.confirm("この生徒を削除します。")) return;
    state.students = state.students.filter((item) => item.id !== id);
    state.studentAvailabilitySlots = state.studentAvailabilitySlots.filter((item) => item.studentId !== id);
    state.studentSubjectRequests = state.studentSubjectRequests.filter((item) => item.studentId !== id);
    state.studentTeacherPreferences = state.studentTeacherPreferences.filter((item) => item.studentId !== id);
    state.studentGenderPreferences = state.studentGenderPreferences.filter((item) => item.studentId !== id);
    state.currentLessonAssignments = state.currentLessonAssignments.filter((item) => item.studentId !== id);
    saveState();
    render();
  }

  function getAvailability(entityType, entityId) {
    return entityType === "teacher"
      ? state.teacherAvailabilitySlots.filter((item) => item.teacherId === entityId)
      : state.studentAvailabilitySlots.filter((item) => item.studentId === entityId);
  }

  function setAvailability(entityType, entityId, timeSlotId, enabled) {
    const collectionName = entityType === "teacher" ? "teacherAvailabilitySlots" : "studentAvailabilitySlots";
    const key = entityType === "teacher" ? "teacherId" : "studentId";
    const items = state[collectionName];
    const existing = items.find((item) => item[key] === entityId && item.timeSlotId === timeSlotId);
    if (enabled && !existing) items.push({ id: uid("availability"), [key]: entityId, timeSlotId, availabilityLevel: "available" });
    if (!enabled && existing) state[collectionName] = items.filter((item) => item.id !== existing.id);
    saveState();
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
    const peers = entityType === "teacher" ? state.teachers : state.students;
    const currentIndex = peers.findIndex((item) => item.id === entityId);
    if (currentIndex <= 0) return;
    copyAvailabilityFromPeer(entityType, entityId, peers[currentIndex - 1].id);
  }

  function copyAvailabilityFromPeer(entityType, ownerId, sourceId) {
    const collectionName = entityType === "teacher" ? "teacherAvailabilitySlots" : "studentAvailabilitySlots";
    const key = entityType === "teacher" ? "teacherId" : "studentId";
    const source = state[collectionName].filter((item) => item[key] === sourceId);
    state[collectionName] = state[collectionName].filter((item) => item[key] !== ownerId);
    source.forEach((item) => state[collectionName].push({ id: uid("availability-copy"), [key]: ownerId, timeSlotId: item.timeSlotId, availabilityLevel: item.availabilityLevel }));
    saveState();
  }

  function addCurrentAssignment(teacherId) {
    const studentId = document.getElementById("currentAssignmentStudent").value;
    const timeSlotId = document.getElementById("currentAssignmentSlot").value;
    const subjectId = document.getElementById("currentAssignmentSubject").value;
    if (!studentId || !timeSlotId || !subjectId) return;
    state.currentLessonAssignments.push({
      id: uid("current"),
      teacherId,
      studentId,
      subjectId,
      timeSlotId,
      status: "active",
      effectiveFrom: now(),
      effectiveTo: null
    });
    saveState();
    render();
  }

  function deleteCurrentAssignment(id) {
    state.currentLessonAssignments = state.currentLessonAssignments.filter((item) => item.id !== id);
    saveState();
    render();
  }

  function addTemplate() {
    const name = window.prompt("テンプレート名");
    if (!name) return;
    const template = { id: uid("template"), name, isActive: true, createdAt: now(), updatedAt: now() };
    state.timetableTemplates.push(template);
    ui.selectedTemplateId = template.id;
    saveState();
    render();
  }

  function renameTemplate(id) {
    const template = state.timetableTemplates.find((item) => item.id === id);
    if (!template) return;
    const name = window.prompt("新しい名前", template.name);
    if (!name) return;
    template.name = name;
    template.updatedAt = now();
    saveState();
    render();
  }

  function openSlotModal(id) {
    const slot = state.timeSlots.find((item) => item.id === id) || {
      id: uid("slot"),
      timetableTemplateId: ui.selectedTemplateId,
      dayOfWeek: 1,
      startTime: "17:00",
      endTime: "18:30",
      label: "",
      sortOrder: timeSlotsForTemplate(ui.selectedTemplateId).length + 1,
      isActive: true
    };
    openModal(id ? "スロット編集" : "スロット追加", `
      <form id="slotForm" class="stack">
        <input type="hidden" name="id" value="${slot.id}" />
        <div class="form-grid two">
          <label class="field"><span>曜日</span>
            <select name="dayOfWeek">${weekdays.map((day, index) => `<option value="${index + 1}" ${slot.dayOfWeek === index + 1 ? "selected" : ""}>${day}</option>`).join("")}</select>
          </label>
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
        const existing = state.timeSlots.find((item) => item.id === form.get("id"));
        const label = String(form.get("label") || "").trim();
        const day = Number(form.get("dayOfWeek"));
        const startTime = String(form.get("startTime"));
        const endTime = String(form.get("endTime"));
        Object.assign(existing || slot, {
          id: String(form.get("id")),
          timetableTemplateId: ui.selectedTemplateId,
          dayOfWeek: day,
          startTime,
          endTime,
          label: label || `${weekdays[day - 1]} ${startTime}-${endTime}`,
          sortOrder: Number(form.get("sortOrder") || 1),
          isActive: form.get("isActive") === "on"
        });
        if (!existing) state.timeSlots.push(slot);
        closeModal();
        saveState();
        render();
      });
    });
  }

  function deleteSlot(id) {
    if (!window.confirm("このスロットを削除します。")) return;
    state.timeSlots = state.timeSlots.filter((item) => item.id !== id);
    state.teacherAvailabilitySlots = state.teacherAvailabilitySlots.filter((item) => item.timeSlotId !== id);
    state.studentAvailabilitySlots = state.studentAvailabilitySlots.filter((item) => item.timeSlotId !== id);
    state.currentLessonAssignments = state.currentLessonAssignments.filter((item) => item.timeSlotId !== id);
    saveState();
    render();
  }

  function openSubjectModal(id) {
    const subject = state.subjects.find((item) => item.id === id) || { id: uid("subject"), name: "", sortOrder: state.subjects.length + 1, isActive: true };
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
        const existing = state.subjects.find((item) => item.id === form.get("id"));
        Object.assign(existing || subject, {
          id: String(form.get("id")),
          name: String(form.get("name") || "").trim(),
          sortOrder: Number(form.get("sortOrder") || 1),
          isActive: form.get("isActive") === "on"
        });
        if (!existing) state.subjects.push(subject);
        closeModal();
        saveState();
        render();
      });
    });
  }

  function deleteSubject(id) {
    if (!window.confirm("この科目を削除します。")) return;
    state.subjects = state.subjects.filter((item) => item.id !== id);
    state.teacherSubjects = state.teacherSubjects.filter((item) => item.subjectId !== id);
    state.studentSubjectRequests = state.studentSubjectRequests.filter((item) => item.subjectId !== id);
    state.currentLessonAssignments = state.currentLessonAssignments.filter((item) => item.subjectId !== id);
    saveState();
    render();
  }

  function generateSchedules(respectExistingLocks) {
    const candidateCount = Number(document.getElementById("candidateCount")?.value || 5);
    const preserveLocks = respectExistingLocks || document.getElementById("respectLocked")?.checked;
    const runId = uid("run");
    const snapshot = buildInputSnapshot();
    const run = { id: runId, timetableTemplateId: ui.selectedTemplateId, status: "completed", createdAt: now(), inputSnapshotJson: snapshot };
    state.scheduleRuns.unshift(run);

    const lockedAssignments = preserveLocks ? state.scheduleAssignments.filter((item) => item.isLocked) : [];
    const studentsOrderBase = [...state.students].sort((a, b) => candidateHardness(b) - candidateHardness(a));
    const solutions = [];
    const assignments = [];
    const candidateMap = buildCandidateMap();

    for (let variant = 0; variant < candidateCount; variant += 1) {
      const order = variant % 2 === 0 ? studentsOrderBase : [...studentsOrderBase].reverse();
      const result = assignStudentsGreedy(order, candidateMap, lockedAssignments, variant);
      const solutionId = uid("solution");
      const solutionAssignments = result.assignments.map((item) => ({
        id: uid("schedule-assignment"),
        scheduleSolutionId: solutionId,
        teacherId: item.teacherId,
        studentId: item.studentId,
        subjectId: item.subjectId,
        timeSlotId: item.timeSlotId,
        score: item.score,
        scoreBreakdownJson: item.scoreBreakdown,
        isLocked: item.isLocked || false
      }));
      const solution = {
        id: solutionId,
        scheduleRunId: runId,
        rank: variant + 1,
        totalScore: solutionAssignments.reduce((sum, item) => sum + item.score, 0),
        assignedCount: solutionAssignments.length,
        unassignedCount: result.unassigned.length,
        summaryJson: {
          unassigned: result.unassigned
        }
      };
      solutions.push(solution);
      assignments.push(...solutionAssignments);
    }

    solutions.sort((a, b) => b.totalScore - a.totalScore || b.assignedCount - a.assignedCount || a.unassignedCount - b.unassignedCount);
    solutions.forEach((solution, index) => {
      solution.rank = index + 1;
    });

    state.scheduleSolutions = state.scheduleSolutions.filter((item) => item.scheduleRunId !== runId).concat(solutions);
    state.scheduleAssignments = state.scheduleAssignments.filter((item) => item.scheduleSolutionId && !solutions.some((s) => s.id === item.scheduleSolutionId)).concat(assignments);
    ui.selectedRunId = runId;
    ui.selectedSolutionId = solutions[0]?.id || null;
    saveState();
    ui.tab = "results";
    render();
  }

  function buildCandidateMap() {
    const map = {};
    state.students.forEach((student) => {
      const studentSlots = new Set(getAvailability("student", student.id).map((item) => item.timeSlotId));
      const requestedSubjects = studentRequestedSubjects(student.id);
      const blockedTeachers = new Set(studentTeacherPreferences(student.id, "blocked").map((item) => item.teacherId));
      const preferredTeachers = new Set(studentTeacherPreferences(student.id, "preferred").map((item) => item.teacherId));
      const genderPrefs = new Set(studentGenderPreferences(student.id).map((item) => item.gender));
      const entries = [];
      state.teachers.forEach((teacher) => {
        if (blockedTeachers.has(teacher.id)) return;
        const teacherSlots = new Set(getAvailability("teacher", teacher.id).map((item) => item.timeSlotId));
        const commonSlots = [...studentSlots].filter((slotId) => teacherSlots.has(slotId));
        const teacherSubjects = teacherSubjectIds(teacher.id);
        requestedSubjects.forEach((subjectId) => {
          if (!teacherSubjects.includes(subjectId)) return;
          commonSlots.forEach((slotId) => {
            const scoring = [];
            let score = 0;
            scoring.push({ label: "希望教科一致", score: 40 });
            score += 40;
            if (preferredTeachers.has(teacher.id)) {
              scoring.push({ label: "希望先生一致", score: 30 });
              score += 30;
            }
            if (isCurrentTeacher(student.id, teacher.id)) {
              scoring.push({ label: "現在担当継続", score: 20 });
              score += 20;
            }
            if (genderPrefs.size && genderPrefs.has(teacher.gender)) {
              scoring.push({ label: "希望講師性別一致", score: 15 });
              score += 15;
            }
            scoring.push({ label: "手のかかる度バランス基礎", score: 10 });
            score += 10;
            entries.push({ studentId: student.id, teacherId: teacher.id, timeSlotId: slotId, subjectId, score, scoreBreakdown: scoring });
          });
        });
      });
      map[student.id] = entries;
    });
    return map;
  }

  function assignStudentsGreedy(order, candidateMap, lockedAssignments, variantSeed) {
    const assignments = lockedAssignments.map((item) => ({
      teacherId: item.teacherId,
      studentId: item.studentId,
      subjectId: item.subjectId,
      timeSlotId: item.timeSlotId,
      score: item.score,
      scoreBreakdown: item.scoreBreakdownJson,
      isLocked: true
    }));
    const unassigned = [];
    const studentAssigned = new Set(assignments.map((item) => item.studentId));

    order.forEach((student, index) => {
      if (studentAssigned.has(student.id)) return;
      const candidates = (candidateMap[student.id] || [])
        .filter((candidate) => isFeasibleCandidate(candidate, assignments))
        .map((candidate) => {
          const adjusted = adjustCandidateScore(candidate, assignments, variantSeed + index);
          return adjusted;
        })
        .sort((a, b) => b.score - a.score || String(a.teacherId).localeCompare(String(b.teacherId)));

      if (!candidates.length) {
        unassigned.push({ studentId: student.id, reason: explainUnassigned(student, candidateMap[student.id] || [], assignments) });
        return;
      }

      const chosen = candidates[(variantSeed + index) % Math.min(2, candidates.length)];
      assignments.push(chosen);
      studentAssigned.add(student.id);
    });

    return { assignments, unassigned };
  }

  function isFeasibleCandidate(candidate, assignments) {
    const teacherSlotAssignments = assignments.filter((item) => item.teacherId === candidate.teacherId && item.timeSlotId === candidate.timeSlotId);
    if (teacherSlotAssignments.length >= 3) return false;
    if (assignments.some((item) => item.studentId === candidate.studentId && item.timeSlotId === candidate.timeSlotId)) return false;
    return true;
  }

  function adjustCandidateScore(candidate, assignments, salt) {
    const cloned = {
      ...candidate,
      score: candidate.score,
      scoreBreakdown: [...candidate.scoreBreakdown]
    };
    const sameTeacherSlot = assignments.filter((item) => item.teacherId === candidate.teacherId && item.timeSlotId === candidate.timeSlotId);
    const supportLoad = sameTeacherSlot.reduce((sum, item) => sum + supportLoadOfStudent(item.studentId), 0) + supportLoadOfStudent(candidate.studentId);
    if (supportLoad >= 8) {
      cloned.score -= 20;
      cloned.scoreBreakdown.push({ label: "高サポート集中", score: -20 });
    }
    const teacherLoad = assignments.filter((item) => item.teacherId === candidate.teacherId).length;
    const average = assignments.length / Math.max(state.teachers.length, 1);
    if (teacherLoad > average + 1) {
      cloned.score -= 10;
      cloned.scoreBreakdown.push({ label: "講師負担偏り", score: -10 });
    }
    const noise = salt % 3;
    cloned.score += noise;
    cloned.scoreBreakdown.push({ label: "候補多様化", score: noise });
    return cloned;
  }

  function explainUnassigned(student, allCandidates, currentAssignments) {
    if (!allCandidates.length) {
      const requested = studentRequestedSubjects(student.id);
      if (!requested.length) return "希望教科が未設定";
      if (!getAvailability("student", student.id).length) return "生徒の可能時間が未設定";
      return "絶対条件を満たす講師候補がありません";
    }
    const available = allCandidates.filter((candidate) => isFeasibleCandidate(candidate, currentAssignments));
    if (!available.length) return "同時間帯の上限または競合により割当不可";
    return "優先度の高い候補を優先したため未割当";
  }

  function buildInputSnapshot() {
    return {
      teachers: state.teachers,
      students: state.students,
      timeSlots: activeSlots(),
      teacherAvailabilitySlots: state.teacherAvailabilitySlots,
      studentAvailabilitySlots: state.studentAvailabilitySlots,
      teacherSubjects: state.teacherSubjects,
      studentSubjectRequests: state.studentSubjectRequests,
      studentTeacherPreferences: state.studentTeacherPreferences,
      studentGenderPreferences: state.studentGenderPreferences,
      currentLessonAssignments: state.currentLessonAssignments
    };
  }

  function generatorReadiness() {
    const issues = [];
    if (!activeSlots().length) issues.push("有効な時間割スロットがありません。");
    if (!state.teachers.length) issues.push("講師が未登録です。");
    if (!state.students.length) issues.push("生徒が未登録です。");
    if (state.teachers.some((teacher) => !teacher.name)) issues.push("名前未入力の講師がいます。");
    if (state.students.some((student) => !student.name)) issues.push("名前未入力の生徒がいます。");
    if (state.teachers.some((teacher) => !teacherSubjectIds(teacher.id).length)) issues.push("対応教科未設定の講師がいます。");
    if (state.students.some((student) => !studentRequestedSubjects(student.id).length)) issues.push("希望教科未設定の生徒がいます。");
    if (state.teachers.some((teacher) => !getAvailability("teacher", teacher.id).length)) issues.push("可能時間未設定の講師がいます。");
    if (state.students.some((student) => !getAvailability("student", student.id).length)) issues.push("可能時間未設定の生徒がいます。");
    return issues;
  }

  function scheduleAssignmentsForSolution(solutionId) {
    return state.scheduleAssignments.filter((item) => item.scheduleSolutionId === solutionId);
  }

  function toggleAssignmentLock(id) {
    const assignment = state.scheduleAssignments.find((item) => item.id === id);
    if (!assignment) return;
    assignment.isLocked = !assignment.isLocked;
    saveState();
    render();
  }

  function confirmSolution(solutionId) {
    state.confirmedSolutionId = solutionId;
    saveState();
    render();
  }

  function openMoveAssignmentModal(assignmentId, solutionId) {
    const assignment = state.scheduleAssignments.find((item) => item.id === assignmentId);
    if (!assignment) return;
    const options = buildCandidateMap()[assignment.studentId]
      .filter((candidate) => candidate.subjectId === assignment.subjectId)
      .filter((candidate) => candidate.teacherId === assignment.teacherId)
      .filter((candidate) => candidate.timeSlotId !== assignment.timeSlotId);
    if (!options.length) {
      window.alert("移動可能な別枠がありません。");
      return;
    }
    openModal("生徒を別枠に移動", `
      <form id="moveAssignmentForm" class="stack">
        <input type="hidden" name="assignmentId" value="${assignment.id}" />
        <label class="field">
          <span>移動先時間帯</span>
          <select name="timeSlotId">
            ${options.map((candidate) => `<option value="${candidate.timeSlotId}">${escapeHtml(slotLabel(candidate.timeSlotId))}</option>`).join("")}
          </select>
        </label>
        <button class="primary-btn" type="submit">反映</button>
      </form>
    `, () => {
      document.getElementById("moveAssignmentForm").addEventListener("submit", (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        assignment.timeSlotId = String(form.get("timeSlotId"));
        assignment.isLocked = true;
        saveState();
        closeModal();
        ui.selectedSolutionId = solutionId;
        render();
      });
    });
  }

  function openChangeTeacherModal(assignmentId, solutionId) {
    const assignment = state.scheduleAssignments.find((item) => item.id === assignmentId);
    if (!assignment) return;
    const options = buildCandidateMap()[assignment.studentId]
      .filter((candidate) => candidate.subjectId === assignment.subjectId)
      .filter((candidate) => candidate.timeSlotId === assignment.timeSlotId)
      .filter((candidate) => candidate.teacherId !== assignment.teacherId);
    if (!options.length) {
      window.alert("変更可能な講師候補がありません。");
      return;
    }
    openModal("講師を変更", `
      <form id="changeTeacherForm" class="stack">
        <input type="hidden" name="assignmentId" value="${assignment.id}" />
        <label class="field">
          <span>変更先講師</span>
          <select name="teacherId">
            ${options.map((candidate) => `<option value="${candidate.teacherId}">${escapeHtml(teacherName(candidate.teacherId))}</option>`).join("")}
          </select>
        </label>
        <button class="primary-btn" type="submit">反映</button>
      </form>
    `, () => {
      document.getElementById("changeTeacherForm").addEventListener("submit", (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        assignment.teacherId = String(form.get("teacherId"));
        assignment.isLocked = true;
        saveState();
        closeModal();
        ui.selectedSolutionId = solutionId;
        render();
      });
    });
  }

  function summarizeTeachers(assignments) {
    return state.teachers.map((teacher) => {
      const items = assignments.filter((item) => item.teacherId === teacher.id);
      const uniqueSlots = new Set(items.map((item) => item.timeSlotId));
      return {
        teacherName: teacher.name,
        slotCount: uniqueSlots.size,
        studentCount: items.length,
        load: items.reduce((sum, item) => sum + supportLoadOfStudent(item.studentId), 0)
      };
    });
  }

  function seedSampleData() {
    if (state.teachers.length || state.students.length) {
      if (!window.confirm("既存データに追加でサンプルを入れます。よろしいですか。")) return;
    }
    const math = activeSubjects()[0]?.id;
    const english = activeSubjects()[1]?.id || math;
    const [slot1, slot2, slot3, slot4, slot5] = activeSlots();
    const teacherA = { id: uid("teacher"), name: "佐藤先生", gender: "female", memo: "", extraJson: {}, createdAt: now(), updatedAt: now() };
    const teacherB = { id: uid("teacher"), name: "田中先生", gender: "male", memo: "", extraJson: {}, createdAt: now(), updatedAt: now() };
    const teacherC = { id: uid("teacher"), name: "鈴木先生", gender: "female", memo: "", extraJson: {}, createdAt: now(), updatedAt: now() };
    state.teachers.push(teacherA, teacherB, teacherC);
    state.teacherSubjects.push(
      { id: uid("ts"), teacherId: teacherA.id, subjectId: math },
      { id: uid("ts"), teacherId: teacherA.id, subjectId: english },
      { id: uid("ts"), teacherId: teacherB.id, subjectId: math },
      { id: uid("ts"), teacherId: teacherC.id, subjectId: english }
    );
    [slot1, slot2, slot3, slot4].forEach((slot) => state.teacherAvailabilitySlots.push({ id: uid("ta"), teacherId: teacherA.id, timeSlotId: slot.id, availabilityLevel: "available" }));
    [slot2, slot3, slot4, slot5].forEach((slot) => state.teacherAvailabilitySlots.push({ id: uid("ta"), teacherId: teacherB.id, timeSlotId: slot.id, availabilityLevel: "available" }));
    [slot1, slot3, slot5].forEach((slot) => state.teacherAvailabilitySlots.push({ id: uid("ta"), teacherId: teacherC.id, timeSlotId: slot.id, availabilityLevel: "available" }));

    const students = [
      ["山田花子", 4, [math], [slot1, slot2], teacherA.id, "female"],
      ["中村蓮", 2, [math], [slot2, slot3], teacherB.id, "male"],
      ["高橋葵", 5, [english], [slot1, slot3], teacherA.id, "female"],
      ["伊藤陽", 3, [english], [slot3, slot5], teacherC.id, ""]
    ].map(([name, supportLevel, subjects, slots, preferredTeacher, gender]) => ({
      student: { id: uid("student"), name, supportLevel, memo: "", extraJson: {}, createdAt: now(), updatedAt: now() },
      subjects,
      slots,
      preferredTeacher,
      gender
    }));
    students.forEach((entry) => {
      state.students.push(entry.student);
      entry.subjects.forEach((subjectId, index) => state.studentSubjectRequests.push({ id: uid("ss"), studentId: entry.student.id, subjectId, priority: index + 1 }));
      entry.slots.forEach((slot) => state.studentAvailabilitySlots.push({ id: uid("sa"), studentId: entry.student.id, timeSlotId: slot.id, availabilityLevel: "available" }));
      state.studentTeacherPreferences.push({ id: uid("pref"), studentId: entry.student.id, teacherId: entry.preferredTeacher, preferenceType: "preferred" });
      if (entry.gender) state.studentGenderPreferences.push({ id: uid("gender"), studentId: entry.student.id, gender: entry.gender, priority: 1 });
    });
    ui.selectedTeacherId = teacherA.id;
    ui.selectedStudentId = students[0].student.id;
    saveState();
    render();
  }

  function teacherSubjectIds(teacherId) {
    return state.teacherSubjects.filter((item) => item.teacherId === teacherId).map((item) => item.subjectId);
  }

  function teacherSubjectNames(teacherId) {
    return teacherSubjectIds(teacherId).map(subjectName);
  }

  function teacherHasSubject(teacherId, subjectId) {
    return state.teacherSubjects.some((item) => item.teacherId === teacherId && item.subjectId === subjectId);
  }

  function studentRequestedSubjects(studentId) {
    return state.studentSubjectRequests
      .filter((item) => item.studentId === studentId)
      .sort((a, b) => a.priority - b.priority)
      .map((item) => item.subjectId);
  }

  function studentRequestedSubjectNames(studentId) {
    return studentRequestedSubjects(studentId).map(subjectName);
  }

  function studentRequestsSubject(studentId, subjectId) {
    return state.studentSubjectRequests.some((item) => item.studentId === studentId && item.subjectId === subjectId);
  }

  function studentTeacherPreferences(studentId, type) {
    return state.studentTeacherPreferences.filter((item) => item.studentId === studentId && item.preferenceType === type);
  }

  function studentPrefersTeacher(studentId, teacherId, type) {
    return state.studentTeacherPreferences.some((item) => item.studentId === studentId && item.teacherId === teacherId && item.preferenceType === type);
  }

  function studentGenderPreferences(studentId) {
    return state.studentGenderPreferences.filter((item) => item.studentId === studentId);
  }

  function studentPrefersGender(studentId, gender) {
    return state.studentGenderPreferences.some((item) => item.studentId === studentId && item.gender === gender);
  }

  function timeSlotsForTemplate(templateId) {
    return state.timeSlots.filter((slot) => slot.timetableTemplateId === templateId).sort((a, b) => a.sortOrder - b.sortOrder || a.dayOfWeek - b.dayOfWeek);
  }

  function activeSlots() {
    return timeSlotsForTemplate(ui.selectedTemplateId).filter((slot) => slot.isActive);
  }

  function activeSubjects() {
    return [...state.subjects].filter((item) => item.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
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
    return state.subjects.find((item) => item.id === id)?.name || "未設定";
  }

  function teacherName(id) {
    return state.teachers.find((item) => item.id === id)?.name || "未設定";
  }

  function studentName(id) {
    return state.students.find((item) => item.id === id)?.name || "未設定";
  }

  function slotLabel(id) {
    return state.timeSlots.find((item) => item.id === id)?.label || "未設定";
  }

  function genderLabel(value) {
    return genders.find((item) => item.value === value)?.label || "指定なし";
  }

  function supportLoadOfStudent(studentId) {
    const level = state.students.find((item) => item.id === studentId)?.supportLevel || 3;
    if (level <= 2) return 1;
    if (level === 3) return 2;
    if (level === 4) return 3;
    return 4;
  }

  function candidateHardness(student) {
    const candidateCount = buildCandidateMap()[student.id]?.length || 0;
    return (student.supportLevel || 3) * 10 + (candidateCount ? 100 / candidateCount : 1000);
  }

  function isCurrentTeacher(studentId, teacherId) {
    return state.currentLessonAssignments.some((item) => item.studentId === studentId && item.teacherId === teacherId && item.status === "active");
  }

  function checkboxChip(name, value, label, checked) {
    return `
      <label class="chip ${checked ? "active" : ""}">
        <input type="checkbox" name="${name}" value="${value}" ${checked ? "checked" : ""} />
        <span>${escapeHtml(label)}</span>
      </label>
    `;
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

  function uid(prefix) {
    return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
  }

  function now() {
    return new Date().toISOString();
  }

  function formatDateTime(iso) {
    return new Date(iso).toLocaleString("ja-JP");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replaceAll("'", "&#39;");
  }
})();
