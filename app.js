// app.js 全文 (最終版9: KPIレポートを Toggl Reports API v2 の GET/Query形式に修正)

// ★★★ 定数とグローバル設定 ★★★
const PROXY_URL = 'https://company-notion-toggl-api.vercel.app/api/proxy'; 
const TOGGL_V9_BASE_URL = 'https://api.track.toggl.com/api/v9';

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
    
    // ★★★ 修正箇所: GETリクエストにbodyが含まれていたら警告し、無視する ★★★
    if (method === 'GET' && body !== null) {
        console.warn('警告: externalApiがGETリクエストでbodyを受け取りました。Toggl Reports APIの仕様により無視されます。');
        body = null;
    }

    const proxyPayload = {
        targetUrl: targetUrl,
        method: method,
        tokenKey: authDetails.tokenKey, 
        tokenValue: authDetails.tokenValue,
        notionVersion: authDetails.notionVersion, 
        body: body 
    };

    const res = await fetch(PROXY_URL, {
        method: 'POST', // プロキシへのリクエストは常にPOST
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(proxyPayload)
    });

    if (!res.ok) {
        const errorJson = await res.json().catch(() => ({ message: '不明なプロキシエラー' }));
        console.error('Proxy/API Error:', errorJson);
        // ★ エラー詳細を通知に表示 (デバッグ用)
        showNotification(`APIエラー (${res.status}): ${errorJson.message || 'サーバー側で問題が発生しました'}`, 5000); 
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


function getTogglAuthDetails() {
    return {
        tokenKey: 'togglApiToken',
        tokenValue: settings.togglApiToken,
        notionVersion: '' 
    };
}

// ==========================================
// 3. Togglアクション
// ==========================================

/** Togglで新しい計測を開始する (Track API v9) */
async function startToggl(title, tags) {
    if (!settings.togglApiToken || !settings.togglWorkspaceId) {
        throw new Error('Toggl設定（トークンとワークスペースID）が不完全です。');
    }
    
    const wid = settings.togglWorkspaceId;
    const targetUrl = `${TOGGL_V9_BASE_URL}/time_entries`;

    const body = {
        workspace_id: parseInt(wid),
        description: title,
        created_with: 'Notion Toggl Timer WebApp',
        start: new Date().toISOString(),
        duration: -1, // -1は計測中を意味します
        tags: tags
    };
    return await externalApi(targetUrl, 'POST', getTogglAuthDetails(), body);
}

/** Togglで計測を停止する (Track API v9) */
async function stopToggl(entryId) {
    if (!settings.togglApiToken || !settings.togglWorkspaceId) {
        throw new Error('Toggl設定（トークンとワークスペースID）が不完全です。');
    }
    
    const wid = settings.togglWorkspaceId;
    const targetUrl = `${TOGGL_V9_BASE_URL}/workspaces/${wid}/time_entries/${entryId}/stop`;
    
    return await externalApi(targetUrl, 'PATCH', getTogglAuthDetails(), null);
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
                    if (name.includes('ログ') || name.includes('メモ') || name.includes('思考ログ')) propertyMap.logRichText = { name: name, type: 'rich_text' }; break;
                case 'relation':
                    if (name.includes('ログ') || name.includes('メモ')) propertyMap.logRelation = { name: name, type: 'relation', dbId: prop.relation.database_id }; break;
                case 'status':
                    if (name.includes('ステータス')) propertyMap.status = { name: name, type: 'select', selectOptions: prop.status.options }; break;
                // ★★★ 計測時間プロパティの追加 ★★★
                case 'number':
                    if (name.includes('計測時間') || name.includes('作業時間')) propertyMap.durationNumber = { name: name, type: 'number' }; break;
                // ★★★ 完了日プロパティの追加 ★★★
                case 'date':
                    if (name.includes('完了日')) propertyMap.completionDate = { name: name, type: 'date' }; break;
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
                    // Statusプロパティが存在し、かつ「完了」ではないもの
                    ...(props.status ? [{ property: props.status.name, status: { does_not_equal: '完了' } }] : [])
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
                    category: props.category ? task.properties[props.category.name]?.select : null,
                    department: props.department ? task.properties[props.department.name]?.multi_select : null,
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

    // UX修正: どちらか一方のみを表示するように変更
    if (target === 'existing') {
        dom.existingTaskTab.classList.remove('hidden');
        dom.newTaskTab.classList.add('hidden'); 
    } else {
        dom.existingTaskTab.classList.add('hidden'); // 既存タスクタブを非表示に
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
                                <input type="radio" name="newCatSelect" class="cat-radio" value="${opt.id}" data-name="${opt.name}" style="margin-right: 5px;">
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
                            <input type="checkbox" class="dept-checkbox" data-id="${opt.id}" data-name="${opt.name}">
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
        let newCatProp = null;
        if (props.category && selectedCatRadio) {
            newCatProp = { id: selectedCatRadio.value, name: selectedCatRadio.dataset.name };
            properties[props.category.name] = { select: { id: newCatProp.id } };
        }

        // 3. 部門 (Multi-select)
        const selectedDepts = Array.from(document.querySelectorAll('.dept-checkbox:checked'))
                             .map(cb => ({ id: cb.dataset.id, name: cb.dataset.name }));
        if (props.department && selectedDepts.length > 0) {
            properties[props.department.name] = { multi_select: selectedDepts.map(d => ({ id: d.id })) };
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
            properties: {
                category: newCatProp,
                department: selectedDepts,
            } 
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
        // ここでタスクIDもTogglに記録するロジックを将来追加可能
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
    const durationMs = Date.now() - settings.startTime; // 経過時間（ミリ秒）
    const durationSeconds = Math.floor(durationMs / 1000);
    const durationMinutes = Math.round(durationSeconds / 60);

    try {
        // 1. Toggl計測停止
        await stopToggl(task.togglEntryId);
        
        // 2. Notionページを更新
        const props = await getDbProperties(task.dbId);
        const patchBody = { properties: {} };
        
        // Notionのページ情報を取得 (計測時間累計のため)
        let notionPage = null;
        if (props.durationNumber) {
             notionPage = await notionApi(`/pages/${task.id}`, 'GET');
        }

        // --- 計測時間の累計処理 ---
        if (props.durationNumber) {
            // 現在の値を minutes 単位で取得 (提供されたコードロジックを使用)
            const curMinutes = notionPage?.properties[props.durationNumber.name]?.number || 0;
            const totalMinutes = curMinutes + durationMinutes;

            patchBody.properties[props.durationNumber.name] = { 
                number: totalMinutes 
            };
        }
        
        // ステータス更新
        if (props.status) {
            let statusName = isComplete ? '完了' : '保留'; // 完了でない場合は「保留」など適切なステータスに
            const statusOption = props.status.selectOptions.find(o => o.name === statusName);
            
            if (statusOption) {
                patchBody.properties[props.status.name] = { status: { id: statusOption.id } };
            }
        }

        // 完了日更新 (isCompleteの場合のみ)
        if (props.completionDate && isComplete) {
            patchBody.properties[props.completionDate.name] = { 
                date: { start: new Date().toISOString().split('T')[0] } 
            };
        }
        
        // ログ更新
        if (logText && props.logRichText) {
            // 既存ログの取得
            const curLog = notionPage?.properties[props.logRichText.name]?.rich_text?.[0]?.plain_text || "";
            const dateStamp = `[${new Date().toLocaleDateString()}]`;
            const newLog = curLog ? `${curLog}\n\n${dateStamp}\n${logText}` : `${dateStamp}\n${logText}`;
            
            patchBody.properties[props.logRichText.name] = { 
                rich_text: [{ text: { content: newLog } }] 
            };
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
        showNotification(`タスク「${task.title}」を${isComplete ? '完了' : '停止'}しました。計測時間: ${formatTime(durationMs)}`);
        
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

/** Togglレポート用の開始日と終了日 (YYYY-MM-DD形式) を計算する (月曜始まり) */
function calculateReportDates(period) {
    const now = new Date();
    
    // YYYY-MM-DD の形式で日付をフォーマットするヘルパー関数
    const formatYMD = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    let start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let end = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (period === 'current_week' || period === 'last_week') {
        // --- 週次計算ロジック (月曜始まり) ---
        // Date.getDay()は日曜=0, 月曜=1, ..., 土曜=6
        const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay(); 
        const diffToMonday = dayOfWeek - 1; 
        
        // 今週の月曜日
        start = new Date(now);
        start.setDate(now.getDate() - diffToMonday);
        start.setHours(0, 0, 0, 0); // 時間をリセットして計算を安定させる
        
        // 今週の日曜日
        end = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(0, 0, 0, 0); // 時間をリセットして計算を安定させる

        if (period === 'last_week') {
            // 先週にするために、両方を7日前にシフト
            start.setDate(start.getDate() - 7);
            end.setDate(end.getDate() - 7);
        }

    } else if (period === 'current_month') {
        // --- 今月 ---
        start = new Date(now.getFullYear(), now.getMonth(), 1); // 今月の1日
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0); // 来月の0日目 (今月の最終日)

    } else if (period === 'last_month') {
        // --- 先月 ---
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1); // 先月の1日
        end = new Date(now.getFullYear(), now.getMonth(), 0); // 今月の0日目 (先月の最終日)
    }
    
    // YYYY-MM-DD 形式の文字列を取得
    const startDateYMD = formatYMD(start);
    const endDateYMD = formatYMD(end);
    
    // Reports API v2 が要求する YYYY-MM-DD 形式のみを返す
    return { 
        start: startDateYMD, 
        end: endDateYMD
    };
}


/** Toggl Reports APIを呼び出し、カテゴリ別に集計する */
// app.js (972行目付近)
/** Toggl Reports APIを呼び出し、カテゴリ別に集計する */
async function fetchKpiReport() {
    if (!settings.togglApiToken || !settings.togglWorkspaceId) {
        dom.kpiResultsContainer.innerHTML = '<p style="color: red;">エラー: Toggl設定（トークンまたはワークスペースID）が不完全です。設定画面を確認してください。</p>';
        return;
    }

    const period = dom.reportPeriodSelect.value;
    // start, end は YYYY-MM-DD 形式
    const { start, end } = calculateReportDates(period); 
    const wid = settings.togglWorkspaceId;

    dom.kpiResultsContainer.innerHTML = `<p>レポート期間: ${start} 〜 ${end}<br>集計中 (v3 GET)...</p>`;

    try {
        // -----------------------------------------------------------------
        // ★★★ 修正1: Reports API v3 のエンドポイントに変更 ★★★
        // -----------------------------------------------------------------
        const targetBaseUrl = 'https://api.track.toggl.com/reports/api/v3/workspace';
        const targetUrl = `${targetBaseUrl}/${wid}/summary/time`;
        
        // ★★★ 修正2: v3が要求する形式で Query Parameters を構築 ★★★
        // v3は since, until ではなく start_date, end_date を使用し、時間情報を含む形式を推奨するが、
        // GET/Queryではシンプルに日付のみを送るパターンを試す
        const params = new URLSearchParams({
            start_date: start,       // YYYY-MM-DD 形式
            end_date: end,           // YYYY-MM-DD 形式
            user_agent: 'NotionTogglTimerWebApp',
            grouping: 'tags' 
        });
        
        const finalUrl = `${targetUrl}?${params.toString()}`;
        
        // ★★★ 修正3: bodyなしのGETリクエストとして externalApi を呼び出す ★★★
        // GETリクエスト + クエリパラメータ（body=null）でプロキシの挙動の変化を試す
        const summary = await externalApi(finalUrl, 'GET', getTogglAuthDetails(), null); 
        
        
        if (!summary || !summary.total_grand) {
            dom.kpiResultsContainer.innerHTML = '<p>この期間に計測されたタスクはありません。</p>';
            dom.reportTotalTime.textContent = '総計測時間: 00:00:00';
            return;
        }

        // --- ローカル集計ロジック (v3のレスポンス形式に合わせる) ---
        const categoryTimes = {};
        // total_grand はミリ秒単位
        let totalDurationMs = summary.total_grand; 
        
        // v3のsummary/timeエンドポイントは、responsesの配列を返す
        summary.data.forEach(group => {
            // v3のレスポンス構造はv2と異なるが、time_entriesをグループ化した場合のタグは
            // descriptionの代わりにtagというキーで時間を含むと仮定する
            if (group.tag) { // タグがキーとなっていることを期待
                const tag = group.tag; 
                // durationは秒単位で返されることが多い。ここでは便宜上 total_duration_seconds を参照
                const durationSeconds = group.total_duration_seconds; 
                
                // API v3のGETレスポンスの正確な構造が不明なため、フォールバックロジック
                if (durationSeconds !== undefined) {
                    const durationMs = durationSeconds * 1000;
                    categoryTimes[tag] = (categoryTimes[tag] || 0) + durationMs;
                }
            }
        });
        
        // ★★★ V3のレスポンス構造が複雑なため、集計ロジックの調整が必要 ★★★
        // もし上記の集計がうまくいかない場合、summary.dataを直接確認してください。
        
        // --- 結果のレンダリング (V3対応) ---
        // V3ではデータ構造が複雑なため、total_grandが正しくても集計できない場合があります。
        // ここでは、total_grandを優先して表示します。

        dom.reportTotalTime.textContent = `総計測時間: ${formatTime(totalDurationMs)}`;
        
        // カテゴリ集計が空の場合は、エラー表示
        if (Object.keys(categoryTimes).length === 0) {
            dom.kpiResultsContainer.innerHTML = `<p>タスクは見つかりましたが、カテゴリ（タグ）集計に失敗しました。<br>プロキシサーバーまたはToggl API v3のエラーの可能性が高いです。</p>`;
            return;
        }

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
        dom.kpiResultsContainer.innerHTML = `<p style="color: red;">レポート集計中にエラーが発生しました: ${e.message}<br>（プロキシの問題の可能性が高いです）</p>`;
    }
}

/** KPIレポートの表示/非表示を切り替える */
function toggleKpiReport() {
    dom.kpiReportTab.classList.toggle('hidden');
    // レポートが表示されたら、自動で集計を実行する
    if (!dom.kpiReportTab.classList.contains('hidden')) {
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
        
        // 最初のロード時には「既存タスク」タブを選択状態にする
        dom.startExistingTask.click(); 
        
        loadTasks(); 
    } else {
        showSettings();
    }
});
