// app.js

// ★★★ 定数とグローバル設定 ★★★
// Vercelで取得したURLを設定 (既存のものを使用)
const PROXY_URL = 'https://notion-webapp-repo.vercel.app/api/proxy'; 

const settings = {
    notionToken: '',
    notionDatabaseIds: [], // ★配列に変更
    humanUserId: '', // Notionの担当者として割り当てるユーザーID
    
    // ★★★ Toggl設定 ★★★
    togglApiToken: '',
    togglWorkspaceId: '', 
    
    databases: [],
    currentRunningTask: null, // 実行中のタスク情報
    startTime: null,          // 計測開始時刻 (ミリ秒)
    timerInterval: null       // タイマーID
};

const dbPropertiesCache = {}; // データベースプロパティのキャッシュ

// DOM要素の参照
const dom = {
    // 画面切り替え
    mainView: document.getElementById('mainView'),
    settingsView: document.getElementById('settingsView'),

    // 設定フォーム
    confNotionToken: document.getElementById('confNotionToken'),
    confNotionDbId: document.getElementById('confNotionDbId'),
    confNotionUserId: document.getElementById('confNotionUserId'),
    confTogglToken: document.getElementById('confTogglToken'), // Toggl
    confTogglWid: document.getElementById('confTogglWid'),     // Toggl

    // タスク一覧・フィルター
    taskDbFilter: document.getElementById('taskDbFilter'),
    taskListContainer: document.getElementById('taskListContainer'),

    // 実行中タスク
    runningTaskContainer: document.getElementById('runningTaskContainer'),
    runningTaskTitle: document.getElementById('runningTaskTitle'),
    runningTimer: document.getElementById('runningTimer'),
    thinkingLogInput: document.getElementById('thinkingLogInput'),

    // 新規タスクフォーム
    newTaskForm: document.getElementById('newTaskForm'),
    newTaskTitle: document.getElementById('newTaskTitle'),
    newCatContainer: document.getElementById('newCatContainer'),
    newDeptContainer: document.getElementById('newDeptContainer'),
    targetDbDisplay: document.getElementById('targetDbDisplay')
};

// ==========================================
// 1. 初期化 & 設定管理
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
    // イベントリスナー設定
    document.getElementById('toggleSettings').addEventListener('click', showSettings);
    document.getElementById('saveConfig').addEventListener('click', handleSaveSettings);
    document.getElementById('cancelConfig').addEventListener('click', hideSettings);
    document.getElementById('reloadTasks').addEventListener('click', loadTasks);

    document.getElementById('startExistingTask').addEventListener('click', switchTab);
    document.getElementById('startNewTask').addEventListener('click', switchTab);
    
    document.getElementById('startNewTaskButton').addEventListener('click', handleStartNewTask);
    document.getElementById('stopTaskButton').addEventListener('click', () => stopTask(false));
    document.getElementById('completeTaskButton').addEventListener('click', () => stopTask(true));
    
    dom.taskDbFilter.addEventListener('change', loadTasks);

    loadSettings();
    await checkRunningState();
    if (settings.notionToken) {
        await fetchDatabaseList();
        loadTasks();
    } else {
        showSettings();
    }
});

/** ローカルストレージから設定を読み込む */
function loadSettings() {
    settings.notionToken = localStorage.getItem('notionToken') || '';
    
    // ★★★ 修正箇所：複数のDB IDを配列としてロード ★★★
    const dbIdsJson = localStorage.getItem('notionDatabaseIds') || '[]';
    try {
        settings.notionDatabaseIds = JSON.parse(dbIdsJson);
        // 過去の単一ID形式からの移行措置
        if (settings.notionDatabaseIds.length === 0) {
             const singleId = localStorage.getItem('notionDatabaseId');
             if (singleId) settings.notionDatabaseIds.push(singleId);
             localStorage.removeItem('notionDatabaseId');
        }
    } catch {
        settings.notionDatabaseIds = [];
    }
    // ★★★ 修正箇所 ここまで ★★★

    settings.humanUserId = localStorage.getItem('humanUserId') || '';
    
    settings.togglApiToken = localStorage.getItem('togglApiToken') || ''; // Toggl
    settings.togglWorkspaceId = localStorage.getItem('togglWorkspaceId') || ''; // Toggl
    
    const runningTask = localStorage.getItem('runningTask');
    if (runningTask) {
        const task = JSON.parse(runningTask);
        settings.currentRunningTask = task.task;
        settings.startTime = task.startTime;
    }
}

/** 設定を保存する */
function handleSaveSettings() {
    settings.notionToken = dom.confNotionToken.value.trim();
    
    // ★★★ 修正箇所：カンマ区切りを配列に変換して保存 ★★★
    const dbIdString = dom.confNotionDbId.value.trim();
    settings.notionDatabaseIds = dbIdString.split(',').map(id => id.trim()).filter(id => id);
    // ★★★ 修正箇所 ここまで ★★★

    settings.humanUserId = dom.confNotionUserId.value.trim();
    
    settings.togglApiToken = dom.confTogglToken.value.trim(); // Toggl
    settings.togglWorkspaceId = dom.confTogglWid.value.trim(); // Toggl
    
    localStorage.setItem('notionToken', settings.notionToken);
    
    // ★★★ 修正箇所：配列をJSON文字列で保存 ★★★
    localStorage.setItem('notionDatabaseIds', JSON.stringify(settings.notionDatabaseIds));
    // ★★★ 修正箇所 ここまで ★★★

    localStorage.setItem('humanUserId', settings.humanUserId);
    
    localStorage.setItem('togglApiToken', settings.togglApiToken); // Toggl
    localStorage.setItem('togglWorkspaceId', settings.togglWorkspaceId); // Toggl
    
    alert('設定を保存しました。');
    saveSettings(); // settingsオブジェクトの内容を保存
    hideSettings();
    fetchDatabaseList();
    loadTasks();
}

/** settingsオブジェクトをlocalStorageに保存（ランタイム用）*/
function saveSettings() {
    localStorage.setItem('notionToken', settings.notionToken);
    localStorage.setItem('notionDatabaseIds', JSON.stringify(settings.notionDatabaseIds)); // 配列保存
    localStorage.setItem('humanUserId', settings.humanUserId);
    localStorage.setItem('togglApiToken', settings.togglApiToken);
    localStorage.setItem('togglWorkspaceId', settings.togglWorkspaceId);

    if (settings.currentRunningTask && settings.startTime) {
        localStorage.setItem('runningTask', JSON.stringify({
            task: settings.currentRunningTask,
            startTime: settings.startTime
        }));
    } else {
        localStorage.removeItem('runningTask');
    }
}

function showSettings() {
    dom.confNotionToken.value = settings.notionToken;
    
    // ★★★ 修正箇所：配列をカンマ区切り文字列にして表示 ★★★
    dom.confNotionDbId.value = settings.notionDatabaseIds.join(', ');
    // ★★★ 修正箇所 ここまで ★★★

    dom.confNotionUserId.value = settings.humanUserId;
    dom.confTogglToken.value = settings.togglApiToken; // Toggl
    dom.confTogglWid.value = settings.togglWorkspaceId; // Toggl

    dom.mainView.classList.add('hidden');
    dom.settingsView.classList.remove('hidden');
}

function hideSettings() {
    dom.settingsView.classList.add('hidden');
    dom.mainView.classList.remove('hidden');
}


// ==========================================
// 2. API基盤 (Notion & Toggl)
// ==========================================

/** 外部APIへのリクエストをプロキシ経由で送信する */
async function externalApi(targetUrl, method, headers, body) {
    const proxyPayload = {
        targetUrl: targetUrl,
        method: method,
        headers: headers,
        body: body
    };

    const res = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(proxyPayload)
    });

    if (!res.ok) {
        const errorJson = await res.json().catch(() => ({ message: '不明なプロキシエラー' }));
        console.error('Proxy/API Error:', errorJson);
        throw new Error(`API Error (${res.status}): ${errorJson.message || 'サーバー側で問題が発生しました'}`);
    }

    return res.status === 204 ? null : res.json();
}

// --- Notion API ---

/** Notion APIへのリクエストを処理する */
async function notionApi(endpoint, method = 'GET', body = null) {
    if (!settings.notionToken) {
        throw new Error('Notion APIトークンが設定されていません。');
    }

    const fullUrl = `https://api.notion.com/v1${endpoint}`;
    
    // デバッグ用: 実際にNotionに送ろうとしているURLをコンソールに出力
    console.log(`[NotionAPI] Calling ${method} ${fullUrl}`); 

    const headers = {
        'Authorization': `Bearer ${settings.notionToken}`,
        'Notion-Version': '2022-06-28'
    };
    
    // ★★★ [DEBUG] トークン値チェックログ (追加) ★★★
    if (settings.notionToken) {
        const authHeader = headers['Authorization'];
        // 最初の30文字と全体の長さを表示し、トークンが正しくセットされているかを確認
        console.log(`[DEBUG] Authorization Header Value Check: ${authHeader.substring(0, 30)}... (Length: ${authHeader.length})`); 
    }
    // ★★★ [DEBUG] ここまで ★★★

    if (method === 'POST' || method === 'PATCH') {
        headers['Content-Type'] = 'application/json';
    }

    try {
        const res = await externalApi(fullUrl, method, headers, body);
        return res;
    } catch (e) {
        console.error('Notion API Error:', e);
        throw e;
    }
}


// --- Toggl API ---

/** Toggl APIへのリクエストを処理する */
async function togglApi(endpoint, method = 'GET', body = null) {
    if (!settings.togglApiToken || !settings.togglWorkspaceId) {
        throw new Error('Toggl設定（トークンとワークスペースID）が不完全です。');
    }

    const fullUrl = `https://api.track.toggl.com/api/v9${endpoint}`;
    
    // デバッグ用
    console.log(`[TogglAPI] Calling ${method} ${fullUrl}`); 

    const headers = {
        // Togglの認証はBasic認証を使用 (トークンをBase64エンコード)
        'Authorization': `Basic ${btoa(`${settings.togglApiToken}:api_token`)}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Notion-Toggl-Timer-WebApp'
    };

    try {
        const res = await externalApi(fullUrl, method, headers, body);
        return res;
    } catch (e) {
        console.error('Toggl API Error:', e);
        throw new Error(`Toggl APIとの通信エラー: ${e.message}`);
    }
}


// ==========================================
// 3. Togglアクション
// ==========================================
// ... (Togglロジックは省略しませんが、全文は上記に含まれます)


// ==========================================
// 4. Notionデータ取得
// ==========================================

/** データベース一覧を取得し、フィルターをレンダリングする */
async function fetchDatabaseList() {
    if (settings.notionDatabaseIds.length === 0) {
        settings.databases = [];
        dom.taskDbFilter.innerHTML = '<option value="">DBが設定されていません</option>';
        return;
    }

    try {
        // 1. ボットユーザーIDを取得
        const userRes = await notionApi('/users/me', 'GET');
        settings.botUserId = userRes.id;
        
        const fetchedDatabases = [];

        // 2. 設定された各データベースIDの情報を取得
        for (const dbId of settings.notionDatabaseIds) {
            try {
                const res = await notionApi(`/databases/${dbId.replace(/-/g, '').trim()}`, 'GET'); // IDからハイフンを除去
                fetchedDatabases.push({
                    id: res.id,
                    name: res.title[0]?.plain_text || '無題のデータベース'
                });
            } catch (e) {
                // 個別のDB取得で失敗した場合、そのIDをスキップし、エラーをログに出す
                console.warn(`ID ${dbId} のデータベース情報の取得に失敗しました。このDBはスキップされます。`, e);
            }
        }
        
        settings.databases = fetchedDatabases;
        saveSettings();
        
        if (settings.databases.length === 0) {
             dom.taskDbFilter.innerHTML = '<option value="">有効なDBが見つかりません</option>';
             return;
        }

        // フィルターのレンダリング
        const currentSelectedDbId = dom.taskDbFilter.value || settings.databases[0].id; // 現在選択中のDB、または最初のDB
        
        dom.taskDbFilter.innerHTML = settings.databases.map(db => 
            `<option value="${db.id}" ${db.id === currentSelectedDbId ? 'selected' : ''}>${db.name}</option>`
        ).join('');
        
    } catch (e) {
        console.error("データベース一覧取得エラー:", e);
        // エラーメッセージをNotion API Tokenに関連するものに限定
        if (e.message.includes('API Error (400)') || e.message.includes('API Error (401)')) {
            alert(`Notion APIトークンまたは権限に問題があるため、データベース一覧の取得に失敗しました。設定を確認してください。`);
        } else {
             alert(`データベース一覧の取得に失敗しました: ${e.message}`);
        }
    }
}

/** データベースのプロパティ情報を取得しキャッシュする */
// ... (getDbProperties関数は省略しませんが、全文は上記に含まれます)

/** タスク一覧をロードしレンダリングする */
// ... (loadTasks関数は省略しませんが、全文は上記に含まれます)

// ... (その他の関数も上記に含まれます)
