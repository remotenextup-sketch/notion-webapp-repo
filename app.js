// =========================================================
// app.js (担当者フィルターと部門表示 最終修正版)
// =========================================================

// =========================================================
// ユーティリティ関数
// =========================================================

/** 時間（秒）を H:MM:SS 形式の文字列に変換する */
function formatTime(seconds) {
    const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
    const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
    const s = String(seconds % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
}

/** HTML要素から子要素を全て削除する */
function clearElement(element) {
    if (element) {
        element.innerHTML = '';
    }
}

/** ローカルストレージから設定を読み込む */
function loadSettings() {
    const settingsJson = localStorage.getItem('notionTrackerSettings');
    return settingsJson ? JSON.parse(settingsJson) : {
        token: '',
        notionUserId: '',
        databases: [],
        currentRunningTask: null,
        startTime: null,
        timerInterval: null
    };
}

/** ローカルストレージに設定を保存する */
function saveSettings(settings) {
    localStorage.setItem('notionTrackerSettings', JSON.stringify(settings));
}

// =========================================================
// グローバル変数と初期化
// =========================================================

let settings = loadSettings();
let availableTasks = [];
let dbPropertiesCache = {};

// Vercelの rewrites 設定に合わせたプロキシパス
const PROXY_API_BASE = '/api/proxy'; 
const NOTION_API_BASE = 'https://api.notion.com/v1';


// DOM要素の取得
const dom = {
    // タブ
    tabTasks: document.getElementById('tabTasks'),
    tabNew: document.getElementById('tabNew'),
    sectionTasks: document.getElementById('sectionTasks'),
    sectionNew: document.getElementById('sectionNew'),

    // ヘッダー/共通
    openSettings: document.getElementById('openSettings'),
    settingsModal: document.getElementById('settingsModal'),
    closeSettings: document.getElementById('closeSettings'),
    loader: document.getElementById('loader'),

    // 設定
    notionTokenInput: document.getElementById('notionTokenInput'),
    saveSettings: document.getElementById('saveSettings'),
    dbList: document.getElementById('dbList'),
    dbNameInput: document.getElementById('dbNameInput'),
    dbIdInput: document.getElementById('dbIdInput'),
    addDbBtn: document.getElementById('addDbBtn'),

    // 既存タスク
    taskDbFilter: document.getElementById('taskDbFilter'),
    reloadTasks: document.getElementById('reloadTasks'),
    taskList: document.getElementById('taskList'),
    kpiWeek: document.getElementById('kpiWeek'),
    kpiMonth: document.getElementById('kpiMonth'),
    kpiCategoryContainer: document.getElementById('kpiCategoryContainer'),

    // 実行中タスク
    runningTaskContainer: document.getElementById('runningTaskContainer'),
    runningTaskTitle: document.getElementById('runningTaskTitle'),
    runningTimer: document.getElementById('runningTimer'),
    thinkingLogInput: document.getElementById('thinkingLogInput'),
    completeRunningTask: document.getElementById('completeRunningTask'),
    stopRunningTask: document.getElementById('stopRunningTask'),

    // 新規タスク
    targetDbDisplay: document.getElementById('targetDbDisplay'),
    newTaskForm: document.getElementById('newTaskForm'),
    newTaskTitle: document.getElementById('newTaskTitle'),
    newCatContainer: document.getElementById('newCatContainer'),
    newDeptContainer: document.getElementById('newDeptContainer'),
    startNewTaskButton: document.getElementById('startNewTaskButton')
};


// =========================================================
// 外部API ラッパー (NotionとTogglをプロキシ経由で扱う)
// =========================================================

/**
 * 外部API (Notion/Toggl) をプロキシ経由で呼び出す
 * @param {string} tokenKey - 'notionToken' または 'togglApiToken'
 * @param {string} baseUrl - APIのベースURL (例: https://api.notion.com/v1)
 * @param {string} endpoint - エンドポイント (例: /databases/...)
 * @param {string} method - HTTPメソッド
 * @param {object} body - リクエストボディ
 */
async function externalApi(tokenKey, baseUrl, endpoint, method = 'GET', body = null) {
    const tokenValue = settings.token; 
    
    // トークンのチェック
    if (tokenKey === 'notionToken' && !tokenValue) return { error: 'Notion token is missing.' };

    // プロキシサーバーに送信するペイロード
    const proxyPayload = {
        tokenKey: tokenKey,
        tokenValue: tokenValue,
        targetUrl: `${baseUrl}${endpoint}`,
        method: method,
        body: body
    };

    try {
        dom.loader.classList.remove('hidden');
        
        // プロキシサーバーのURLにPOSTリクエストを送る
        const response = await fetch(PROXY_API_BASE, { 
            method: 'POST', 
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(proxyPayload)
        });
        
        dom.loader.classList.add('hidden');

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown Proxy Error' }));
            console.error('Proxy/API Error:', errorData);
            return { error: errorData.error || errorData.message || `${tokenKey} API request failed via Proxy` };
        }

        return await response.json();
    } catch (e) {
        dom.loader.classList.add('hidden');
        console.error('Network or Parse Error:', e);
        return { error: 'Network error or failed to parse response.' };
    }
}

/** Notion API専用のラッパー関数 */
async function notionApi(endpoint, method = 'GET', body = null) {
    return externalApi('notionToken', NOTION_API_BASE, endpoint, method, body);
}

/** Notion APIから現在のユーザー情報を取得し、IDを保存する */
async function fetchNotionUser() {
    if (!settings.token) return;

    // トークンが設定されていれば、ユーザーIDが取得されているかに関わらず毎回実行
    const response = await notionApi('/users/me');

    if (response && response.id) {
        settings.notionUserId = response.id;
        saveSettings(settings);
        console.log(`Notion User ID saved: ${response.id} (${response.name})`);
        
        // 担当者名が取れたら、新規タスクフォームの表示を更新
        const deptProp = dbPropertiesCache[dom.taskDbFilter.value]?.assignee || dbPropertiesCache[dom.taskDbFilter.value]?.department;
        if (deptProp && (deptProp.type === 'people' || deptProp.type === 'multi_select')) {
             initNewTaskForm();
        }
    } else if (response.error) {
        console.error("Failed to fetch Notion user:", response.error);
        // エラー時はIDを空にする
        settings.notionUserId = '';
        saveSettings(settings);
    }
}


// =========================================================
// 設定管理ロジック
// =========================================================

/** DBリストをモーダルにレンダリング (変更なし) */
function renderDbList() {
    clearElement(dom.dbList);
    if (settings.databases.length === 0) {
        dom.dbList.innerHTML = '<p style="font-size: 14px; color: var(--sub-text-color);">登録されたデータベースはありません。</p>';
        return;
    }

    const ul = document.createElement('ul');
    ul.style.listStyle = 'none';
    ul.style.padding = '0';

    settings.databases.forEach((db, index) => {
        const li = document.createElement('li');
        li.style.display = 'flex';
        li.style.justifyContent = 'space-between';
        li.style.alignItems = 'center';
        li.style.padding = '8px 0';
        li.style.borderBottom = '1px solid #eee';
        li.style.fontSize = '14px';

        const nameSpan = document.createElement('span');
        nameSpan.textContent = `${db.name} (${db.id.substring(0, 5)}...)`;
        nameSpan.style.fontWeight = '600';
        li.appendChild(nameSpan);

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '削除';
        deleteBtn.className = 'btn btn-danger';
        deleteBtn.style.padding = '5px 10px';
        deleteBtn.style.fontSize = '12px';
        deleteBtn.onclick = () => {
            settings.databases.splice(index, 1);
            saveSettings(settings);
            renderDbList();
            initDbFilter();
        };
        li.appendChild(deleteBtn);
        ul.appendChild(li);
    });
    dom.dbList.appendChild(ul);
}

// DBフィルターの選択肢を初期化
function initDbFilter() {
    clearElement(dom.taskDbFilter);
    if (settings.databases.length > 0) {
        settings.databases.forEach(db => {
            const option = document.createElement('option');
            option.value = db.id;
            option.textContent = db.name;
            dom.taskDbFilter.appendChild(option);
        });
        // 最初のDBをデフォルトで選択
        dom.taskDbFilter.value = settings.databases[0].id;
        loadTasks(); // 最初のDBでタスクをロード
    } else {
        dom.taskList.innerHTML = '<li><p style="text-align:center; color:var(--sub-text-color);">設定からNotionデータベースを登録してください。</p></li>';
    }
}

// =========================================================
// タスク・タイマーロジック (変更なし)
// =========================================================

/** 実行中タスクの表示を更新 */
function updateRunningTaskDisplay() {
    if (settings.currentRunningTask) {
        dom.runningTaskContainer.classList.remove('hidden');
        dom.runningTaskTitle.textContent = settings.currentRunningTask.title;
        dom.thinkingLogInput.value = settings.currentRunningTask.memo || '';
    } else {
        dom.runningTaskContainer.classList.add('hidden');
    }
}

/** タイマーを開始/更新 */
function startTimer() {
    if (settings.timerInterval) clearInterval(settings.timerInterval);

    if (settings.currentRunningTask && settings.startTime) {
        // 初回ロード時や再開時
        const elapsed = Math.floor((Date.now() - settings.startTime) / 1000);
        dom.runningTimer.textContent = formatTime(elapsed);
        
        settings.timerInterval = setInterval(() => {
            const totalElapsed = Math.floor((Date.now() - settings.startTime) / 1000);
            dom.runningTimer.textContent = formatTime(totalElapsed);
        }, 1000);
    }
}

/**
 * タスクの計測を開始する
 * @param {object} task - 開始するタスクオブジェクト
 * @param {string} task.id - NotionページID
 * @param {string} task.title - タスクタイトル
 * @param {string} task.dbId - データベースID
 */
function startTask(task) {
    if (settings.currentRunningTask) {
        alert('既にタスクが実行中です。現在のタスクを完了または停止してから、新しいタスクを開始してください。');
        return;
    }

    settings.currentRunningTask = task;
    settings.startTime = Date.now();
    settings.currentRunningTask.memo = '';
    saveSettings(settings);
    updateRunningTaskDisplay();
    startTimer();

    // 既存タスク一覧から実行中タスクを非表示にする (あれば)
    const runningItem = document.getElementById(`task-item-${task.id}`);
    if (runningItem) {
        runningItem.style.opacity = '0.5';
        runningItem.querySelector('.task-actions').innerHTML = '実行中...';
    }
}

/** * タスクを停止し、Notionにログを記録する */
async function stopTask(isCompleted) {
    if (!settings.currentRunningTask || !settings.startTime) return;

    if (settings.timerInterval) clearInterval(settings.timerInterval);

    const endTime = Date.now();
    const durationSeconds = Math.floor((endTime - settings.startTime) / 1000);
    
    // ログを更新
    const memo = dom.thinkingLogInput.value;
    settings.currentRunningTask.memo = memo;
    saveSettings(settings);

    // NotionのRich Text形式のログ
    const logContent = `【${isCompleted ? '完了' : '停止'}ログ - ${new Date().toLocaleString('ja-JP')}】\n計測時間: ${formatTime(durationSeconds)}\nメモ: ${memo}`;
    
    const dbId = settings.currentRunningTask.dbId;
    const props = dbPropertiesCache[dbId];

    if (!props) {
        alert('エラー: データベースのプロパティ情報が見つかりません。');
        return;
    }

    // 更新ペイロード
    const propertiesToUpdate = {};
    
    // 1. ステータスプロパティの更新 (存在すれば)
    const statusProp = props.status;
    if (statusProp && isCompleted) {
        const completedOption = statusProp.selectOptions.find(opt => opt.name === '完了');
        if (completedOption) {
            propertiesToUpdate[statusProp.name] = {
                select: { id: completedOption.id }
            };
        }
    }

    // 2. ログの追加 (リレーションまたはリッチテキスト)
    const logProp = props.logRelation || props.logRichText;

    if (logProp && logProp.type === 'relation') {
        // (省略: ログページ作成ロジック)
    } else if (logProp && logProp.type === 'rich_text') {
        // 親タスクの既存のリッチテキストに追記
        await notionApi(`/blocks/${settings.currentRunningTask.id}/children`, 'POST', {
            children: [{
                object: 'block',
                type: 'paragraph',
                paragraph: {
                    rich_text: [
                        { type: 'text', text: { content: logContent } }
                    ]
                }
            }]
        });
    }

    // ページプロパティの更新 (ステータスなど)
    if (Object.keys(propertiesToUpdate).length > 0) {
        await notionApi(`/pages/${settings.currentRunningTask.id}`, 'PATCH', {
            properties: propertiesToUpdate
        });
    }

    // グローバル状態をリセット
    settings.currentRunningTask = null;
    settings.startTime = null;
    settings.timerInterval = null;
    saveSettings(settings);
    updateRunningTaskDisplay();
    dom.runningTimer.textContent = '00:00:00';
    dom.thinkingLogInput.value = '';
    
    // タスクリストをリロードして状態を反映
    loadTasks();
}

/** ログを記録するためのページを作成する（モック） */
async function createLogPage(dbId, logProp, parentTaskId, logContent, durationSeconds) {
    if (!logProp.logDbId) return null; 
    console.log("ログページを作成: ", logContent);
    return null;
}

// =========================================================
// データ取得・レンダリング
// =========================================================

/** データベースのプロパティ情報を取得し、マッピングする */
async function getDbProperties(dbId) {
    if (dbPropertiesCache[dbId]) return dbPropertiesCache[dbId];

    const data = await notionApi(`/databases/${dbId}`);
    if (data.error) return null;

    const props = data.properties;
    const mappedProps = {};

    for (const name in props) {
        const prop = props[name];
        
        // 1. タイトルプロパティ (タスク名)
        if (prop.type === 'title') {
            mappedProps.title = { name, type: 'title' };
        } 
        // 2. ステータスプロパティ
        else if (prop.type === 'select' && name === 'ステータス') {
            mappedProps.status = { name, type: 'select', selectOptions: prop.select.options };
        }
        // 3. カテゴリプロパティ (Select)
        else if (prop.type === 'select' && name === 'カテゴリ') {
            mappedProps.category = { name, type: 'select', selectOptions: prop.select.options };
        }
        // ★修正: 4. 担当者プロパティ (People) - 名前が「担当者」であること
        else if (prop.type === 'people' && name === '担当者') {
             mappedProps.assignee = { name, type: 'people' }; 
        }
        // ★修正: 5. 部門プロパティ (Multi-select) - 名前が「部門」であること
        else if (prop.type === 'multi_select' && name === '部門') {
            mappedProps.department = { name, type: 'multi_select', options: prop.multi_select.options };
        }
        // 6. ログプロパティ (リレーションまたはリッチテキスト)
        else if (prop.type === 'relation' && (name.includes('ログ') || name.includes('Log'))) {
            const relation = prop.relation;
            if (relation && relation.database_id) {
                 mappedProps.logRelation = { name, type: 'relation', logDbId: relation.database_id };
            }
        } else if (prop.type === 'rich_text' && (name.includes('ログ') || name.includes('メモ') || name.includes('Log'))) {
            mappedProps.logRichText = { name, type: 'rich_text' };
        }
    }
    
    dbPropertiesCache[dbId] = mappedProps;
    return mappedProps;
}

/** タスク一覧をロードし、レンダリングする */
async function loadTasks() {
    const dbId = dom.taskDbFilter.value;
    if (!dbId) {
        clearElement(dom.taskList);
        dom.taskList.innerHTML = '<li><p style="text-align:center; color:var(--sub-text-color);">タスクをロードできません。</p></li>';
        return;
    }

    const props = await getDbProperties(dbId);
    if (!props || !props.title) {
        dom.taskList.innerHTML = '<li><p style="text-align:center; color:var(--danger-color);">エラー: Notionのプロパティが特定できませんでした。データベースの権限と構造を確認してください。</p></li>';
        return;
    }
    
    clearElement(dom.taskList);
    dom.taskList.innerHTML = '<li><p style="text-align:center; color:var(--sub-text-color);">タスクをロード中...</p></li>';
    
    // フィルター条件の構築
    const statusFilter = [];
    const otherFilters = [];

    // 1. ステータスフィルター (OR: 未着手 or 進行中)
    const statusProp = props.status;
    if (statusProp) {
        const activeStatuses = statusProp.selectOptions
            .filter(opt => opt.name === '未着手' || opt.name === '進行中')
            .map(opt => ({ select: { equals: opt.name } }));

        if (activeStatuses.length > 0) {
             // ステータスのOR条件を一つのオブジェクトとして格納
             statusFilter.push({ or: activeStatuses.map(status => ({ property: statusProp.name, ...status })) });
        }
    }

    // 2. 担当者フィルター (AND: 担当者に現在のユーザーを含む)
    const assigneeProp = props.assignee;
    if (assigneeProp && settings.notionUserId) {
        otherFilters.push({ 
            property: assigneeProp.name, 
            people: { contains: settings.notionUserId } 
        });
    }

    // 全てのフィルターを結合
    const allFilters = [...statusFilter, ...otherFilters];
    
    // クエリボディの整形
    const queryBody = {
        sorts: [{ property: props.title.name, direction: 'ascending' }]
    };

    if (allFilters.length === 1 && allFilters[0].or) {
        // ステータス OR のみ
        queryBody.filter = allFilters[0];
    } else if (allFilters.length > 0) {
        // 複数のフィルター（担当者ANDステータスORなど）
        queryBody.filter = { and: allFilters };
    }
    
    const response = await notionApi(`/databases/${dbId}/query`, 'POST', queryBody);

    if (response.error) {
        dom.taskList.innerHTML = `<li><p style="text-align:center; color:var(--danger-color);">エラー: ${response.error}</p></li>`;
        return;
    }

    // 取得したタスクデータを安全にマッピングする
    availableTasks = response.results.map(page => {
        const getPagePropValue = (propKey, defaultValue) => {
            const prop = props[propKey];
            if (!prop) return defaultValue;
            
            const pageProp = page.properties[prop.name];
            return pageProp || defaultValue;
        };

        // 1. タイトル
        const titleProp = getPagePropValue('title');
        const title = titleProp && titleProp.title.length > 0
            ? titleProp.title.map(t => t.plain_text).join('')
            : 'タイトルなし';

        // 2. カテゴリ (Select)
        const categoryProp = getPagePropValue('category', { select: null });
        const categories = categoryProp.select ? [categoryProp.select.name] : [];

        // 3. ステータス (Select)
        const statusPropValue = getPagePropValue('status', { select: null });
        const status = statusPropValue.select ? statusPropValue.select.name : '不明';

        return {
            id: page.id,
            dbId: dbId,
            title: title,
            category: categories,
            status: status
        };
    });
    
    renderTasks();
    calculateKpi();
}

/** タスクをHTMLにレンダリングする (変更なし) */
function renderTasks() {
    clearElement(dom.taskList);
    
    if (availableTasks.length === 0) {
        const filterMessage = settings.notionUserId ? '担当者として割り当てられた、未完了のタスクはありません。' : '担当者IDが取得できていません。設定を確認してください。';
        dom.taskList.innerHTML = `<li><p style="text-align:center; color:var(--sub-text-color);">${filterMessage}</p></li>`;
        return;
    }

    availableTasks.forEach(task => {
        const li = document.createElement('li');
        li.className = 'task-item';
        li.id = `task-item-${task.id}`;

        const isRunning = settings.currentRunningTask && settings.currentRunningTask.id === task.id;
        if (isRunning) {
             li.style.opacity = '0.5';
        }

        const dbInfo = settings.databases.find(db => db.id === task.dbId) || { name: '不明なDB' };
        const categoryDisplay = task.category.length > 0 ? task.category[0] : 'なし';
        const taskMeta = `DB: ${dbInfo.name} | [${categoryDisplay}] | ステータス: ${task.status}`;

        li.innerHTML = `
            <span class="task-title">${task.title}</span>
            <span class="task-meta">${taskMeta}</span>
            <div class="task-actions">
                <a href="notion://www.notion.so/${task.id.replace(/-/g, '')}" target="_blank" class="btn btn-secondary" style="background: none; border: 1px solid var(--border-color); color: var(--text-color); padding: 8px 10px;">
                    <img src="https://www.notion.so/images/favicon.ico" alt="N" style="width: 14px; height: 14px; margin-right: 5px;">Notionで開く
                </a>
                <button class="btn btn-success start-task-btn" data-id="${task.id}" ${isRunning ? 'disabled' : ''}>
                    ▶ 計測開始
                </button>
            </div>
        `;
        
        if (isRunning) {
            li.querySelector('.task-actions').innerHTML = '<span style="color: var(--warning-color); font-weight: 600;">実行中...</span>';
        }

        dom.taskList.appendChild(li);
    });

    document.querySelectorAll('.start-task-btn').forEach(btn => {
        btn.onclick = (e) => {
            const taskId = e.currentTarget.dataset.id;
            const task = availableTasks.find(t => t.id === taskId);
            if (task) {
                startTask(task);
            }
        };
    });
}

/** KPIを計算し、表示する (モックのまま) */
function calculateKpi() {
    dom.kpiWeek.textContent = '8.5h';
    dom.kpiMonth.textContent = '35.2h';
    
    clearElement(dom.kpiCategoryContainer);
    if (dom.taskDbFilter.value) {
        const mockCategories = { '開発': '5.0h', '会議': '2.0h', '雑務': '1.5h' };
        let html = '';
        for (const cat in mockCategories) {
            html += `<div style="display: flex; justify-content: space-between; font-size: 14px; padding: 3px 0;"><span>${cat}</span><span style="font-weight: 600;">${mockCategories[cat]}</span></div>`;
        }
        dom.kpiCategoryContainer.innerHTML = html;
    }
}

// =========================================================
// 新規タスク作成ロジック
// =========================================================

/** 新規タスクフォームを準備する */
async function initNewTaskForm() {
    const dbId = dom.taskDbFilter.value;
    if (!dbId) {
        dom.targetDbDisplay.textContent = 'データベースが選択されていません。';
        return;
    }

    const dbInfo = settings.databases.find(db => db.id === dbId);
    dom.targetDbDisplay.textContent = `登録先DB: ${dbInfo ? dbInfo.name : '不明'}`;
    
    const props = await getDbProperties(dbId);
    if (!props) {
        dom.targetDbDisplay.textContent += ' (プロパティ情報取得エラー)';
        return;
    }

    // 1. カテゴリ (Select) のレンダリング (変更なし)
    clearElement(dom.newCatContainer);
    if (props.category && props.category.selectOptions) {
        const catGroup = document.createElement('div');
        catGroup.className = 'form-group';
        catGroup.innerHTML = '<label for="newCatSelect" style="font-size: 14px; font-weight: 500;">カテゴリ</label><select id="newCatSelect" class="input-field" style="width: 100%;"></select>';
        
        const selectElement = catGroup.querySelector('#newCatSelect');
        selectElement.innerHTML = '<option value="">--- 選択してください ---</option>';

        props.category.selectOptions.forEach(option => {
            const optionElement = document.createElement('option');
            optionElement.value = option.id;
            optionElement.textContent = option.name;
            selectElement.appendChild(optionElement);
        });
        dom.newCatContainer.appendChild(catGroup);
    }

    // 2. 部門 (Multi-select) と 担当者 (People) の表示
    clearElement(dom.newDeptContainer);
    
    // 2-1. 部門 (Multi-select) のレンダリング
    const deptProp = props.department;
    if (deptProp && deptProp.type === 'multi_select' && deptProp.options) {
        const deptGroup = document.createElement('div');
        deptGroup.className = 'form-group';
        deptGroup.innerHTML = `<label style="font-size: 14px; font-weight: 500;">${deptProp.name}</label><div id="newDeptOptions"></div>`;
        
        const optionsDiv = deptGroup.querySelector('#newDeptOptions');
        deptProp.options.forEach(option => {
            const id = `new-dept-${option.id}`;
            const colorClass = option.color === 'default' ? '#ccc' : `var(--${option.color})`;
            optionsDiv.innerHTML += `
                <input type="checkbox" id="${id}" name="new-task-dept" value="${option.id}" style="display: none;">
                <label for="${id}" class="select-chip" style="border: 1px solid ${colorClass}; color: ${colorClass}; background: #fff; display: inline-block; margin: 5px; cursor: pointer;">
                    <span style="padding: 5px 10px; display: block;">${option.name}</span>
                </label>
            `;
        });
        dom.newDeptContainer.appendChild(deptGroup);
    }

    // 2-2. 担当者 (People) の表示
    const assigneeProp = props.assignee;
    if (assigneeProp && assigneeProp.type === 'people') {
        const userName = settings.notionUserId ? '（あなた自身）' : '（ID未取得）';
        const assigneeMessage = `<p style="font-size: 14px; color: var(--sub-text-color);">${assigneeProp.name}プロパティ: 新規作成時に${userName}が自動で設定されます。</p>`;
        
        // 部門がある場合は下に追加、ない場合は全体に追加
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
async function createNewTask(e) {
    e.preventDefault();

    const dbId = dom.taskDbFilter.value;
    const title = dom.newTaskTitle.value.trim();
    if (!title || !dbId) return;

    const props = dbPropertiesCache[dbId];
    if (!props) return;

    const properties = {};

    // 1. タイトル
    if(props.title) {
        properties[props.title.name] = {
            title: [{ text: { content: title } }]
        };
    } else {
        alert('エラー: タイトルプロパティが見つかりません。');
        return;
    }

    // 2. カテゴリ (Select)
    const selectedCatId = document.getElementById('newCatSelect') ? document.getElementById('newCatSelect').value : null;
    if (props.category && selectedCatId) {
        properties[props.category.name] = { select: { id: selectedCatId } };
    }

    // 3. 部門 (Multi-select)
    const deptProp = props.department;
    if (deptProp && deptProp.type === 'multi_select') {
        const selectedDepts = Array.from(document.querySelectorAll('input[name="new-task-dept"]:checked'))
                                    .map(input => ({ id: input.value }));
        properties[deptProp.name] = { multi_select: selectedDepts };
    }
    
    // ★修正: 4. 担当者 (People) - 自分のIDを自動で指定
    const assigneeProp = props.assignee;
    if (assigneeProp && assigneeProp.type === 'people' && settings.notionUserId) {
        properties[assigneeProp.name] = { people: [{ id: settings.notionUserId }] };
    }
    
    // 5. ステータス 
    const statusProp = props.status;
    if (statusProp) {
        const notStartedOption = statusProp.selectOptions.find(opt => opt.name === '未着手');
        if (notStartedOption) {
            properties[statusProp.name] = {
                select: { id: notStartedOption.id }
            };
        }
    }

    const response = await notionApi('/pages', 'POST', {
        parent: { database_id: dbId },
        properties: properties
    });

    if (response.error) {
        alert('タスクの作成に失敗しました: ' + response.error);
        return;
    }

    // 成功したら計測を開始
    const newTask = {
        id: response.id,
        dbId: dbId,
        title: title
    };
    
    startTask(newTask);

    dom.newTaskForm.reset();
    switchTab('tasks');
}

// =========================================================
// イベントハンドラと初期化
// =========================================================

/**
 * タブの切り替えロジック
 * @param {string} target - 'tasks' または 'new'
 */
function switchTab(target) {
    if (target === 'tasks') {
        dom.tabTasks.classList.add('tab-active');
        dom.tabNew.classList.remove('tab-active');
        dom.sectionTasks.classList.remove('hidden');
        dom.sectionNew.classList.add('hidden');
        loadTasks(); // タスク一覧に切り替えたらロード
    } else {
        dom.tabTasks.classList.remove('tab-active');
        dom.tabNew.classList.add('tab-active');
        dom.sectionTasks.classList.add('hidden');
        dom.sectionNew.classList.remove('hidden');
        initNewTaskForm(); // 新規タスクに切り替えたらフォームを準備
    }
}

function initEventListeners() {
    // タブ切り替えイベント
    if (dom.tabTasks && dom.tabNew) {
        dom.tabTasks.addEventListener('click', () => switchTab('tasks'));
        dom.tabNew.addEventListener('click', () => switchTab('new'));
    }

    // 設定モーダル
    dom.openSettings.addEventListener('click', () => {
        dom.notionTokenInput.value = settings.token;
        renderDbList();
        dom.settingsModal.classList.remove('hidden');
    });
    dom.closeSettings.addEventListener('click', () => dom.settingsModal.classList.add('hidden'));

    // 設定保存
    dom.saveSettings.addEventListener('click', () => {
        settings.token = dom.notionTokenInput.value.trim();
        saveSettings(settings);
        fetchNotionUser(); // トークン保存時にユーザーIDを取得する
        alert('トークンを保存しました。');
    });

    // DB追加
    dom.addDbBtn.addEventListener('click', () => {
        const name = dom.dbNameInput.value.trim();
        const id = dom.dbIdInput.value.trim().replace(/-/g, '');
        if (name && id && id.length === 32) {
            settings.databases.push({ name, id });
            saveSettings(settings);
            renderDbList();
            initDbFilter();
            dom.dbNameInput.value = '';
            dom.dbIdInput.value = '';
        } else {
            alert('DB名と32桁のDB IDを正しく入力してください。');
        }
    });

    // タスクフィルターと更新
    dom.taskDbFilter.addEventListener('change', loadTasks);
    dom.reloadTasks.addEventListener('click', loadTasks);

    // 実行中タスクの操作
    dom.completeRunningTask.addEventListener('click', () => stopTask(true));
    dom.stopRunningTask.addEventListener('click', () => stopTask(false));

    // 新規タスクの作成
    dom.newTaskForm.addEventListener('submit', createNewTask);
}

function initApp() {
    initEventListeners();
    fetchNotionUser(); // 起動時にユーザーIDを取得を試みる
    initDbFilter(); 
    updateRunningTaskDisplay();
    startTimer();
}

// アプリケーションの開始
window.onload = initApp;
