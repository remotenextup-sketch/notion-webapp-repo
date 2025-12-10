// ============================================================
// Notion Toggl Timer - Web App (app.js) - 改修・統合版
// ============================================================

// ★★★ ここにVercelで取得したURLを設定します！ ★★★
// 【重要】PROXY_URLが重複して宣言されていないか確認してください。
const PROXY_URL = 'https://[あなたのVercelドメイン].vercel.app/api/proxy';
// ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★

// グローバル状態
let localRunningTask = null;
let intervalId = null;
let allNotionTasks = []; // タスク一覧の全データを保持
let dbConfig = { projects: [], categories: [], departments: [] }; // DBのオプション情報を保持

// DOM要素の参照 (UI要素追加に伴い更新)
const els = {
    mainView: document.getElementById('mainView'),
    settingsView: document.getElementById('settingsView'),
    runningCont: document.getElementById('runningTaskContainer'),
    selectionSec: document.getElementById('taskSelectionSection'),
    existingCont: document.getElementById('existingTaskContainer'),
    newCont: document.getElementById('newTaskContainer'),
    taskList: document.getElementById('taskList'),
    // KPI要素
    kpiPanel: document.getElementById('kpiPanel'),
    kpiWeek: document.getElementById('kpiWeek'),
    kpiMonth: document.getElementById('kpiMonth'),
    kpiCategoryContainer: document.getElementById('kpiCategoryContainer'),
    // フィルタ要素
    projectFilter: document.getElementById('projectFilter'),
    // 新規タスク要素
    newDeptContainer: document.getElementById('newDeptContainer'),
    newCatContainer: document.getElementById('newCatContainer'),
    // 設定入力
    c_nToken: document.getElementById('confNotionToken'),
    c_nDbId: document.getElementById('confNotionDbId'),
    c_nUserId: document.getElementById('confNotionUserId'),
    c_tToken: document.getElementById('confTogglToken'),
    c_tWid: document.getElementById('confTogglWid')
};

// ==========================================
// 1. 初期化 & 設定周り
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    // ボタンイベント設定
    document.getElementById('toggleSettings').addEventListener('click', showSettings);
    document.getElementById('saveConfig').addEventListener('click', saveSettings);
    document.getElementById('cancelConfig').addEventListener('click', hideSettings);
    
    document.getElementById('reloadTasks').addEventListener('click', loadTasksAndKpi); 
    document.getElementById('pauseButton').addEventListener('click', handlePause);
    document.getElementById('completeButton').addEventListener('click', handleComplete);
    document.getElementById('forceStopButton').addEventListener('click', handleForceStop);
    document.getElementById('startNewTaskButton').addEventListener('click', handleStartNew);
    
    document.querySelectorAll('input[name="taskMode"]').forEach(r => r.addEventListener('change', toggleMode));
    els.projectFilter.addEventListener('change', renderTaskList); 

    // 設定ロード
    const config = loadConfig();
    if (!config.notionToken || !config.togglApiToken) {
        showSettings(); 
    } else {
        await initializeApp();
    }
});

async function initializeApp() {
    await checkRunningState(); 
    await loadDbConfig(); // 設定情報をロード (新規タスクUIに必要)
    await loadTasksAndKpi(); // タスク一覧とKPIをロード
}

function loadConfig() {
    return {
        notionToken: localStorage.getItem('notionToken') || '',
        notionDatabaseId: localStorage.getItem('notionDatabaseId') || '',
        notionUserId: localStorage.getItem('notionUserId') || '',
        togglApiToken: localStorage.getItem('togglApiToken') || '',
        togglWorkspaceId: localStorage.getItem('togglWorkspaceId') || ''
    };
}

function showSettings() {
    const c = loadConfig();
    els.c_nToken.value = c.notionToken;
    els.c_nDbId.value = c.notionDatabaseId;
    els.c_nUserId.value = c.notionUserId;
    els.c_tToken.value = c.togglApiToken;
    els.c_tWid.value = c.togglWorkspaceId;
    
    els.mainView.classList.add('hidden');
    els.settingsView.classList.remove('hidden');
    document.getElementById('toggleSettings').classList.add('hidden');
}

function hideSettings() {
    els.settingsView.classList.add('hidden');
    els.mainView.classList.remove('hidden');
    document.getElementById('toggleSettings').classList.remove('hidden');
}

function saveSettings() {
    localStorage.setItem('notionToken', els.c_nToken.value.trim());
    localStorage.setItem('notionDatabaseId', els.c_nDbId.value.trim());
    localStorage.setItem('notionUserId', els.c_nUserId.value.trim());
    localStorage.setItem('togglApiToken', els.c_tToken.value.trim());
    localStorage.setItem('togglWorkspaceId', els.c_tWid.value.trim());
    
    alert('設定を保存しました');
    hideSettings();
    initializeApp(); // 初期化を再実行
}

// ==========================================
// 2. 状態管理 & UI制御
// ==========================================

async function checkRunningState() {
    // ローカルストレージから復元
    const storedTask = localStorage.getItem('runningTask');
    if (storedTask) {
        localRunningTask = JSON.parse(storedTask);
        updateUI(localRunningTask);
    } else {
        // Toggl APIにも念のため確認
        const togglRunning = await getTogglRunningEntry();
        if (togglRunning) {
            // 復元
            localRunningTask = {
                togglEntryId: togglRunning.id,
                title: togglRunning.description,
                notionPageId: null, // ID不明のためログ記録不可だがタイマーは動かす
                startTime: new Date(togglRunning.start).getTime(),
                category: null, departments: []
            };
            localStorage.setItem('runningTask', JSON.stringify(localRunningTask));
            updateUI(localRunningTask);
        } else {
            updateUI(null);
        }
    }
}

function updateUI(task) {
    if (task) {
        // 計測中
        els.runningCont.classList.remove('hidden');
        els.selectionSec.classList.add('hidden');
        
        document.getElementById('runningTaskTitle').textContent = task.title;
        document.getElementById('runningStartTime').textContent = new Date(task.startTime).toLocaleTimeString();
        
        if (intervalId) clearInterval(intervalId);
        intervalId = setInterval(updateTimer, 1000);
        updateTimer();
    } else {
        // 停止中
        els.runningCont.classList.add('hidden');
        els.selectionSec.classList.remove('hidden');
        toggleMode();
        
        if (intervalId) clearInterval(intervalId);
        document.getElementById('runningTimer').textContent = '00:00:00';
    }
}

function updateTimer() {
    if (!localRunningTask) return;
    const diff = Date.now() - localRunningTask.startTime;
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    document.getElementById('runningTimer').textContent = 
        `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function toggleMode() {
    const mode = document.querySelector('input[name="taskMode"]:checked').value;
    els.existingCont.className = mode === 'existing' ? '' : 'hidden';
    els.newCont.className = mode === 'new' ? '' : 'hidden';
}

// ==========================================
// 3. UIデータ生成 (統合機能)
// ==========================================

// --- KPIの描画 ---
function renderKpi(kpiData) {
    // 分を時間に変換 (h:mm)
    const formatMins = (mins) => {
        const h = Math.floor(mins / 60);
        const m = Math.round(mins % 60);
        return `${h}h ${m}m`;
    };

    els.kpiWeek.textContent = formatMins(kpiData.totalWeekMins);
    els.kpiMonth.textContent = formatMins(kpiData.totalMonthMins);

    // カテゴリ別KPIの描画
    const categoryHtml = Object.keys(kpiData.categoryWeekMins).map(cat => {
        return `${cat}: ${formatMins(kpiData.categoryWeekMins[cat])}`;
    }).join(' | ');

    els.kpiCategoryContainer.textContent = categoryHtml || 'カテゴリ別データなし';
}

// --- 既存タスクリストの描画 (フィルタ適用) ---
function renderTaskList() {
    els.taskList.innerHTML = '';
    const selectedProject = els.projectFilter.value;

    const filteredTasks = allNotionTasks.filter(p => {
        const title = p.properties['タスク名']?.title?.[0]?.plain_text || '';
        return !selectedProject || title.includes(selectedProject);
    });
    
    if (filteredTasks.length === 0) {
        els.taskList.innerHTML = '<li>表示すべきタスクはありません。</li>';
        return;
    }
    
    filteredTasks.forEach(p => {
        const title = p.properties['タスク名']?.title?.[0]?.plain_text || 'No Title';
        const depts = p.properties['部門']?.multi_select?.map(x => x.name) || [];
        const cat = p.properties['カテゴリ']?.select?.name || null;
        
        // UIに部門とカテゴリを表示
        const info = [
            cat ? `[${cat}]` : null,
            ...depts.map(d => `(${d})`)
        ].filter(Boolean).join(' ');

        const li = document.createElement('li');
        li.innerHTML = `
            <div>
                <strong>${title}</strong>
                <div style="font-size: 11px; color: #7f8c8d;">${info}</div>
            </div>
        `;
        const btn = document.createElement('button');
        btn.textContent = '▶';
        btn.className = 'btn-green';
        btn.style.width = 'auto';
        btn.onclick = () => handleStart(title, p.id, depts, cat);
        li.appendChild(btn);
        els.taskList.appendChild(li);
    });

    // プロジェクトフィルタのオプションを更新
    const uniqueTitles = [...new Set(allNotionTasks.map(p => p.properties['タスク名']?.title?.[0]?.plain_text || ''))].filter(t => t);
    const currentFilter = els.projectFilter.value;
    els.projectFilter.innerHTML = '<option value="">全てのタスク</option>';
    uniqueTitles.forEach(title => {
        const option = document.createElement('option');
        option.value = title;
        option.textContent = title;
        if (title === currentFilter) option.selected = true;
        els.projectFilter.appendChild(option);
    });
}

// --- 新規タスクUIの描画 (DBオプションを使用) ---
function renderNewTaskUI() {
    // 部門 (Multi-Select)
    els.newDeptContainer.innerHTML = dbConfig.departments.map(dept => `
        <label><input type="checkbox" name="newDept" value="${dept}"> ${dept}</label>
    `).join('');

    // カテゴリ (Select)
    els.newCatContainer.innerHTML = dbConfig.categories.map((cat, index) => `
        <label style="margin-right:10px;"><input type="radio" name="newCat" value="${cat}" ${index === 0 ? 'checked' : ''}> ${cat}</label>
    `).join('');
}


// ==========================================
// 4. API連携 (プロキシ経由でカスタムエンドポイントを使用)
// ==========================================

/**
 * プロキシ経由でカスタムAPIを呼び出す（KPIやConfig用）
 */
async function apiCustomFetch(customEndpoint) {
    const config = loadConfig();
    if (!config.notionDatabaseId || !config.notionToken) {
        throw new Error('Notion設定が不足しています。');
    }
    
    // プロキシサーバーに送るデータ
    const proxyPayload = {
        customEndpoint: customEndpoint, // 新しいカスタムエンドポイント
        dbId: config.notionDatabaseId,
        tokenKey: 'notionToken',
        tokenValue: config.notionToken,
        method: 'POST', 
    };

    // プロキシサーバーへのリクエストは常にPOST
    const res = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(proxyPayload)
    });
    
    if (!res.ok) {
        const errorJson = await res.json().catch(() => ({ message: '不明なプロキシエラー' }));
        throw new Error(`Custom API Error (${res.status}): ${errorJson.message || 'サーバー側で問題が発生しました'}`);
    }
    
    return res.json();
}

/**
 * 標準のNotion/Toggl APIを呼び出す（タスク一覧取得や開始・停止用）
 */
async function apiFetch(targetUrl, method, body, tokenKey) {
    const token = localStorage.getItem(tokenKey);
    if (!token) throw new Error(`${tokenKey}未設定`);
    
    const proxyPayload = {
        targetUrl: targetUrl,
        method: method,
        body: body,
        tokenKey: tokenKey,
        tokenValue: token
    };

    const res = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(proxyPayload)
    });
    
    if (!res.ok) {
        const errorJson = await res.json().catch(() => ({ message: '不明なプロキシエラー' }));
        throw new Error(`API Error (${res.status}): ${errorJson.message || 'サーバー側で問題が発生しました'}`);
    }
    
    return res.status === 204 ? null : res.json();
}

// --- データのロード関数 ---

async function loadDbConfig() {
    try {
        const configData = await apiCustomFetch('getConfig');
        dbConfig = configData;
        renderNewTaskUI();
    } catch (e) {
        console.error("DB設定ロードエラー:", e);
        // エラー時でもアプリが壊れないようにUIはクリア
        els.newDeptContainer.innerHTML = 'ロードエラー';
        els.newCatContainer.innerHTML = 'ロードエラー';
    }
}

async function loadTasksAndKpi() {
    els.taskList.innerHTML = '<li>読み込み中...</li>';
    try {
        // 1. KPIの取得と表示
        const kpiData = await apiCustomFetch('getKpi');
        renderKpi(kpiData);

        // 2. タスク一覧の取得
        const dbId = localStorage.getItem('notionDatabaseId');
        const res = await apiFetch(`https://api.notion.com/v1/databases/${dbId}/query`, 'POST', {
            filter: { property: 'ステータス', status: { does_not_equal: '完了' } },
            sorts: [{ property: 'タスク名', direction: 'ascending' }]
        }, 'notionToken');
        
        allNotionTasks = res.results;
        renderTaskList();

    } catch (e) {
        els.taskList.innerHTML = `<li>エラー: ${e.message}</li>`;
        els.kpiWeek.textContent = 'Err';
        els.kpiMonth.textContent = 'Err';
        els.kpiCategoryContainer.textContent = e.message;
        alert("データ取得エラー: " + e.message);
    }
}

// --- Notion ---
async function createNotionTask(title, depts, cat) {
    const dbId = localStorage.getItem('notionDatabaseId');
    const uId = localStorage.getItem('notionUserId');
    const props = {
        "タスク名": { title: [{ text: { content: title } }] },
        "部門": { multi_select: depts.map(d => ({ name: d })) },
        "カテゴリ": { select: { name: cat } },
        "ステータス": { status: { name: "未着手" } }
    };
    if (uId) props["担当者"] = { people: [{ id: uId }] };

    const res = await apiFetch('https://api.notion.com/v1/pages', 'POST', {
        parent: { database_id: dbId }, properties: props
    }, 'notionToken');
    return res.id;
}

async function writeLogToNotion(pageId, seconds, isComplete, memo) {
    if (!pageId) return;
    try {
        // 1. Get current
        const page = await apiFetch(`https://api.notion.com/v1/pages/${pageId}`, 'GET', null, 'notionToken');
        const curMins = page.properties["計測時間(分)"]?.number || 0;
        const totalMins = curMins + Math.round(seconds / 60);

        const props = { "計測時間(分)": { number: totalMins } };

        if (isComplete) {
            props["ステータス"] = { status: { name: "完了" } };
            props["完了日"] = { date: { start: new Date().toISOString().split('T')[0] } };
            
            if (memo) {
                const curLog = page.properties["思考ログ"]?.rich_text?.[0]?.plain_text || "";
                const dateStamp = `[${new Date().toLocaleDateString()}]`;
                const newLog = curLog ? `${curLog}\n\n${dateStamp}\n${memo}` : `${dateStamp}\n${memo}`;
                props["思考ログ"] = { rich_text: [{ text: { content: newLog } }] };
            }
        } else {
            props["ステータス"] = { status: { name: "進行中" } };
        }

        await apiFetch(`https://api.notion.com/v1/pages/${pageId}`, 'PATCH', { properties: props }, 'notionToken');
    } catch (e) {
        console.error("Notion write error", e);
        alert("Notion書き込みエラー: " + e.message);
    }
}

// --- Toggl ---
async function getTogglRunningEntry() {
    try {
        const data = await apiFetch('https://api.track.toggl.com/api/v9/time_entries/current', 'GET', null, 'togglApiToken');
        return (data && data.id) ? data : null;
    } catch (e) { return null; }
}

async function startToggl(title, tags) {
    const wid = parseInt(localStorage.getItem('togglWorkspaceId'));
    const body = {
        workspace_id: wid,
        description: title,
        created_with: 'Notion Toggl WebApp',
        start: new Date().toISOString(),
        duration: -1,
        tags: tags
    };
    return await apiFetch('https://api.track.toggl.com/api/v9/time_entries', 'POST', body, 'togglApiToken');
}

async function stopToggl(entryId) {
    const wid = localStorage.getItem('togglWorkspaceId');
    return await apiFetch(`https://api.track.toggl.com/api/v9/workspaces/${wid}/time_entries/${entryId}/stop`, 'PATCH', null, 'togglApiToken');
}

// ==========================================
// 5. アクションハンドラ
// ==========================================

async function handleStart(title, notionId, depts, cat) {
    if (localRunningTask) await handleStopProcess(false, ""); // 実行中なら一旦停止

    try {
        const deptStr = Array.isArray(depts) ? depts.map(d => `【${d}】`).join('') : '';
        const catStr = cat ? `【${cat}】` : '';
        const togglTitle = `${deptStr}${catStr}${title}`;
        
        const entry = await startToggl(togglTitle, cat ? [cat] : []);
        
        localRunningTask = {
            notionPageId: notionId,
            title: title,
            startTime: new Date(entry.start).getTime(),
            togglEntryId: entry.id
        };
        localStorage.setItem('runningTask', JSON.stringify(localRunningTask));
        updateUI(localRunningTask);
    } catch (e) {
        alert("開始エラー: " + e.message);
    }
}

async function handleStartNew() {
    const title = document.getElementById('newTaskTitle').value.trim();
    const depts = Array.from(document.querySelectorAll('input[name="newDept"]:checked')).map(c => c.value);
    const cat = document.querySelector('input[name="newCat"]:checked')?.value;

    if (!title || !depts.length || !cat) return alert("タスク名、部門、カテゴリの全項目必須です");

    try {
        const pid = await createNotionTask(title, depts, cat);
        await handleStart(title, pid, depts, cat);
        // フォームクリア
        document.getElementById('newTaskTitle').value = '';
        document.querySelectorAll('input[name="newDept"]').forEach(c => c.checked = false);
        document.querySelectorAll('input[name="newCat"]').forEach(c => c.checked = false);
    } catch (e) {
        alert("新規作成エラー: " + e.message);
    }
}

async function handlePause() {
    await handleStopProcess(false, "");
}

async function handleComplete() {
    const memo = prompt("思考ログを入力:", "");
    if (memo === null) return;
    await handleStopProcess(true, memo);
}

async function handleStopProcess(isComplete, memo) {
    if (!localRunningTask) return;
    
    try {
        let duration = 0;
        // Toggl停止
        try {
            const res = await stopToggl(localRunningTask.togglEntryId);
            if (res && res.duration) duration = res.duration;
        } catch(e) { console.warn("Toggl停止エラー(無視)", e); }

        if (duration <= 0) {
            duration = Math.floor((Date.now() - localRunningTask.startTime) / 1000);
        }

        // Notion記録
        await writeLogToNotion(localRunningTask.notionPageId, duration, isComplete, memo);
        
        if(isComplete) alert("完了しました！");
        else alert("一旦終了しました。");

    } catch (e) {
        alert("停止エラー: " + e.message);
    } finally {
        localRunningTask = null;
        localStorage.removeItem('runningTask');
        updateUI(null);
        loadTasksAndKpi(); // 停止後、タスクとKPIを再ロード
    }
}

async function handleForceStop() {
    if(!confirm("強制停止しますか？(ログはNotionに記録されません)")) return;
    localRunningTask = null;
    localStorage.removeItem('runningTask');
    updateUI(null);
}
