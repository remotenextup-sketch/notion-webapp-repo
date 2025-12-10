// ============================================================
// Notion Toggl Timer - Web App (app.js)
// ============================================================

// ★★★ ここにVercelで取得したURLを設定します！ ★★★
// Vercelで発行されたURLの末尾に「/api/proxy」を付け加えます。
const PROXY_URL = 'https://reimagined-broccoli-8ammmetuy-aaaks-projects.vercel.app/'; 
// 例: https://notion-toggl-proxy.vercel.app/api/proxy
// ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★

// グローバル状態
let localRunningTask = null;
let intervalId = null;

// DOM要素の参照
const els = {
    mainView: document.getElementById('mainView'),
    settingsView: document.getElementById('settingsView'),
    runningCont: document.getElementById('runningTaskContainer'),
    selectionSec: document.getElementById('taskSelectionSection'),
    existingCont: document.getElementById('existingTaskContainer'),
    newCont: document.getElementById('newTaskContainer'),
    taskList: document.getElementById('taskList'),
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
    
    document.getElementById('reloadTasks').addEventListener('click', loadNotionTasks);
    document.getElementById('pauseButton').addEventListener('click', handlePause);
    document.getElementById('completeButton').addEventListener('click', handleComplete);
    document.getElementById('forceStopButton').addEventListener('click', handleForceStop);
    document.getElementById('startNewTaskButton').addEventListener('click', handleStartNew);
    
    document.querySelectorAll('input[name="taskMode"]').forEach(r => r.addEventListener('change', toggleMode));

    // 設定ロード
    const config = loadConfig();
    if (!config.notionToken || !config.togglApiToken) {
        showSettings(); // 設定がない場合は設定画面へ
    } else {
        await checkRunningState(); // 実行状態の確認
        loadNotionTasks(); // タスク一覧ロード
    }
});

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
    loadNotionTasks();
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

// app.js の先頭付近に、プロキシサーバーのURLを設定してください
// 例: Vercel FunctionsやCloudflare Workersで作成したエンドポイント
const PROXY_URL = 'https://[ここにあなたのプロキシURLを入力].com/api/proxy'; 
// ↑このURLは、あなたが別途設定する必要があります。

// ==========================================
// 3. API連携 (Notion & Toggl)
// apiFetch 関数をプロキシ経由に全面変更
// ==========================================

async function apiFetch(targetUrl, method, body, tokenKey) {
    const token = localStorage.getItem(tokenKey);
    if (!token) throw new Error(`${tokenKey}未設定`);
    
    // プロキシサーバーに送るデータ
    const proxyPayload = {
        targetUrl: targetUrl, // 実際のNotion/TogglのURL
        method: method,       // 実際のHTTPメソッド (GET/POST/PATCH)
        body: body,           // 実際のペイロード
        tokenKey: tokenKey,   // トークンの種類 ('notionToken' or 'togglApiToken')
        tokenValue: token     // ユーザーが入力したAPIトークン
    };

    // プロキシサーバーへのリクエストは常にPOST
    const res = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(proxyPayload)
    });
    
    if (!res.ok) {
        // プロキシ側で発生したエラー（APIトークン間違いなど）を捕捉
        const errorJson = await res.json().catch(() => ({ message: '不明なプロキシエラー' }));
        throw new Error(`API Error (${res.status}): ${errorJson.message || 'サーバー側で問題が発生しました'}`);
    }
    
    return res.status === 204 ? null : res.json();
}

// --- Notion ---
async function loadNotionTasks() {
    els.taskList.innerHTML = '<li>読み込み中...</li>';
    try {
        const dbId = localStorage.getItem('notionDatabaseId');
        const res = await apiFetch(`https://api.notion.com/v1/databases/${dbId}/query`, 'POST', {
            filter: { property: 'ステータス', status: { does_not_equal: '完了' } }
        }, 'notionToken');
        
        els.taskList.innerHTML = '';
        res.results.forEach(p => {
            const title = p.properties['タスク名']?.title?.[0]?.plain_text || 'No Title';
            const depts = p.properties['部門']?.multi_select?.map(x => x.name) || [];
            const cat = p.properties['カテゴリ']?.select?.name || null;
            
            const li = document.createElement('li');
            li.innerHTML = `<span>${title}</span>`;
            const btn = document.createElement('button');
            btn.textContent = '▶';
            btn.className = 'btn-green';
            btn.style.width = 'auto';
            btn.onclick = () => handleStart(title, p.id, depts, cat);
            li.appendChild(btn);
            els.taskList.appendChild(li);
        });
    } catch (e) {
        els.taskList.innerHTML = `<li>エラー: ${e.message}</li>`;
        alert("タスク取得エラー。CORS制限の可能性があります。");
    }
}

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
// 4. アクションハンドラ
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

    if (!title || !depts.length || !cat) return alert("全項目必須です");

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
        } catch(e) { console.warn(e); }

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
        loadNotionTasks();
    }
}

async function handleForceStop() {
    if(!confirm("強制停止しますか？(ログは残りません)")) return;
    localRunningTask = null;
    localStorage.removeItem('runningTask');
    updateUI(null);
}
