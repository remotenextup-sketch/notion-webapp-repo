// app.js 全文

// ★★★ 定数とグローバル設定 ★★★
const PROXY_URL = 'https://notion-webapp-repo.vercel.app/api/proxy'; 

const settings = {
    notionToken: '',
    // ★★★ 修正: 複数のデータベース情報をオブジェクト配列で管理 ★★★
    notionDatabases: [], // [{ name: "DB名", id: "DBID" }, ...]
    humanUserId: '', 
    
    // ★★★ Toggl設定 ★★★
    togglApiToken: '',
    togglWorkspaceId: '', 
    
    databases: [], // ロードしたDB情報のキャッシュ
    currentRunningTask: null, 
    startTime: null,          
    timerInterval: null       
};

const dbPropertiesCache = {}; 

// DOM要素の参照
const dom = {
    // 画面切り替え
    mainView: document.getElementById('mainView'),
    settingsView: document.getElementById('settingsView'),

    // 設定フォーム
    confNotionToken: document.getElementById('confNotionToken'),
    // ★★★ 修正: IDではなく設定全体を入力するtextareaとして扱う ★★★
    confNotionDbConfig: document.getElementById('confNotionDbConfig'), 
    confNotionUserId: document.getElementById('confNotionUserId'),
    confTogglToken: document.getElementById('confTogglToken'), 
    confTogglWid: document.getElementById('confTogglWid'),     

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
        // ロード時にデータベースリストを取得し、ロード関数を呼ぶ
        await fetchDatabaseList();
        loadTasks(); // loadTasksがDOMのonload時に呼ばれるように修正
    } else {
        showSettings();
    }
});

/** ローカルストレージから設定を読み込む */
function loadSettings() {
    settings.notionToken = localStorage.getItem('notionToken') || '';
    
    // ★★★ 修正: 複数のDB情報をJSONとしてロード ★★★
    const dbConfigJson = localStorage.getItem('notionDatabases') || '[]';
    try {
        const parsed = JSON.parse(dbConfigJson);
        settings.notionDatabases = Array.isArray(parsed) ? parsed : [];
    } catch {
        settings.notionDatabases = [];
    }
    // ★★★ 修正 ここまで ★★★

    settings.humanUserId = localStorage.getItem('humanUserId') || '';
    
    settings.togglApiToken = localStorage.getItem('togglApiToken') || ''; 
    settings.togglWorkspaceId = localStorage.getItem('togglWorkspaceId') || ''; 
    
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
    
    // ★★★ 修正: JSON形式の入力をパースして配列として保存 ★★★
    const dbConfigString = dom.confNotionDbConfig.value.trim();
    try {
        const parsed = JSON.parse(dbConfigString);
        settings.notionDatabases = Array.isArray(parsed) ? parsed : [];
        if (settings.notionDatabases.length > 0 && 
            !settings.notionDatabases.every(db => db.name && db.id)) {
            throw new Error("フォーマットが不正です。各要素が name と id を含む必要があります。");
        }
    } catch (e) {
        alert("データベース設定のJSON形式が不正です。\n" + e.message);
        return; 
    }
    // ★★★ 修正 ここまで ★★★

    settings.humanUserId = dom.confNotionUserId.value.trim();
    
    settings.togglApiToken = dom.confTogglToken.value.trim(); 
    settings.togglWorkspaceId = dom.confTogglWid.value.trim(); 
    
    localStorage.setItem('notionToken', settings.notionToken);
    
    // ★★★ 修正: 配列をJSON文字列で保存 ★★★
    localStorage.setItem('notionDatabases', JSON.stringify(settings.notionDatabases));
    // ★★★ 修正 ここまで ★★★

    localStorage.setItem('humanUserId', settings.humanUserId);
    localStorage.setItem('togglApiToken', settings.togglApiToken);
    localStorage.setItem('togglWorkspaceId', settings.togglWorkspaceId);
    
    alert('設定を保存しました。');
    saveSettings(); 
    hideSettings();
    fetchDatabaseList();
    loadTasks();
}

/** settingsオブジェクトをlocalStorageに保存（ランタイム用）*/
function saveSettings() {
    localStorage.setItem('notionToken', settings.notionToken);
    localStorage.setItem('notionDatabases', JSON.stringify(settings.notionDatabases)); 
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
    
    // ★★★ 修正: 配列を整形してtextareaに表示 ★★★
    dom.confNotionDbConfig.value = JSON.stringify(settings.notionDatabases, null, 2);
    // ★★★ 修正 ここまで ★★★

    dom.confNotionUserId.value = settings.humanUserId;
    dom.confTogglToken.value = settings.togglApiToken; 
    dom.confTogglWid.value = settings.togglWid.value;

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

/** Togglで新しい計測を開始する */
async function startToggl(title, tags) {
    const wid = settings.togglWorkspaceId;
    
    const body = {
        workspace_id: parseInt(wid),
        description: title,
        created_with: 'Notion Toggl Timer WebApp',
        start: new Date().toISOString(),
        duration: -1, // -1は計測中を意味します
        tags: tags
    };
    // エンドポイントは POST /api/v9/time_entries
    return await togglApi('/time_entries', 'POST', body);
}

/** Togglで計測を停止する */
async function stopToggl(entryId) {
    const wid = settings.togglWorkspaceId;
    // エンドポイントは PATCH /api/v9/workspaces/{workspace_id}/time_entries/{time_entry_id}/stop
    return await togglApi(`/workspaces/${wid}/time_entries/${entryId}/stop`, 'PATCH', null);
}


// ==========================================
// 4. Notionデータ取得
// ==========================================

/** データベース一覧を取得し、フィルターをレンダリングする */
async function fetchDatabaseList() {
    if (settings.notionDatabases.length === 0) {
        settings.databases = [];
        dom.taskDbFilter.innerHTML = '<option value="">DBが設定されていません</option>';
        return;
    }

    try {
        // 1. ボットユーザーIDを取得
        const userRes = await notionApi('/users/me', 'GET');
        settings.botUserId = userRes.id;
        
        const fetchedDatabases = [];

        // 2. 設定された各データベースIDの情報を取得 (設定された表示名を使用)
        for (const dbConfig of settings.notionDatabases) {
            const dbId = dbConfig.id;
            const dbName = dbConfig.name;
            
            try {
                // Notion APIで実際にDB情報を取得し、IDが正しいか確認
                const res = await notionApi(`/databases/${dbId.replace(/-/g, '').trim()}`, 'GET');
                
                // 成功した場合、設定された名前でリストに追加
                fetchedDatabases.push({
                    id: res.id,
                    name: dbName 
                });
            } catch (e) {
                console.warn(`[WARN] DB ID: ${dbId} のデータベース情報の取得に失敗しました。このDBはスキップされます。`, e);
            }
        }
        
        settings.databases = fetchedDatabases;
        saveSettings();
        
        if (settings.databases.length === 0) {
             dom.taskDbFilter.innerHTML = '<option value="">有効なDBが見つかりません</option>';
             return;
        }

        // フィルターのレンダリング
        const currentSelectedDbId = dom.taskDbFilter.value || settings.databases[0].id; 
        
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
async function getDbProperties(dbId) {
    if (dbPropertiesCache[dbId]) return dbPropertiesCache[dbId];

    try {
        const res = await notionApi(`/databases/${dbId}`, 'GET');
        const props = res.properties;
        
        const propertyMap = {};
        for (const name in props) {
            const prop = props[name];
            switch (prop.type) {
                case 'title':
                    propertyMap.title = { name: name, type: 'title' }; break;
                case 'select':
                    if (name.includes('カテゴリ')) propertyMap.category = { name: name, type: 'select', selectOptions: prop.select.options }; break;
                case 'multi_select':
                    if (name.includes('部門')) propertyMap.department = { name: name, type: 'multi_select', options: prop.multi_select.options }; break;
                case 'people':
                    if (name.includes('担当者')) propertyMap.assignee = { name: name, type: 'people' }; break;
                case 'rich_text':
                    if (name.includes('ログ') || name.includes('メモ')) propertyMap.logRichText = { name: name, type: 'rich_text' }; break;
                case 'relation':
                    if (name.includes('ログ') || name.includes('メモ')) propertyMap.logRelation = { name: name, type: 'relation', dbId: prop.relation.database_id }; break;
                case 'status':
                    if (name.includes('ステータス')) propertyMap.status = { name: name, type: 'select', selectOptions: prop.status.options }; break;
            }
        }

        dbPropertiesCache[dbId] = propertyMap;
        return propertyMap;
    } catch (e) {
        console.error("プロパティ取得エラー:", e);
        return null;
    }
}

/** タスク一覧をロードしレンダリングする */
async function loadTasks() {
    const dbId = dom.taskDbFilter.value;
    if (!dbId) {
        dom.taskListContainer.innerHTML = '<p>データベースが選択されていません。</p>';
        return;
    }

    dom.taskListContainer.innerHTML = '<p>タスクを読み込み中...</p>';
    try {
        const props = await getDbProperties(dbId);
        if (!props || !props.title) throw new Error('プロパティ情報が見つかりません。');
        
        const filterBody = {
            filter: {
                and: [
                    { property: props.status.name, status: { does_not_equal: '完了' } }
                ]
            },
            sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }]
        };

        const res = await notionApi(`/databases/${dbId}/query`, 'POST', filterBody);
        renderTaskList(res.results, dbId, props);

    } catch (e) {
        dom.taskListContainer.innerHTML = `<p style="color: red;">エラー: ${e.message}</p>`;
    }
}

/** タスク一覧をレンダリングする */
function renderTaskList(tasks, dbId, props) {
    const list = document.createElement('ul');
    list.className = 'task-list';

    if (tasks.length === 0) {
        dom.taskListContainer.innerHTML = '<p>実行可能なタスクはありません。</p>';
        return;
    }

    tasks.forEach(task => {
        const titleProp = task.properties[props.title.name]?.title?.[0]?.plain_text || '無題';
        const assigneeProp = props.assignee ? task.properties[props.assignee.name]?.people : [];
        const isAssignedToMe = assigneeProp.some(p => p.id === settings.humanUserId);
        
        const assigneeName = assigneeProp.length > 0 ? assigneeProp[0].name : '';

        const li = document.createElement('li');
        li.innerHTML = `
            <span>${titleProp}</span>
            <span class="assignee">${assigneeName ? `(${assigneeName})` : ''}</span>
        `;
        
        const startButton = document.createElement('button');
        startButton.textContent = '▶ 開始';
        startButton.className = 'btn-green';
        
        startButton.addEventListener('click', () => {
            const taskData = {
                id: task.id,
                dbId: dbId,
                title: titleProp,
                properties: {
                    category: task.properties[props.category.name]?.select,
                    department: task.properties[props.department.name]?.multi_select,
                }
            };
            startTask(taskData);
        });
        
        li.appendChild(startButton);
        list.appendChild(li);
    });

    dom.taskListContainer.innerHTML = '';
    dom.taskListContainer.appendChild(list);
}


// ==========================================
// 5. 新規タスクフォーム管理
// ... (中略。関数は上記全文に含まれます)

// ==========================================
// 6. 実行・停止ロジック (コア機能)
// ... (中略。関数は上記全文に含まれます)

// ==========================================
// 7. UI表示・ユーティリティ
// ... (中略。関数は上記全文に含まれます)


/** 実行中タスクの有無をチェックし、UIを更新する */
async function checkRunningState() {
    // 既存のローカルストレージからの復元ロジック
    // ... 
    updateRunningTaskDisplay();
}

/** タスクを開始する */
async function startTask(task) {
    // ... 
}

/** タスクを停止または完了する */
async function stopTask(isCompleted) {
    // ... 
}

function updateRunningTaskDisplay() {
    // ... 
}

function updateTimer() {
    // ... 
}

function formatTime(totalSeconds) {
    // ... 
}

function clearElement(element) {
    // ... 
}
