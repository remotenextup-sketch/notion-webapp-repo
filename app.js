// ============================================================
// Notion Timer Web App (app.js) - Notion専用版
// ============================================================

// ★★★ Vercel FunctionsでデプロイしたプロキシのURLを設定してください！ ★★★
// 例: https://[あなたのドメイン].vercel.app/api/proxy
const PROXY_URL = 'https://notion-proxy-repo.vercel.app/api/proxy'; 
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
    // Toggl設定要素は削除
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
    document.getElementById('completeButton').addEventListener('click', handleComplete);
    document.getElementById('forceStopButton').addEventListener('click', handleForceStop);
    document.getElementById('startNewTaskButton').addEventListener('click', handleStartNew);
    
    document.querySelectorAll('input[name="taskMode"]').forEach(r => r.addEventListener('change', toggleMode));

    // 設定ロード
    const config = loadConfig();
    if (!config.notionToken) {
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
        notionUserId: localStorage.getItem('notionUserId') || ''
    };
}

function showSettings() {
    const c = loadConfig();
    els.c_nToken.value = c.notionToken;
    els.c_nDbId.value = c.notionDatabaseId;
    els.c_nUserId.value = c.notionUserId;
    
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
        updateUI(null);
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
// 3. API連携 (プロキシ経由 - Notionのみ)
// ==========================================

async function apiFetch(targetUrl, method, body, tokenKey) {
    const token = localStorage.getItem(tokenKey);
    if (!token) throw new Error(`${tokenKey}未設定`);
    
    // プロキシサーバーに送るデータ
    const proxyPayload = {
        targetUrl: targetUrl, 
        method: method,       
        body: body,           
        tokenKey: tokenKey,   
        tokenValue: token     
    };

    // プロキシサーバーへのリクエスト
    const res = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(proxyPayload)
    });
    
    if (!res.ok) {
        const errorText = await res.text();
        let errorMsg = `API Error (${res.status}): ${errorText}`;
        try {
            const errorJson = JSON.parse(errorText);
            errorMsg = `API Error (${res.status}): ${errorJson.message || 'サーバー側で問題が発生しました'}`;
        } catch {}
        
        throw new Error(errorMsg);
    }
    
    return res.status === 204 ? null : res.json().catch(() => null);
}

// --- Notion ---
async function loadNotionTasks() {
    els.taskList.innerHTML = '<li>タスクを読み込み中...</li>';
    try {
        const dbId = localStorage.getItem('notionDatabaseId');
        const res = await apiFetch(`https://api.notion.com/v1/databases/${dbId}/query`, 'POST', {
            filter: { property: 'ステータス', status: { does_not_equal: '完了' } }
        }, 'notionToken');
        
        els.taskList.innerHTML = '';
        if (!res.results || res.results.length === 0) {
            els.taskList.innerHTML = '<li>未完了タスクが見つかりませんでした。</li>';
            return;
        }

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
        alert("タスク取得エラー。設定とプロキシURLを確認してください。");
    }
}

async function createNotionTask(title, depts, cat) {
    const dbId = localStorage.getItem('notionDatabaseId');
    const uId = localStorage.getItem('notionUserId');
    const props = {
        "タスク名": { title: [{ text: { content: title } }] },
        "部門": { multi_select: depts.map(d => ({ name: d })) },
        "カテゴリ": { select: { name: cat } },
        "ステータス": { status: { name: "進行中" } } // 作成と同時に「進行中」にする
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
        // Notionから現在の計測時間を取得（更新時のデータの競合を防ぐため）
        const page = await apiFetch(`https://api.notion.com/v1/pages/${pageId}`, 'GET', null, 'notionToken');
        const curMins = page.properties["計測時間(分)"]?.number || 0;
        const totalMins = curMins + Math.round(seconds / 60);

        const props = { "計測時間(分)": { number: totalMins } };

        if (isComplete) {
            props["ステータス"] = { status: { name: "完了" } };
            props["完了日"] = { date: { start: new Date().toISOString().split('T')[0] } };
            
            if (memo) {
                // 既存のログに追記するロジック（Notion APIの仕様に対応）
                const curLog = page.properties["思考ログ"]?.rich_text?.[0]?.plain_text || "";
                const dateStamp = `[${new Date().toLocaleDateString()}]`;
                const newLog = curLog ? `${curLog}\n\n${dateStamp}\n${memo}` : `${dateStamp}\n${memo}`;
                props["思考ログ"] = { rich_text: [{ text: { content: newLog } }] };
            }
        } else {
            // 一時停止や強制停止（記録あり）の場合
            props["ステータス"] = { status: { name: "未着手" } }; 
        }

        await apiFetch(`https://api.notion.com/v1/pages/${pageId}`, 'PATCH', { properties: props }, 'notionToken');
    } catch (e) {
        console.error("Notion write error", e);
        alert("Notion書き込みエラー: " + e.message);
    }
}

// ==========================================
// 4. アクションハンドラ
// ==========================================

async function handleStart(title, notionId, depts, cat) {
    if (localRunningTask) await handleStopProcess(false, "", true); // 実行中なら記録せずに一旦停止

    try {
        // Notionのステータスを進行中に変更
        await writeLogToNotion(notionId, 0, false, null); // 進行中に変更
        
        localRunningTask = {
            notionPageId: notionId,
            title: title,
            startTime: Date.now() // ローカル時間で記録開始
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

    if (!title || !depts.length || !cat) return alert("タスク名、部門、カテゴリは全て選択/入力が必要です。");

    try {
        if (localRunningTask) await handleStopProcess(false, "", true); // 実行中なら記録せずに一旦停止

        const pid = await createNotionTask(title, depts, cat);
        
        localRunningTask = {
            notionPageId: pid,
            title: title,
            startTime: Date.now()
        };
        localStorage.setItem('runningTask', JSON.stringify(localRunningTask));
        updateUI(localRunningTask);
        
        // フォームクリア
        document.getElementById('newTaskTitle').value = '';
        document.querySelectorAll('input[name="newDept"]').forEach(c => c.checked = false);
        document.querySelector('input[name="newCat"][value="作業"]').checked = true; // デフォルトに戻す
        
        // モードを既存に戻す
        document.querySelector('input[name="taskMode"][value="existing"]').checked = true;
        toggleMode();
        loadNotionTasks();
    } catch (e) {
        alert("新規作成エラー: " + e.message);
    }
}

async function handleComplete() {
    const memo = prompt("思考ログを入力してください（任意）:", "");
    if (memo === null) return; // キャンセルされた場合
    await handleStopProcess(true, memo, false);
}

async function handleStopProcess(isComplete, memo, isPause) {
    if (!localRunningTask) return;
    
    try {
        const durationSeconds = Math.floor((Date.now() - localRunningTask.startTime) / 1000);

        // Notion記録
        // isPause (一時停止) の場合は、完了フラグを立てずに記録
        await writeLogToNotion(localRunningTask.notionPageId, durationSeconds, isComplete, memo);
        
        if(isComplete) alert("タスクを完了し、ログを記録しました！");
        else if(isPause) alert("タスクを開始しました！ (以前のタスクは一時停止)");
        else alert("強制停止しました。Notionへの記録は行っていません。");

    } catch (e) {
        alert("停止処理エラー: " + e.message);
    } finally {
        localRunningTask = null;
        localStorage.removeItem('runningTask');
        updateUI(null);
        loadNotionTasks();
    }
}

async function handleForceStop() {
    if(!confirm("強制停止しますか？(Notionへの時間記録はされません)")) return;
    
    // Notionのステータスを「未着手」に戻すのみ
    if (localRunningTask?.notionPageId) {
        try {
            await writeLogToNotion(localRunningTask.notionPageId, 0, false, null); // 記録なしでステータスのみ更新
        } catch(e) { console.warn("Notion status reset failed:", e); }
    }
    
    localRunningTask = null;
    localStorage.removeItem('runningTask');
    updateUI(null);
}
