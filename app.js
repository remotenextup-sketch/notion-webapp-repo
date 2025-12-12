// app.js 全文 (最終版: KPIレポートのバグ修正と構文エラー解消済み)

// ★★★ 定数とグローバル設定 ★★★
const PROXY_URL = 'https://company-notion-toggl-api.vercel.app/api/proxy'; 

const settings = {
    notionToken: '',
    notionDatabases: [], // [{ name: "DB名", id: "DBID" }, ...]
    humanUserId: '', 
    
    togglApiToken: '',
    togglWorkspaceId: '', 
    
    databases: [], 
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
    confNotionUserId: document.getElementById('confNotionUserId'),
    confTogglToken: document.getElementById('confTogglToken'), 
    confTogglWid: document.getElementById('confTogglWid'),     
    
    // DB設定動的フォーム
    dbConfigContainer: document.getElementById('dbConfigContainer'),
    addDbConfigButton: document.getElementById('addDbConfig'),

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
    targetDbDisplay: document.getElementById('targetDbDisplay'),

    // タブボタン (KPIレポートは除外)
    startExistingTask: document.getElementById('startExistingTask'),
    startNewTask: document.getElementById('startNewTask'),
    existingTaskTab: document.getElementById('existingTaskTab'),
    newTaskTab: document.getElementById('newTaskTab'),
    taskSelectionSection: document.getElementById('taskSelectionSection'),
    
    // KPIレポート要素
    toggleKpiReportBtn: document.getElementById('toggleKpiReportBtn'), 
    kpiReportTab: document.getElementById('kpiReportTab'),
    reportPeriodSelect: document.getElementById('reportPeriodSelect'),
    fetchKpiButton: document.getElementById('fetchKpiButton'),
    reportTotalTime: document.getElementById('reportTotalTime'),
    kpiResultsContainer: document.getElementById('kpiResultsContainer')
};

// ==========================================
// 0. UX改善 (通知機能)
// ==========================================

/** 指定されたメッセージを短時間通知表示する */
function showNotification(message, duration = 3000) {
    let notification = document.getElementById('appNotification');
    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'appNotification';
        // スタイルはCSSではなく、ここで直接指定（シンプルな通知のため）
        notification.style.cssText = `
            position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
            background-color: #4CAF50; color: white; padding: 10px 20px;
            border-radius: 5px; z-index: 1000; opacity: 0; transition: opacity 0.5s;
            font-size: 14px; box-shadow: 0 4px 8px rgba(0,0,0,0.2);
        `;
        document.body.appendChild(notification);
    }
    
    notification.textContent = message;
    notification.style.opacity = '1';

    // 既存のタイマーがあればクリア
    clearTimeout(notification.timer); 

    // 指定時間後に非表示にするタイマーを設定
    notification.timer = setTimeout(() => {
        notification.style.opacity = '0';
    }, duration);
}


// ==========================================
// 1. 初期化 & 設定管理
// ==========================================

/** ローカルストレージから設定を読み込む */
function loadSettings() {
    settings.notionToken = localStorage.getItem('notionToken') || '';
    
    const dbConfigJson = localStorage.getItem('notionDatabases') || '[]';
    try {
        const parsed = JSON.parse(dbConfigJson);
        settings.notionDatabases = Array.isArray(parsed) ? parsed : [];
    } catch {
        settings.notionDatabases = [];
    }

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

/** データベース設定フォームのペアをレンダリングする */
function renderDbConfigForms() {
    clearElement(dom.dbConfigContainer);

    // 設定がない場合、空のフォームを一つ追加
    if (settings.notionDatabases.length === 0) {
        settings.notionDatabases.push({ name: '', id: '' });
    }

    settings.notionDatabases.forEach((db, index) => {
        const div = document.createElement('div');
        div.className = 'db-config-pair';
        div.style.marginBottom = '10px';
        div.innerHTML = `
            <div class="form-group" style="margin-bottom: 5px;">
                <input type="text" placeholder="表示名 (例: タスクDB)" class="input-field db-name-input" 
                        data-index="${index}" value="${db.name}" style="margin-bottom: 5px;">
                <input type="text" placeholder="データベースID (32桁)" class="input-field db-id-input" 
                        data-index="${index}" value="${db.id}">
            </div>
        `;
        dom.dbConfigContainer.appendChild(div);
    });
}

/** データベース設定の追加ボタンのハンドラ */
function handleAddDbConfig() {
    settings.notionDatabases.push({ name: '', id: '' });
    renderDbConfigForms(); 
}


/** 設定を保存する */
function handleSaveSettings() {
    settings.notionToken = dom.confNotionToken.value.trim();
    
    // フォームから配列を読み取る
    const newDbConfigs = [];
    const names = Array.from(document.querySelectorAll('.db-name-input'));
    const ids = Array.from(document.querySelectorAll('.db-id-input'));

    names.forEach((nameInput, index) => {
        const idInput = ids[index];
        const name = nameInput.value.trim();
        const id = idInput.value.trim();

        if (name && id) { // 両方入力されているもののみ採用
            newDbConfigs.push({ name: name, id: id });
        }
    });

    settings.notionDatabases = newDbConfigs;

    if (settings.notionDatabases.length === 0) {
        alert("データベース設定が一つも入力されていません。"); // 処理中断のためalertを保持
        return; 
    }

    settings.humanUserId = dom.confNotionUserId.value.trim();
    
    settings.togglApiToken = dom.confTogglToken.value.trim(); 
    settings.togglWorkspaceId = dom.confTogglWid.value.trim(); 
    
    localStorage.setItem('notionToken', settings.notionToken);
    localStorage.setItem('notionDatabases', JSON.stringify(settings.notionDatabases));
    localStorage.setItem('humanUserId', settings.humanUserId);
    localStorage.setItem('togglApiToken', settings.togglApiToken);
    localStorage.setItem('togglWorkspaceId', settings.togglWorkspaceId);
    
    showNotification('設定を保存しました。'); // 通知に変更
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

/** 設定画面を表示 */
function showSettings() {
    dom.confNotionToken.value = settings.notionToken;
    
    renderDbConfigForms();

    dom.confNotionUserId.value = settings.humanUserId;
    dom.confTogglToken.value = settings.togglApiToken; 
    dom.confTogglWid.value = settings.togglWorkspaceId; 

    dom.mainView.classList.add('hidden');
    dom.settingsView.classList.remove('hidden');
}

/** 設定画面を非表示 */
function hideSettings() {
    dom.settingsView.classList.add('hidden');
    dom.mainView.classList.remove('hidden');
}


// ==========================================
// 2. API基盤 (Notion & Toggl)
// ==========================================

/** 外部APIへのリクエストをプロキシ経由で送信する */
async function externalApi(targetUrl, method, authDetails, body) { 
    const proxyPayload = {
        targetUrl: targetUrl,
        method: method,
        tokenKey: authDetails.tokenKey, 
        tokenValue: authDetails.tokenValue,
        notionVersion: authDetails.notionVersion, 
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
    
    console.log(`[NotionAPI] Calling ${method} ${fullUrl}`); 

    const authDetails = {
        tokenKey: 'notionToken', 
        tokenValue: settings.notionToken, 
        notionVersion: '2022-06-28' 
    };

    try {
        const res = await externalApi(fullUrl, method, authDetails, body); 
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
    
    console.log(`[TogglAPI] Calling ${method} ${fullUrl}`); 

    const authDetails = {
        tokenKey: 'togglApiToken',
        tokenValue: settings.togglApiToken,
        notionVersion: '' 
    };

    try {
        const res = await externalApi(fullUrl, method, authDetails, body); 
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
    return await togglApi('/time_entries', 'POST', body);
}

/** Togglで計測を停止する */
async function stopToggl(entryId) {
    const wid = settings.togglWorkspaceId;
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
                const res = await notionApi(`/databases/${dbId.replace(/-/g, '').trim()}`, 'GET');
                
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
        if (e.message.includes('API Error (400)') || e.message.includes('API Error (401)')) {
            // 認証失敗など、続行不可能なエラーはalertを保持
            alert(`Notion APIトークンまたは権限に問題があるため、データベース一覧の取得に失敗しました。設定を確認してください。`); 
        } else {
             alert(`データベース一覧の取得に失敗しました: ${e.message}`); // 処理中断のためalertを保持
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
        
        // ステータスが「完了」ではないものを取得するフィルター
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
// 5. タスクフォーム/タブ管理
// ==========================================

/** タブを切り替える */
function switchTab(event) {
    const target = event.target.dataset.target;

    dom.startExistingTask.classList.remove('active');
    dom.startNewTask.classList.remove('active');
    event.target.classList.add('active');

    if (target === 'existing') {
        dom.existingTaskTab.classList.remove('hidden');
        dom.newTaskTab.classList.add('hidden');
    } else {
        dom.existingTaskTab.classList.add('hidden');
        dom.newTaskTab.classList.remove('hidden');
        renderNewTaskForm(); 
    }
}

/** 新規タスクフォームをレンダリング */
async function renderNewTaskForm() {
    const dbId = dom.taskDbFilter.value;
    if (!dbId) {
        dom.targetDbDisplay.textContent = 'エラー: データベースを選択してください。';
        clearElement(dom.newCatContainer);
        clearElement(dom.newDeptContainer);
        return;
    }

    const db = settings.databases.find(d => d.id === dbId);
    dom.targetDbDisplay.textContent = `新規タスクの作成先: ${db ? db.name : '不明なDB'}`;

    try {
        const props = await getDbProperties(dbId);
        
        // カテゴリ (Select) のレンダリング -> ラジオボタン
        if (props.category) {
            dom.newCatContainer.innerHTML = `
                <div class="form-group">
                    <label>${props.category.name}:</label>
                    <div style="display: flex; gap: 15px; flex-wrap: wrap;">
                        ${props.category.selectOptions.map(opt => 
                            `<label style="display: flex; align-items: center;">
                                <input type="radio" name="newCatSelect" class="cat-radio" value="${opt.id}" style="margin-right: 5px;">
                                ${opt.name}
                            </label>`
                        ).join('')}
                    </div>
                </div>
            `;
        } else { clearElement(dom.newCatContainer); }

        // 部門 (Multi-select) のレンダリング (チェックボックス形式)
        if (props.department) {
            dom.newDeptContainer.innerHTML = `
                <div class="form-group">
                    <label>${props.department.name}:</label>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                    ${props.department.options.map(opt => `
                        <label>
                            <input type="checkbox" class="dept-checkbox" data-id="${opt.id}">
                            ${opt.name}
                        </label>
                    `).join('')}
                    </div>
                </div>
            `;
        } else { clearElement(dom.newDeptContainer); }

    } catch (e) {
        dom.targetDbDisplay.textContent = `フォームの読み込みエラー: ${e.message}`;
        clearElement(dom.newCatContainer);
        clearElement(dom.newDeptContainer);
    }
}

/** 新規タスク作成・開始のハンドラ */
async function handleStartNewTask() {
    const title = dom.newTaskTitle.value.trim();
    const dbId = dom.taskDbFilter.value;
    
    if (!title) { alert('タスク名を入力してください。'); return; } // 処理中断のためalertを保持
    if (!dbId) { alert('データベースを選択してください。'); return; } // 処理中断のためalertを保持

    try {
        const props = await getDbProperties(dbId);
        
        const properties = {
            // 1. タイトル
            [props.title.name]: {
                title: [{ text: { content: title } }]
            },
        };
        
        // 2. カテゴリ (Select)
        const selectedCatRadio = document.querySelector('input[name="newCatSelect"]:checked');
        if (props.category && selectedCatRadio) {
            properties[props.category.name] = { select: { id: selectedCatRadio.value } };
        }

        // 3. 部門 (Multi-select)
        const selectedDepts = Array.from(document.querySelectorAll('.dept-checkbox:checked'))
                             .map(cb => ({ id: cb.dataset.id }));
        if (props.department && selectedDepts.length > 0) {
            properties[props.department.name] = { multi_select: selectedDepts };
        }

        // 4. 担当者 (自動で自分を設定)
        if (props.assignee && settings.humanUserId) {
             properties[props.assignee.name] = { people: [{ id: settings.humanUserId }] };
        }

        // 5. ステータスを '進行中' に設定 (プロパティ名に注意)
        if (props.status) {
             const statusOption = props.status.selectOptions.find(o => o.name === '進行中');
             if (statusOption) {
                 properties[props.status.name] = { status: { id: statusOption.id } };
             }
        }
        
        // Notionページ作成APIコール
        const createRes = await notionApi('/pages', 'POST', {
            parent: { database_id: dbId },
            properties: properties
        });
        
        const newTaskData = {
            id: createRes.id,
            dbId: dbId,
            title: title,
            properties: {} 
        };

        showNotification(`新規タスク「${title}」を作成しました。計測を開始します。`); // 通知に変更
        startTask(newTaskData);
        dom.newTaskTitle.value = ''; // フォームをクリア

    } catch (e) {
        alert(`新規タスクの作成に失敗しました: ${e.message}`); // 処理中断のためalertを保持
        console.error(e);
    }
}


// ==========================================
// 6. 実行・停止ロジック (コア機能)
// ==========================================

/** タスク計測を開始する */
async function startTask(task) {
    if (settings.currentRunningTask) {
        alert('既にタスクが実行中です。現在のタスクを完了または停止してください。'); // 処理中断のためalertを保持
        return;
    }
    
    try {
        // Togglのタグを構築
        const tags = [];
        const cat = task.properties.category?.name;
        const depts = task.properties.department?.map(d => d.name) || [];
        if (cat) tags.push(cat);
        depts.forEach(d => tags.push(d));

        // 1. Toggl計測開始
        const togglEntry = await startToggl(task.title, tags);
        task.togglEntryId = togglEntry.id;
        
        // 2. 状態保存
        settings.currentRunningTask = task;
        settings.startTime = Date.now();
        
        // 3. Notionステータスを '進行中' に更新 (ここでエラーになっても計測は継続させる)
        try {
            const props = await getDbProperties(task.dbId);
            if (props.status) {
                const statusOption = props.status.selectOptions.find(o => o.name === '進行中');
                if (statusOption) {
                    await notionApi(`/pages/${task.id}`, 'PATCH', {
                        properties: {
                            [props.status.name]: { status: { id: statusOption.id } }
                        }
                    });
                }
            }
        } catch (e) {
            console.warn("Notionステータス更新中に警告が発生しました:", e.message);
        }

        // 4. UI更新と保存
        saveSettings();
        updateRunningTaskDisplay(true);
        loadTasks(); // タスク一覧をリロード
        showNotification(`タスク「${task.title}」を開始しました。`); // 通知に変更
        
    } catch (e) {
        alert(`タスクの開始に失敗しました: ${e.message}`); // 処理中断のためalertを保持
        console.error(e);
        settings.currentRunningTask = null;
        settings.startTime = null;
        saveSettings();
    }
}

/** タスク計測を停止または完了する */
async function stopTask(isComplete) {
    if (!settings.currentRunningTask || !settings.currentRunningTask.togglEntryId) {
        alert('実行中のタスクはありません。'); // 処理中断のためalertを保持
        return;
    }

    const task = settings.currentRunningTask;
    const logText = dom.thinkingLogInput.value.trim();
    const duration = Date.now() - settings.startTime;

    try {
        // 1. Toggl計測停止
        await stopToggl(task.togglEntryId);
        
        // 2. Notionページを更新
        const props = await getDbProperties(task.dbId);
        const patchBody = { properties: {} };
        
        // ステータス更新
        if (props.status && isComplete) {
            const statusOption = props.status.selectOptions.find(o => o.name === '完了');
            if (statusOption) {
                patchBody.properties[props.status.name] = { status: { id: statusOption.id } };
            }
        }
        
        // ログ更新
        if (logText && props.logRichText) {
            patchBody.properties[props.logRichText.name] = {
                rich_text: [{ type: "text", text: { content: logText } }]
            };
        } else if (logText && props.logRelation) {
            // Relationプロパティの場合、新規ログページを作成して関連付けるロジックが必要（ここではスキップ）
            console.warn("Relationログプロパティへの書き込みは未実装です。");
        }


        // 実際にNotionに PATCH リクエストを送信
        if (Object.keys(patchBody.properties).length > 0) {
            await notionApi(`/pages/${task.id}`, 'PATCH', patchBody);
        }

        // 3. 状態クリアとUI更新
        settings.currentRunningTask = null;
        settings.startTime = null;
        dom.thinkingLogInput.value = '';

        saveSettings();
        updateRunningTaskDisplay(false);
        loadTasks();
        
        // 通知に変更
        showNotification(`タスク「${task.title}」を${isComplete ? '完了' : '停止'}しました。計測時間: ${formatTime(duration)}`);
        
    } catch (e) {
        alert(`タスクの停止/完了処理中にエラーが発生しました: ${e.message}`); // 処理中断のためalertを保持
        console.error(e);
        // エラー時も計測状態はクリアし、手動でTogglを停止するよう促す
        settings.currentRunningTask = null;
        settings.startTime = null;
        saveSettings();
        updateRunningTaskDisplay(false);
    }
}


/** 実行中タスクの有無をチェックし、UIを更新する */
async function checkRunningState() {
    if (settings.currentRunningTask && settings.startTime) {
        updateRunningTaskDisplay(true);
    } else {
        updateRunningTaskDisplay(false);
    }
}

/** 実行中タスクの表示を更新 */
function updateRunningTaskDisplay(isRunning) {
    if (isRunning) {
        dom.runningTaskContainer.classList.remove('hidden');
        dom.taskSelectionSection.classList.add('hidden');
        dom.runningTaskTitle.textContent = settings.currentRunningTask.title || '実行中タスク';
        if (!settings.timerInterval) {
            settings.timerInterval = setInterval(updateTimer, 1000);
        }
    } else {
        dom.runningTaskContainer.classList.add('hidden');
        dom.taskSelectionSection.classList.remove('hidden');
        if (settings.timerInterval) {
            clearInterval(settings.timerInterval);
            settings.timerInterval = null;
        }
        dom.runningTimer.textContent = '00:00:00';
    }
}

/** タイマーを更新する */
function updateTimer() {
    if (settings.startTime) {
        const elapsed = Date.now() - settings.startTime;
        dom.runningTimer.textContent = formatTime(elapsed);
    }
}

/** ミリ秒を H:MM:SS 形式にフォーマット */
function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = (num) => num.toString().padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/** DOM要素の内容をクリアするユーティリティ関数 */
function clearElement(element) {
    element.innerHTML = '';
}


// ==========================================
// 7. KPIレポートロジック
// ==========================================

/** Togglレポート用の開始日と終了日 (ISO形式) を計算する (月曜始まり) */
function calculateReportDates(period) {
    const now = new Date();
    const start = new Date(now);
    const end = new Date(now);

    const currentDay = start.getDay(); // 0=日曜, 1=月曜, ...
    
    // 日本の週次 (月曜始まり) に対応
    const diffToMonday = (currentDay === 0 ? 6 : currentDay - 1); 

    if (period === 'current_week') {
        start.setDate(now.getDate() - diffToMonday); // 今週の月曜日に設定
        end.setHours(23, 59, 59, 999); // 終了日は今日の終わりまで
    } else if (period === 'last_week') {
        start.setDate(now.getDate() - diffToMonday - 7); 
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
    } else if (period === 'current_month') {
        start.setDate(1); // 今月の1日に設定
        end.setMonth(now.getMonth() + 1, 0); // 来月の0日目 = 今月の最終日
        end.setHours(23, 59, 59, 999);
    } else if (period === 'last_month') {
        start.setMonth(now.getMonth() - 1, 1); // 先月の1日に設定
        end.setMonth(now.getMonth(), 0); // 今月の0日目 = 先月の最終日
        end.setHours(23, 59, 59, 999);
    }
    
    // 時間部分をリセット (開始日は00:00:00)
    start.setHours(0, 0, 0, 0);
    
    // DateオブジェクトをYYYY-MM-DD形式に変換
    const format = (date) => date.toISOString().split('T')[0];

    return { 
        start: format(start),
        end: format(end)
    };
}


/** Toggl Reports APIを呼び出し、カテゴリ別に集計する */
async function fetchKpiReport() {
    if (!settings.togglApiToken || !settings.togglWorkspaceId || !settings.humanUserId) {
        dom.kpiResultsContainer.innerHTML = '<p style="color: red;">エラー: Toggl設定またはNotionユーザーIDが不完全です。設定画面を確認してください。</p>';
        return;
    }

    const period = dom.reportPeriodSelect.value;
    const { start, end } = calculateReportDates(period);
    const wid = settings.togglWorkspaceId;

    dom.kpiResultsContainer.innerHTML = `<p>レポート期間: ${start} 〜 ${end}<br>集計中...</p>`;

    try {
        // ★★★ 【修正ポイント】Toggl Reports API v3 のフルURLを直接構築する ★★★
        const targetUrl = `https://api.track.toggl.com/reports/api/v3/workspace/${wid}/search/time_entries`; 
        
        const body = {
            // レポートAPIはISO 8601形式を要求するため、時間を付加
            start_date: start + 'T00:00:00Z', 
            end_date: end + 'T23:59:59Z',
            user_ids: [settings.humanUserId],
        };
        
        // Toggl認証詳細を構築
        const authDetails = {
            tokenKey: 'togglApiToken',
            tokenValue: settings.togglApiToken, // 値はプロキシ側では使われないが、構造上必要
            notionVersion: '' 
        };

        // togglApiを介さず、externalApiを直接呼び出す
        // これにより、URLの二重付与を防ぎ、正しいURLでPOSTリクエストを送信できる
        const allEntries = await externalApi(targetUrl, 'POST', authDetails, body); 
        
        // ★★★ 修正終わり ★★★
        
        if (!allEntries || allEntries.length === 0) {
            dom.kpiResultsContainer.innerHTML = '<p>この期間に計測されたタスクはありません。</p>';
            dom.reportTotalTime.textContent = '総計測時間: 00:00:00';
            return;
        }

        // --- ローカル集計ロジック (以降は変更なし) ---
        const categoryTimes = {};
        let totalDurationMs = 0;
        const knownCategories = ['思考', '作業', '教育'];

        for (const entry of allEntries) {
            if (entry.duration <= 0) continue; 
            
            const durationMs = entry.duration * 1000;
            totalDurationMs += durationMs;

            let assignedCategory = 'その他';
            
            if (entry.tags && entry.tags.length > 0) {
                for (const tag of entry.tags) {
                    if (knownCategories.includes(tag)) {
                        assignedCategory = tag;
                        break; 
                    }
                }
            }
            
            categoryTimes[assignedCategory] = (categoryTimes[assignedCategory] || 0) + durationMs;
        }

        // --- 結果のレンダリング ---
        dom.reportTotalTime.textContent = `総計測時間: ${formatTime(totalDurationMs)}`;
        
        let html = '<ul class="task-list">';
        
        const sortedCategories = Object.keys(categoryTimes).sort((a, b) => categoryTimes[b] - categoryTimes[a]);

        sortedCategories.forEach(cat => {
            const ms = categoryTimes[cat];
            const percentage = totalDurationMs > 0 ? ((ms / totalDurationMs) * 100).toFixed(1) : 0;
            
            html += `
                <li>
                    <span>${cat}:</span>
                    <span>
                        ${formatTime(ms)} 
                        <span style="font-weight: bold; color: ${percentage > 30 ? '#007bff' : 'green'}; margin-left: 10px;">
                            (${percentage}%)
                        </span>
                    </span>
                </li>
            `;
        });

        html += '</ul>';
        dom.kpiResultsContainer.innerHTML = html;

    } catch (e) {
        console.error("KPIレポートエラー:", e);
        dom.kpiResultsContainer.innerHTML = `<p style="color: red;">レポート集計中にエラーが発生しました: ${e.message}</p>`;
    }
}


/** KPIレポートの表示/非表示を切り替える */
function toggleKpiReport() {
    dom.kpiReportTab.classList.toggle('hidden');
    // レポートが表示されたら、自動で集計を実行する
    if (!dom.kpiReportTab.classList.contains('hidden') && dom.kpiResultsContainer.innerHTML.includes('集計ボタン')) {
        fetchKpiReport();
    }
}


// ==========================================
// 8. 初期ロード
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
    // イベントリスナー設定
    document.getElementById('toggleSettings').addEventListener('click', showSettings);
    document.getElementById('saveConfig').addEventListener('click', handleSaveSettings);
    document.getElementById('cancelConfig').addEventListener('click', hideSettings);
    document.getElementById('reloadTasks').addEventListener('click', loadTasks);

    // DB設定フォームの追加ボタン
    dom.addDbConfigButton.addEventListener('click', handleAddDbConfig);

    // タブ切り替え
    dom.startExistingTask.addEventListener('click', switchTab);
    dom.startNewTask.addEventListener('click', switchTab);
    
    // KPIレポート表示トグルボタン 
    dom.toggleKpiReportBtn.addEventListener('click', toggleKpiReport);
    
    // KPIレポート集計ボタン
    dom.fetchKpiButton.addEventListener('click', fetchKpiReport);
    
    // 新規タスク開始ボタン
    document.getElementById('startNewTaskButton').addEventListener('click', handleStartNewTask);
    
    // 停止/完了ボタン
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
