// app.js

// ★★★ 定数とグローバル設定 ★★★
// Vercelで取得したURLを設定 (既存のものを使用)
const PROXY_URL = 'https://notion-webapp-repo.vercel.app/api/proxy'; 

const settings = {
    notionToken: '',
    notionDatabaseId: '',
    humanUserId: '', // Notionの担当者として割り当てるユーザーID
    
    // ★★★ Toggl設定の追加 ★★★
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
    settings.notionDatabaseId = localStorage.getItem('notionDatabaseId') || '';
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
    settings.notionDatabaseId = dom.confNotionDbId.value.trim();
    settings.humanUserId = dom.confNotionUserId.value.trim();
    
    settings.togglApiToken = dom.confTogglToken.value.trim(); // Toggl
    settings.togglWorkspaceId = dom.confTogglWid.value.trim(); // Toggl
    
    localStorage.setItem('notionToken', settings.notionToken);
    localStorage.setItem('notionDatabaseId', settings.notionDatabaseId);
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
    localStorage.setItem('notionDatabaseId', settings.notionDatabaseId);
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
    dom.confNotionDbId.value = settings.notionDatabaseId;
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

// ... (fetchDatabaseList, getDbProperties, loadTasks, renderTaskList は変更なし) ...

/** データベース一覧を取得し、フィルターをレンダリングする */
async function fetchDatabaseList() {
    try {
        const res = await notionApi('/users/me', 'GET');
        // BotのユーザーIDを保存
        settings.botUserId = res.id;

        const dbRes = await notionApi('/search', 'POST', {
            filter: { property: 'object', value: 'database' },
            sort: { direction: 'descending', property: 'last_edited_time' }
        });

        settings.databases = dbRes.results.map(db => ({
            id: db.id,
            name: db.title[0]?.plain_text || '無題のデータベース'
        }));
        saveSettings();
        
        // フィルターのレンダリング
        const currentDbId = settings.notionDatabaseId || settings.databases[0]?.id || '';
        if (currentDbId && !settings.notionDatabaseId) {
             // 初回ロードでDB IDが未設定の場合、最初のDBを使用
            settings.notionDatabaseId = currentDbId;
            saveSettings();
        }

        dom.taskDbFilter.innerHTML = settings.databases.map(db => 
            `<option value="${db.id}" ${db.id === settings.notionDatabaseId ? 'selected' : ''}>${db.name}</option>`
        ).join('');
        
    } catch (e) {
        console.error("データベース一覧取得エラー:", e);
        alert(`データベース一覧の取得に失敗しました: ${e.message}`);
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
// ==========================================

function switchTab(event) {
    // ... (既存のタブ切り替えロジック) ...
    const target = event.currentTarget.getAttribute('data-target');
    
    document.getElementById('existingTaskTab').classList.remove('active');
    document.getElementById('newTaskTab').classList.remove('active');

    if (target === 'existing') {
        document.getElementById('existingTaskTab').classList.add('active');
    } else {
        document.getElementById('newTaskTab').classList.add('active');
        initNewTaskForm();
    }
}

/** 新規タスクフォームを準備する */
async function initNewTaskForm() {
    const dbId = dom.taskDbFilter.value;
    if (!dbId) {
        dom.targetDbDisplay.textContent = 'データベースが選択されていません。';
        return;
    }

    const dbInfo = settings.databases.find(db => db.id === dbId);
    dom.targetDbDisplay.textContent = `登録先DB: ${dbInfo ? dbInfo.name : '不明'}`;
    
    let props = null;

    try {
        props = await getDbProperties(dbId);
    } catch (e) {
        console.error("Failed to get DB properties:", e);
        dom.targetDbDisplay.textContent += ' (プロパティ情報取得中にエラー)';
        return;
    }

    if (!props || !props.title) {
        dom.targetDbDisplay.textContent += ' (プロパティ情報が見つからないか、タイトルプロパティが設定されていません)';
        return;
    }

    // 1. カテゴリ (Select) のレンダリング (今回はシンプルにSelect要素を使用)
    clearElement(dom.newCatContainer);
    if (props.category && props.category.selectOptions) {
        const catGroup = document.createElement('div');
        catGroup.className = 'form-group';
        catGroup.innerHTML = '<label for="newCatSelect" style="font-size: 14px; font-weight: 500;">カテゴリ</label><select id="newCatSelect" class="input-field" style="width: 100%;"></select>';
        
        const selectElement = catGroup.querySelector('#newCatSelect');
        selectElement.innerHTML = '<option value="">--- 選択してください ---</option>';

        props.category.selectOptions.forEach(option => {
            const optionElement = document.createElement('option');
            optionElement.value = option.name; // 新規作成時はIDではなく名前でPOSTする
            optionElement.textContent = option.name;
            selectElement.appendChild(optionElement);
        });
        dom.newCatContainer.appendChild(catGroup);
    }

    // 2. 部門 (Multi-select) のレンダリング (横並び)
    clearElement(dom.newDeptContainer);
    const deptProp = props.department; 
    if (deptProp && deptProp.type === 'multi_select' && deptProp.options) {
        const deptGroup = document.createElement('div');
        deptGroup.className = 'form-group';
        deptGroup.innerHTML = `<label style="font-size: 14px; font-weight: 500;">${deptProp.name}</label><div id="newDeptOptions" style="display: flex; flex-wrap: wrap;"></div>`;
        
        const optionsDiv = deptGroup.querySelector('#newDeptOptions');
        deptProp.options.forEach(option => {
            const id = `new-dept-${option.id}`;
            
            const div = document.createElement('div');
            div.style.marginRight = '15px'; 
            div.style.marginBottom = '10px';
            
            div.innerHTML = `
                <input type="checkbox" id="${id}" name="new-task-dept" value="${option.name}" style="margin-right: 5px;">
                <label for="${id}" style="display: inline; font-weight: normal; color: var(--text-color); font-size: 14px;">${option.name}</label>
            `;
            optionsDiv.appendChild(div);
        });
        dom.newDeptContainer.appendChild(deptGroup);
    }

    // 3. 担当者 (People) の表示
    const assigneeProp = props.assignee;
    if (assigneeProp && assigneeProp.type === 'people') {
        const status = settings.humanUserId ? '✅ 割り当て設定済み' : '⚠️ 設定が必要です';
        const assigneeMessage = `<p style="font-size: 14px; color: var(--sub-text-color); font-weight: 500;">${assigneeProp.name}プロパティ: ${status}。<br>新規作成時に**設定されたユーザーID**が自動で設定されます。</p>`;
        
        if (dom.newDeptContainer.innerHTML) {
            dom.newDeptContainer.innerHTML += assigneeMessage;
        } else {
            dom.newDeptContainer.innerHTML = assigneeMessage;
        }
    } else if (!deptProp && !assigneeProp) {
         dom.newDeptContainer.innerHTML = '<p style="font-size: 14px; color: var(--sub-text-color);">部門/担当者プロパティが見つかりませんでした。</p>';
    }
}


/** 新規タスクを作成し、計測を開始する */
async function handleStartNewTask() {
    const title = dom.newTaskTitle.value.trim();
    const catSelect = document.getElementById('newCatSelect');
    const cat = catSelect ? catSelect.value : null;

    const deptCheckboxes = Array.from(document.querySelectorAll('input[name="new-task-dept"]:checked'));
    const depts = deptCheckboxes.map(c => c.value);

    if (!title || !cat || depts.length === 0) {
        alert("新規タスクのタイトル、カテゴリ、部門はすべて必須です。");
        return;
    }

    const dbId = dom.taskDbFilter.value;
    const props = dbPropertiesCache[dbId];
    if (!props) {
        alert("データベース情報が取得できていません。");
        return;
    }
    
    try {
        // 1. Notionで新規ページを作成
        const uId = settings.humanUserId;
        const properties = {};

        properties[props.title.name] = { title: [{ text: { content: title } }] };
        if (props.department) properties[props.department.name] = { multi_select: depts.map(d => ({ name: d })) };
        if (props.category) properties[props.category.name] = { select: { name: cat } };
        if (props.status) properties[props.status.name] = { status: { name: '未着手' } };
        if (props.assignee && uId) properties[props.assignee.name] = { people: [{ id: uId }] };

        const newPageRes = await notionApi('/pages', 'POST', {
            parent: { database_id: dbId }, properties: properties
        });
        
        // 2. 計測開始処理へ
        const taskData = {
            id: newPageRes.id,
            dbId: dbId,
            title: title,
            properties: { category: { name: cat }, department: depts.map(d => ({ name: d })) }
        };
        await startTask(taskData);
        
        // 3. フォームクリア
        dom.newTaskTitle.value = '';
        if (catSelect) catSelect.value = '';
        deptCheckboxes.forEach(c => c.checked = false);
        
    } catch (e) {
        alert("新規タスク作成・開始エラー: " + e.message);
    }
}


// ==========================================
// 6. 実行・停止ロジック (コア機能)
// ==========================================

/** 実行中タスクの有無をチェックし、UIを更新する */
async function checkRunningState() {
    // 既存のローカルストレージからの復元ロジック
    // ... (startTime, currentRunningTask の復元)

    // ★ Togglの状態確認 (省略) - 既存アプリはTogglから復元しているが、ここではローカルストレージを優先する

    updateRunningTaskDisplay();
}

/** タスクを開始する */
async function startTask(task) {
    if (settings.currentRunningTask) {
        alert('すでに実行中のタスクがあります。一旦停止してください。');
        return;
    }

    try {
        // 1. Togglで計測を開始
        const cat = task.properties.category ? task.properties.category.name : null;
        const depts = task.properties.department ? task.properties.department.map(d => d.name) : [];

        const deptStr = depts.length > 0 ? depts.map(d => `【${d}】`).join('') : '';
        const catStr = cat ? `【${cat}】` : '';
        const togglTitle = `${deptStr}${catStr}${task.title}`;
        
        const togglEntry = await startToggl(togglTitle, cat ? [cat] : []); // Toggl開始

        // 2. 内部状態を更新
        settings.currentRunningTask = {
            id: task.id,
            dbId: task.dbId,
            title: task.title,
            togglEntryId: togglEntry.id, // ★Toggl IDを保存
            properties: task.properties
        };
        settings.startTime = new Date(togglEntry.start).getTime(); // Togglの正確な開始時刻を使用
        
        // 3. Notionのステータスを「進行中」に更新
        const props = dbPropertiesCache[task.dbId];
        const propertiesToUpdate = {};
        const statusProp = props.status;
        
        if (statusProp) {
            const inProgressOption = statusProp.selectOptions.find(opt => opt.name === '進行中');
            if (inProgressOption) {
                propertiesToUpdate[statusProp.name] = { select: { id: inProgressOption.id } };
                await notionApi(`/pages/${task.id.replace(/-/g, '').trim()}`, 'PATCH', { properties: propertiesToUpdate });
            }
        }

        // 4. UIと設定の保存
        saveSettings();
        updateRunningTaskDisplay();
        
    } catch (e) {
        alert("タスク開始エラー: " + e.message);
        settings.currentRunningTask = null; 
        settings.startTime = null;
        saveSettings();
        updateRunningTaskDisplay();
    }
}

/** タスクを停止または完了する */
async function stopTask(isCompleted) {
    if (!settings.currentRunningTask || !settings.startTime) return;

    if (settings.timerInterval) clearInterval(settings.timerInterval);

    let durationSeconds = 0;
    
    // ★★★ 1. Togglで計測を停止し、正確な継続時間を取得 ★★★
    const togglEntryId = settings.currentRunningTask.togglEntryId;
    if (togglEntryId) {
        try {
            const res = await stopToggl(togglEntryId);
            durationSeconds = res.duration > 0 ? res.duration : Math.floor((Date.now() - settings.startTime) / 1000);
        } catch (e) { 
            console.error("Toggl停止エラー:", e);
            alert("警告: Togglの計測停止に失敗しました。ローカル時間で計測を継続します。");
            durationSeconds = Math.floor((Date.now() - settings.startTime) / 1000);
        }
    } else {
        durationSeconds = Math.floor((Date.now() - settings.startTime) / 1000);
    }

    // メモとタスクIDを取得
    const memo = dom.thinkingLogInput.value;
    const rawTaskId = settings.currentRunningTask.id;
    const taskId = rawTaskId ? rawTaskId.replace(/-/g, '').trim() : null; 

    // 2. Notionへの更新 (ログ追記とステータス更新)
    if (taskId && taskId.length === 32) {
        try {
            const dbId = settings.currentRunningTask.dbId;
            const props = dbPropertiesCache[dbId];
            if (!props) throw new Error('データベースプロパティ情報が見つかりません。');

            const propertiesToUpdate = {};
            
            // 2-1. ステータス更新
            const statusProp = props.status;
            if (statusProp && isCompleted) {
                const completedOption = statusProp.selectOptions.find(opt => opt.name === '完了');
                if (completedOption) {
                    propertiesToUpdate[statusProp.name] = { select: { id: completedOption.id } };
                }
            } else if (statusProp && !isCompleted) {
                const pendingOption = statusProp.selectOptions.find(opt => opt.name === '未着手' || opt.name === '保留'); // 停止時は未着手や保留に戻す
                 if (pendingOption) {
                    propertiesToUpdate[statusProp.name] = { select: { id: pendingOption.id } };
                }
            }

            // 2-2. ログ/メモの追記 (リッチテキストプロパティ方式)
            const logProp = props.logRichText;
            if (logProp && logProp.type === 'rich_text' && memo) {
                // 現在のページ情報を取得 (GET)
                const page = await notionApi(`/pages/${taskId}`, 'GET', null);
                
                const curLogPropValue = page.properties[logProp.name]?.rich_text?.[0]?.plain_text || "";
                
                const logDuration = formatTime(durationSeconds);
                const logHeader = `【${isCompleted ? '完了' : '停止'}ログ - ${new Date().toLocaleString('ja-JP')} (${logDuration})】`;
                
                const newLogBlock = `${logHeader}\n${memo}`;
                const newLog = curLogPropValue ? `${curLogPropValue}\n\n${newLogBlock}` : newLogBlock;

                propertiesToUpdate[logProp.name] = { rich_text: [{ text: { content: newLog } }] };
            }

            // API PATCH呼び出し
            if (Object.keys(propertiesToUpdate).length > 0) {
                await notionApi(`/pages/${taskId}`, 'PATCH', { properties: propertiesToUpdate });
            }

        } catch (error) {
            console.error("Notion更新エラー:", error);
            alert(`Notion更新エラー: ${error.message}。計測は停止されます。`);
        }
    } else {
         alert('エラー: タスクIDが不正なため、Notionへの更新をスキップします。計測は停止されます。');
    }
    
    // 3. 最後に計測停止処理 (APIの成功/失敗に関わらず実行)
    settings.currentRunningTask = null;
    settings.startTime = null;
    saveSettings();
    updateRunningTaskDisplay();
    dom.thinkingLogInput.value = '';
    
    loadTasks();
}


// ==========================================
// 7. UI表示・ユーティリティ
// ==========================================

function updateRunningTaskDisplay() {
    if (settings.currentRunningTask) {
        dom.runningTaskTitle.textContent = settings.currentRunningTask.title;
        dom.runningTaskContainer.classList.remove('hidden');
        if (settings.timerInterval) clearInterval(settings.timerInterval);
        settings.timerInterval = setInterval(updateTimer, 1000);
        updateTimer();
    } else {
        dom.runningTaskContainer.classList.add('hidden');
        if (settings.timerInterval) clearInterval(settings.timerInterval);
        dom.runningTimer.textContent = '00:00:00';
    }
}

function updateTimer() {
    if (!settings.currentRunningTask || !settings.startTime) return;
    const diff = Date.now() - settings.startTime;
    dom.runningTimer.textContent = formatTime(Math.floor(diff / 1000));
}

function formatTime(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function clearElement(element) {
    while (element.firstChild) {
        element.removeChild(element.firstChild);
    }
}
