// =====================================================
// 🔒 SAFETY PATCH（Toggl直叩き防止）
// =====================================================
(() => {
  if (typeof window.fetch !== "function") return;
  const originalFetch = window.fetch.bind(window);

  window.fetch = function (input, init = {}) {
    const url =
      typeof input === "string"
        ? input
        : input instanceof Request
        ? input.url
        : "";

    if (url && url.includes("api.track.toggl.com") && !url.includes("/api/proxy")) {
      console.error("🚨 BLOCKED: Direct Toggl API call", url);
      throw new Error("Direct Toggl API call blocked. Use proxy.");
    }
    return originalFetch(input, init);
  };
})();

// =====================================================
// 定数
// =====================================================
// ▼どっちかに合わせてね（404対策の最重要ポイント）
// const PROXY_URL = "/api/proxy";
const PROXY_URL = "https://company-notion-toggl-api.vercel.app/api/proxy";

const TOGGL_V9_BASE_URL = "https://api.track.toggl.com/api/v9";

const STATUS_RUNNING = "進行中";
const STATUS_COMPLETE = "完了";
const STATUS_PAUSE = "保留";

// =====================================================
// 状態
// =====================================================
const settings = {
  notionToken: "",
  humanUserId: "",
  togglApiToken: "",
  togglWorkspaceId: "",
  notionDatabases: [], // [{name,id}]
  databases: [],       // [{name,id}] 正規化済み

  currentTask: null,   // {id, dbId, title, togglEntryId}
  startTime: null,
  timerInterval: null,
};

let dom = null;
const dbPropsCache = {}; // dbId -> {titleProp,statusProp}

// =====================================================
// DOM取得
// =====================================================
function getDomElements() {
  return {
    mainView: document.getElementById("mainView"),
    settingsView: document.getElementById("settingsView"),

    toggleSettingsButton: document.getElementById("toggleSettings"),
    cancelConfigButton: document.getElementById("cancelConfig"),
    saveConfigButton: document.getElementById("saveConfig"),

    confNotionToken: document.getElementById("confNotionToken"),
    confNotionUserId: document.getElementById("confNotionUserId"),
    confTogglToken: document.getElementById("confTogglToken"),
    confTogglWid: document.getElementById("confTogglWid"),

    dbConfigContainer: document.getElementById("dbConfigContainer"),
    addDbConfigButton: document.getElementById("addDbConfig"),

    taskDbFilter: document.getElementById("taskDbFilter"),
    reloadTasksButton: document.getElementById("reloadTasks"),
    taskListContainer: document.getElementById("taskListContainer"),

    startExistingTask: document.getElementById("startExistingTask"),
    startNewTask: document.getElementById("startNewTask"),
    existingTaskTab: document.getElementById("existingTaskTab"),
    newTaskTab: document.getElementById("newTaskTab"),

    runningTaskContainer: document.getElementById("runningTaskContainer"),
    runningTaskTitle: document.getElementById("runningTaskTitle"),
    runningTimer: document.getElementById("runningTimer"),
    thinkingLogInput: document.getElementById("thinkingLogInput"),

    stopTaskButton: document.getElementById("stopTaskButton"),
    completeTaskButton: document.getElementById("completeTaskButton"),

    startNewTaskButton: document.getElementById("startNewTaskButton"),
    newTaskTitle: document.getElementById("newTaskTitle"),
  };
}

// =====================================================
// Utility
// =====================================================
function normalizeDbId(id) {
  return String(id || "").replace(/-/g, "").trim();
}

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function showNotification(message, duration = 2200) {
  let n = document.getElementById("appNotification");
  if (!n) {
    n = document.createElement("div");
    n.id = "appNotification";
    n.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #333;
      color: #fff;
      padding: 10px 16px;
      border-radius: 8px;
      z-index: 9999;
      font-size: 14px;
      opacity: 0;
      transition: opacity .2s;
      max-width: 80vw;
      white-space: pre-wrap;
    `;
    document.body.appendChild(n);
  }
  n.textContent = message;
  n.style.opacity = "1";
  clearTimeout(n._timer);
  n._timer = setTimeout(() => (n.style.opacity = "0"), duration);
}

// =====================================================
// LocalStorage
// =====================================================
function loadSettings() {
  settings.notionToken = localStorage.getItem("notionToken") || "";
  settings.humanUserId = localStorage.getItem("humanUserId") || "";
  settings.togglApiToken = localStorage.getItem("togglApiToken") || "";
  settings.togglWorkspaceId = localStorage.getItem("togglWorkspaceId") || "";

  try {
    settings.notionDatabases = JSON.parse(localStorage.getItem("notionDatabases") || "[]");
    if (!Array.isArray(settings.notionDatabases)) settings.notionDatabases = [];
  } catch {
    settings.notionDatabases = [];
  }

  // 実行中復元（任意）
  try {
    const running = JSON.parse(localStorage.getItem("runningTask") || "null");
    if (running?.task && running?.startTime) {
      settings.currentTask = running.task;
      settings.startTime = running.startTime;
    }
  } catch {}
}

function saveSettings() {
  localStorage.setItem("notionToken", settings.notionToken);
  localStorage.setItem("humanUserId", settings.humanUserId);
  localStorage.setItem("togglApiToken", settings.togglApiToken);
  localStorage.setItem("togglWorkspaceId", settings.togglWorkspaceId);
  localStorage.setItem("notionDatabases", JSON.stringify(settings.notionDatabases));

  if (settings.currentTask && settings.startTime) {
    localStorage.setItem("runningTask", JSON.stringify({ task: settings.currentTask, startTime: settings.startTime }));
  } else {
    localStorage.removeItem("runningTask");
  }
}

// =====================================================
// Proxy API
// =====================================================
async function externalApi(targetUrl, method, auth, body = null) {
  const res = await fetch(PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      targetUrl,
      method,
      tokenKey: auth.tokenKey,
      tokenValue: auth.tokenValue,
      notionVersion: auth.notionVersion,
      body,
    }),
  });

  const text = await res.text();

  if (!res.ok) {
    // ここが「エラーが無い」問題を潰す：必ずログ出す
    console.error("❌ Proxy/API Error:", res.status, text);
    throw new Error(`Proxy Error ${res.status}: ${text}`);
  }

  if (res.status === 204) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function notionApi(endpoint, method = "GET", body = null) {
  if (!settings.notionToken) throw new Error("Notion token missing");
  return externalApi(
    `https://api.notion.com/v1${endpoint}`,
    method,
    {
      tokenKey: "notionToken",
      tokenValue: settings.notionToken,
      notionVersion: "2022-06-28",
    },
    body
  );
}

function togglApi(url, method = "GET", body = null) {
  if (!settings.togglApiToken) throw new Error("Toggl token missing");
  return externalApi(
    url,
    method,
    {
      tokenKey: "togglApiToken",
      tokenValue: settings.togglApiToken,
    },
    body
  );
}

// =====================================================
// 設定UI
// =====================================================
function renderDbConfigForms() {
  dom.dbConfigContainer.innerHTML = "";

  if (!Array.isArray(settings.notionDatabases) || settings.notionDatabases.length === 0) {
    settings.notionDatabases = [{ name: "", id: "" }];
  }

  settings.notionDatabases.forEach((db, i) => {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.gap = "10px";
    row.style.marginBottom = "8px";

    row.innerHTML = `
      <input class="input-field db-name" data-i="${i}" placeholder="DB表示名（例：タスク）" value="${db.name || ""}">
      <input class="input-field db-id" data-i="${i}" placeholder="Notion Database ID" value="${db.id || ""}">
    `;
    dom.dbConfigContainer.appendChild(row);
  });
}

function showSettingsView() {
  dom.confNotionToken.value = settings.notionToken || "";
  dom.confNotionUserId.value = settings.humanUserId || "";
  dom.confTogglToken.value = settings.togglApiToken || "";
  dom.confTogglWid.value = settings.togglWorkspaceId || "";

  renderDbConfigForms();

  dom.settingsView.classList.remove("hidden");
  dom.mainView.classList.add("hidden");
}

function hideSettingsView() {
  dom.settingsView.classList.add("hidden");
  dom.mainView.classList.remove("hidden");
}

// =====================================================
// Notion: DB一覧反映（taskDbFilter）
// =====================================================
async function fetchDatabaseList() {
  // 設定されたDBをそのままフィルタに出す（Notion APIで検証もする）
  const valid = [];

  for (const cfg of settings.notionDatabases) {
    const name = (cfg?.name || "").trim();
    const rawId = (cfg?.id || "").trim();
    const dbId = normalizeDbId(rawId);
    if (!name || !dbId) continue;

    // Notionに実在チェック（失敗してもUI上は残すか迷うが、今回は確実にしたいので弾く）
    try {
      const res = await notionApi(`/databases/${dbId}`, "GET");
      valid.push({ id: res.id, name });
    } catch (e) {
      console.warn("⚠️ DB取得失敗:", name, rawId, e.message);
    }
  }

  settings.databases = valid;

  // フィルタ描画
  if (!dom.taskDbFilter) return;
  if (valid.length === 0) {
    dom.taskDbFilter.innerHTML = `<option value="">DBが見つかりません（共有設定/ID/Tokenを確認）</option>`;
    return;
  }

  const current = dom.taskDbFilter.value || valid[0].id;
  dom.taskDbFilter.innerHTML = valid
    .map((d) => `<option value="${d.id}" ${d.id === current ? "selected" : ""}>${d.name}</option>`)
    .join("");
}

// =====================================================
// Notion: DBプロパティ取得（title/status）
// =====================================================
async function getDbProps(dbId) {
  if (dbPropsCache[dbId]) return dbPropsCache[dbId];

  const db = await notionApi(`/databases/${dbId}`, "GET");
  const props = db?.properties || {};

  let titleProp = null;
  let statusProp = null;

  for (const [name, p] of Object.entries(props)) {
    if (!titleProp && p?.type === "title") titleProp = name;
    if (!statusProp && (p?.type === "status" || p?.type === "select")) {
      // 「ステータス」っぽいものを優先したい場合は name で判定も可
      if (name.includes("ステータス") || name.toLowerCase().includes("status")) {
        statusProp = { name, type: p.type, options: (p[p.type]?.options || []) };
      }
    }
  }

  // statusが見つからなければ typeで最初のstatus/selectを拾う
  if (!statusProp) {
    for (const [name, p] of Object.entries(props)) {
      if (p?.type === "status") statusProp = { name, type: "status", options: (p.status?.options || []) };
      if (!statusProp && p?.type === "select") statusProp = { name, type: "select", options: (p.select?.options || []) };
      if (statusProp) break;
    }
  }

  dbPropsCache[dbId] = { titleProp, statusProp };
  return dbPropsCache[dbId];
}

function getPageTitle(page, titlePropName) {
  try {
    const arr = page?.properties?.[titlePropName]?.title || [];
    return arr.map((x) => x?.plain_text || "").join("").trim() || "無題";
  } catch {
    return "無題";
  }
}

// =====================================================
// Notion: タスク読み込み & 描画
// =====================================================
async function loadTasks() {
  if (!dom.taskListContainer) return;

  const dbId = dom.taskDbFilter?.value;
  if (!dbId) {
    dom.taskListContainer.innerHTML = "<p>DBが選択されていません。</p>";
    return;
  }

  dom.taskListContainer.innerHTML = "<p>読み込み中...</p>";

  try {
    const { titleProp } = await getDbProps(dbId);
    if (!titleProp) throw new Error("titleプロパティが見つかりません（Notion DBにタイトル列が必要）");

    const body = {
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
      // filterは今は付けない（確実に見えること優先）
    };

    console.log("📡 Notion query:", dbId);
    const res = await notionApi(`/databases/${dbId}/query`, "POST", body);
    const tasks = res?.results || [];

    renderTaskList(tasks, dbId, titleProp);
  } catch (e) {
    console.error(e);
    dom.taskListContainer.innerHTML = `<p style="color:red;">エラー: ${e.message}</p>`;
  }
}

function renderTaskList(tasks, dbId, titleProp) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    dom.taskListContainer.innerHTML = "<p>タスクがありません。</p>";
    return;
  }

  const ul = document.createElement("ul");
  ul.className = "task-list";

  tasks.forEach((page) => {
    const title = getPageTitle(page, titleProp);

    const li = document.createElement("li");

    const left = document.createElement("div");
    left.textContent = title;
    left.style.flex = "1";

    const btn = document.createElement("button");
    btn.textContent = "▶ 開始";
    btn.className = "btn btn-green";

    btn.onclick = () => startTask({ id: page.id, dbId, title });

    li.appendChild(left);
    li.appendChild(btn);
    ul.appendChild(li);
  });

  dom.taskListContainer.innerHTML = "";
  dom.taskListContainer.appendChild(ul);
}

// =====================================================
// Toggl start/stop
// =====================================================
async function startToggl(title) {
  if (!settings.togglWorkspaceId) throw new Error("Toggl workspaceId missing");

  const url = `${TOGGL_V9_BASE_URL}/time_entries`;
  const body = {
    workspace_id: Number(settings.togglWorkspaceId),
    description: title,
    created_with: "Notion Toggl Timer",
    start: new Date().toISOString(),
    duration: -1,
  };

  const res = await togglApi(url, "POST", body);
  return res; // {id,...}
}

async function stopToggl(entryId) {
  const wid = settings.togglWorkspaceId;
  const url = `${TOGGL_V9_BASE_URL}/workspaces/${wid}/time_entries/${entryId}/stop`;
  return togglApi(url, "PATCH");
}

// =====================================================
// Notion: ステータス更新（あれば）
// =====================================================
async function updateNotionStatus(task, nextStatusName) {
  const { statusProp } = await getDbProps(task.dbId);
  if (!statusProp?.name) return; // ステータス列が無いならスキップ

  const opt = (statusProp.options || []).find((o) => o.name === nextStatusName);
  if (!opt) return; // そのステータス名がDBに無いならスキップ

  const patch = { properties: {} };
  if (statusProp.type === "status") patch.properties[statusProp.name] = { status: { id: opt.id } };
  if (statusProp.type === "select") patch.properties[statusProp.name] = { select: { id: opt.id } };

  await notionApi(`/pages/${task.id}`, "PATCH", patch);
}

// =====================================================
// 実行中UI
// =====================================================
function updateTimer() {
  if (settings.startTime && dom.runningTimer) {
    dom.runningTimer.textContent = formatTime(Date.now() - settings.startTime);
  }
}

function showRunning(task) {
  dom.runningTaskTitle.textContent = task.title;
  dom.runningTaskContainer.classList.remove("hidden");
}

function hideRunning() {
  dom.runningTaskContainer.classList.add("hidden");
  if (dom.runningTimer) dom.runningTimer.textContent = "00:00:00";
}

// =====================================================
// タスク開始/停止/完了
// =====================================================
async function startTask(task) {
  if (settings.currentTask) {
    alert("すでにタスク実行中です。停止/完了してから開始してください。");
    return;
  }

  try {
    showNotification(`開始: ${task.title}`);
    const entry = await startToggl(task.title);

    settings.currentTask = { ...task, togglEntryId: entry?.id || null };
    settings.startTime = Date.now();
    saveSettings();

    // Notion status -> 進行中（あれば）
    try {
      await updateNotionStatus(task, STATUS_RUNNING);
    } catch (e) {
      console.warn("Notion status update failed:", e.message);
    }

    showRunning(task);

    if (!settings.timerInterval) settings.timerInterval = setInterval(updateTimer, 1000);
    updateTimer();
  } catch (e) {
    console.error(e);
    alert(`開始に失敗: ${e.message}`);
    settings.currentTask = null;
    settings.startTime = null;
    saveSettings();
    hideRunning();
  }
}

async function stopCurrentTask(isComplete) {
  const task = settings.currentTask;
  if (!task?.togglEntryId) {
    alert("実行中タスクがありません");
    return;
  }

  try {
    showNotification(isComplete ? "完了処理中..." : "停止処理中...");

    await stopToggl(task.togglEntryId);

    // Notion status -> 完了 or 保留（あれば）
    try {
      await updateNotionStatus(task, isComplete ? STATUS_COMPLETE : STATUS_PAUSE);
    } catch (e) {
      console.warn("Notion status update failed:", e.message);
    }

    // 状態クリア
    settings.currentTask = null;
    settings.startTime = null;
    saveSettings();

    if (settings.timerInterval) {
      clearInterval(settings.timerInterval);
      settings.timerInterval = null;
    }

    hideRunning();
    showNotification(isComplete ? "完了しました" : "停止しました");

    // タスク再読み込み
    await loadTasks();
  } catch (e) {
    console.error(e);
    alert(`停止/完了に失敗: ${e.message}\n（Toggl側が止まってない可能性あるので確認してね）`);

    // 詰まり防止で落とす
    settings.currentTask = null;
    settings.startTime = null;
    saveSettings();
    hideRunning();

    if (settings.timerInterval) {
      clearInterval(settings.timerInterval);
      settings.timerInterval = null;
    }
  }
}

// =====================================================
// 新規タスク作成（Notionにページ作成して打刻開始）
// =====================================================
async function createNotionTaskAndStart() {
  const title = dom.newTaskTitle?.value?.trim() || "";
  const dbId = dom.taskDbFilter?.value;

  if (!title) return alert("タスク名を入力してください");
  if (!dbId) return alert("DBを選択してください");

  try {
    const { titleProp } = await getDbProps(dbId);
    if (!titleProp) throw new Error("titleプロパティが見つかりません");

    const createRes = await notionApi("/pages", "POST", {
      parent: { database_id: dbId },
      properties: {
        [titleProp]: { title: [{ text: { content: title } }] },
      },
    });

    dom.newTaskTitle.value = "";
    await startTask({ id: createRes.id, dbId, title });
  } catch (e) {
    console.error(e);
    alert(`新規タスク作成に失敗: ${e.message}`);
  }
}

// =====================================================
// タブ切替（既存/新規）
// =====================================================
function switchTab(target) {
  dom.startExistingTask.classList.remove("active");
  dom.startNewTask.classList.remove("active");

  if (target === "existing") {
    dom.startExistingTask.classList.add("active");
    dom.existingTaskTab.classList.remove("hidden");
    dom.newTaskTab.classList.add("hidden");
  } else {
    dom.startNewTask.classList.add("active");
    dom.existingTaskTab.classList.add("hidden");
    dom.newTaskTab.classList.remove("hidden");
  }
}

// =====================================================
// Init
// =====================================================
async function bootstrap() {
  // 設定が揃ってたらDB一覧→タスク読み込み
  if (settings.notionToken && settings.notionDatabases?.length > 0) {
    await fetchDatabaseList();
    await loadTasks();
  } else {
    // 初回は設定画面へ
    showSettingsView();
  }

  // 実行中復元
  if (settings.currentTask && settings.startTime) {
    showRunning(settings.currentTask);
    if (!settings.timerInterval) settings.timerInterval = setInterval(updateTimer, 1000);
    updateTimer();
  }
}

function init() {
  dom = getDomElements();
  loadSettings();

  console.log("✅ init 完了", dom);

  // 設定ボタン
  dom.toggleSettingsButton.onclick = showSettingsView;
  dom.cancelConfigButton.onclick = hideSettingsView;

  dom.addDbConfigButton.onclick = () => {
    settings.notionDatabases.push({ name: "", id: "" });
    renderDbConfigForms();
  };

  dom.saveConfigButton.onclick = async () => {
    settings.notionToken = dom.confNotionToken.value.trim();
    settings.humanUserId = dom.confNotionUserId.value.trim();
    settings.togglApiToken = dom.confTogglToken.value.trim();
    settings.togglWorkspaceId = dom.confTogglWid.value.trim();

    const names = document.querySelectorAll(".db-name");
    const ids = document.querySelectorAll(".db-id");

    const newDb = [];
    names.forEach((n, i) => {
      const name = (n.value || "").trim();
      const id = (ids[i].value || "").trim();
      if (name && id) newDb.push({ name, id });
    });

    settings.notionDatabases = newDb;
    saveSettings();

    showNotification("設定を保存しました");
    hideSettingsView();

    // ここが重要：保存後にDB一覧とタスクをロード
    try {
      await fetchDatabaseList();
      await loadTasks();
    } catch (e) {
      alert(`設定後の読み込みに失敗: ${e.message}`);
      console.error(e);
    }
  };

  // タブ
  dom.startExistingTask.onclick = () => switchTab("existing");
  dom.startNewTask.onclick = () => switchTab("new");

  // DB選択・リロード
  dom.taskDbFilter.onchange = () => loadTasks();
  dom.reloadTasksButton.onclick = () => loadTasks();

  // 実行中操作（停止・完了）
  dom.stopTaskButton.onclick = () => stopCurrentTask(false);
  dom.completeTaskButton.onclick = () => stopCurrentTask(true);

  // 新規タスク
  dom.startNewTaskButton.onclick = createNotionTaskAndStart;

  // 初期ロード
  bootstrap().catch((e) => {
    console.error(e);
    showNotification(`起動エラー: ${e.message}`, 5000);
  });
}

init();
