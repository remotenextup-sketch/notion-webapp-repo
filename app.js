// =========================================================
// app.js (タブ切り替えロジック含む完全版)
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
let currentDatabaseProps = {};
let availableTasks = [];
let dbPropertiesCache = {};
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
// Notion API ラッパー
// =========================================================

async function notionApi(endpoint, method = 'GET', body = null) {
    if (!settings.token) return { error: 'Notion token is missing.' };

    const headers = {
        'Authorization': `Bearer ${settings.token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
    };

    const config = { method, headers };
    if (body) {
        config.body = JSON.stringify(body);
    }

    try {
        dom.loader.classList.remove('hidden');
        const response = await fetch(`${NOTION_API_BASE}${endpoint}`, config);
        dom.loader.classList.add('hidden');

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Notion API Error:', errorData);
            return { error: errorData.message || 'Notion API request failed' };
        }

        return await response.json();
    } catch (e) {
        dom.loader.classList.add('hidden');
        console.error('Network or Parse Error:', e);
        return { error: 'Network error or failed to parse response.' };
    }
}

// =========================================================
// 設定管理ロジック
// =========================================================

/** DBリストをモーダルにレンダリング */
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
// タスク・タイマーロジック
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

/** * タスクを停止し、Notionにログを記録する
 * @param {boolean} isCompleted - 完了として記録するか (true) 停止として記録するか (false)
 */
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
         // Notionデータベースに合わせて完了ステータスのIDを検索
        const completedOption = statusProp.selectOptions.find(opt => opt.name.includes('完了'));
        if (completedOption) {
            propertiesToUpdate[statusProp.name] = {
                select: { id: completedOption.id }
            };
        }
    }

    // 2. ログの追加 (リレーションまたはリッチテキスト)
    const logProp = props.logRelation || props.logRichText;

    if (logProp && logProp.type === 'relation') {
        // ログページを作成し、リレーションを貼る
        const newLogPage = await createLogPage(dbId, logProp, settings.currentRunningTask.id, logContent, durationSeconds);
        if (newLogPage) {
            // 親タスクにリレーションを追加
            propertiesToUpdate[logProp.name] = {
                relation: [{ id: newLogPage.id }]
            };
        }
    } else if (logProp && logProp.type === 'rich_text') {
        // 親タスクの既存のリッチテキストに追記（Notion APIではページのContentに追記できないため、Append Blockを使う）
        await notionApi(`/blocks/${settings.currentRunningTask.id}/children`, 'PATCH', {
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

/** ログを記録するためのページを作成する（ログDBが存在する場合） */
async function createLogPage(dbId, logProp, parentTaskId, logContent, durationSeconds) {
    if (!logProp.logDbId) return null; // ログDB IDがなければ作成しない

    const logDbProps = dbPropertiesCache[logProp.logDbId];
    if (!logDbProps) return null;

    const newLogProps = {};
    
    // 1. タイトル (計測時間、日付など)
    const titleProp = logDbProps.title;
    if (titleProp) {
        const titleText = `[${formatTime(durationSeconds)}] ${settings.currentRunningTask.title}`;
        newLogProps[titleProp.name] = {
            title: [{ text: { content: titleText } }]
        };
    }

    // 2. 関連タスク (親タスクへのリレーション)
    const parentRelationProp = logDbProps.parentRelation;
    if (parentRelationProp) {
        newLogProps[parentRelationProp.name] = {
            relation: [{ id: parentTaskId }]
        };
    }

    // 3. ログ内容 (リッチテキスト)
    const contentProp = logDbProps.contentRichText;
    if (contentProp) {
        newLogProps[contentProp.name] = {
            rich_text: [{ text: { content: logContent } }]
        };
    }
    
    // 4. 時間プロパティ (数値またはリッチテキスト)
    const timeProp = logDbProps.timeNumber || logDbProps.timeRichText;
    if (timeProp) {
        if (timeProp.type === 'number') {
            newLogProps[timeProp.name] = {
                number: durationSeconds / 3600 // 時間単位で記録
            };
        } else {
            newLogProps[timeProp.name] = {
                rich_text: [{ text: { content: formatTime(durationSeconds) } }]
            };
        }
    }

    // ログページの作成
    const result = await notionApi('/pages', 'POST', {
        parent: { database_id: logProp.logDbId },
        properties: newLogProps,
        // ログ内容をページのContentに追加 (リッチテキストプロパティと重複しないように注意)
        children: [{
            object: 'block',
            type: 'paragraph',
            paragraph: {
                rich_text: [{ text: { content: logContent } }]
            }
        }]
    });

    return result.id ? result : null;
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

    // Notionのプロパティ名/タイプをアプリ内部で使う名前（タイトル、カテゴリ、部門、ステータス）にマッピング
    for (const name in props) {
        const prop = props[name];
        // 1. タイトル
        if (prop.type === 'title') {
            mappedProps.title = { name, type: 'title' };
        } 
        // 2. ステータス (完了/未完了の切り替えに使う)
        else if (prop.type === 'select' && (name.includes('ステータス') || name.includes('Status'))) {
            mappedProps.status = { name, type: 'select', selectOptions: prop.select.options };
        }
        // 3. カテゴリ (マルチセレクト)
        else if (prop.type === 'multi_select' && (name.includes('カテゴリ') || name.includes('Category'))) {
            mappedProps.category = { name, type: 'multi_select', options: prop.multi_select.options };
        }
        // 4. 部門/担当者 (マルチセレクト/人)
        else if ((prop.type === 'multi_select' || prop.type === 'people') && (name.includes('部門') || name.includes('Department') || name.includes('担当'))) {
            mappedProps.department = { name, type: prop.type, options: prop.multi_select ? prop.multi_select.options : [] };
        }
        // 5. ログ/時間 (リレーションまたはリッチテキスト、時間を記録する場所)
        else if (prop.type === 'relation' && (name.includes('ログ') || name.includes('Log'))) {
            // ログDBへのリレーションの場合、そのDB IDを取得
            const relation = prop.relation;
            if (relation && relation.database_id) {
                 // ログDBのプロパティも取得して内部でマッピング (非同期処理なので注意)
                 const logDbId = relation.database_id;
                 mappedProps.logRelation = { name, type: 'relation', logDbId };
                 // ログDBのプロパティをキャッシュ (ここでは非同期で取得せず、使う時に取得するが、構造だけ定義)
            }
        } else if (prop.type === 'rich_text' && (name.includes('ログ') || name.includes('メモ') || name.includes('Log'))) {
            mappedProps.logRichText = { name, type: 'rich_text' };
        }
    }
    
    // タイトルプロパティが存在しない場合はエラー
    if (!mappedProps.title) {
         console.warn(`DB ID ${dbId} にはタイトルプロパティが見つかりませんでした。`);
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
    if (!props) return;
    
    // ロード中の表示
    clearElement(dom.taskList);
    dom.taskList.innerHTML = '<li><p style="text-align:center; color:var(--sub-text-color);">タスクをロード中...</p></li>';
    
    // Notionでタスクを取得 (Statusが「未着手」または「進行中」のものをフィルター)
    const statusProp = props.status;
    const filter = {};

    if (statusProp) {
        // 未着手、進行中、TODOなど（Notion DBに合わせて変更の可能性あり）
        const activeStatuses = statusProp.selectOptions
            .filter(opt => !opt.name.includes('完了') && !opt.name.includes('アーカイブ'))
            .map(opt => ({ select: { equals: opt.name } }));

        if (activeStatuses.length > 0) {
             filter.or = activeStatuses.map(status => ({ property: statusProp.name, ...status }));
        }
    }

    const response = await notionApi(`/databases/${dbId}/query`, 'POST', {
        filter: filter,
        sorts: [{ property: props.title.name, direction: 'ascending' }]
    });

    if (response.error) {
        dom.taskList.innerHTML = `<li><p style="text-align:center; color:var(--danger-color);">エラー: ${response.error}</p></li>`;
        return;
    }

    availableTasks = response.results.map(page => ({
        id: page.id,
        dbId: dbId,
        title: page.properties[props.title.name].title.map(t => t.plain_text).join('') || 'タイトルなし',
        category: page.properties[props.category.name] ? page.properties[props.category.name].multi_select.map(s => s.name) : [],
        status: statusProp ? page.properties[statusProp.name].select.name : '不明'
    }));
    
    renderTasks();
    calculateKpi();
}

/** タスクをHTMLにレンダリングする */
function renderTasks() {
    clearElement(dom.taskList);
    
    if (availableTasks.length === 0) {
        dom.taskList.innerHTML = '<li><p style="text-align:center; color:var(--sub-text-color);">該当するタスクはありません。</p></li>';
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

        const taskMeta = `DB: ${settings.databases.find(db => db.id === task.dbId).name} | [${task.category.join('][')}] | ステータス: ${task.status}`;

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
        
        // 実行中の場合はボタンを変更
        if (isRunning) {
            li.querySelector('.task-actions').innerHTML = '<span style="color: var(--warning-color); font-weight: 600;">実行中...</span>';
        }

        dom.taskList.appendChild(li);
    });

    // 計測開始ボタンのイベントリスナー設定
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

/** KPIを計算し、表示する (今回はモック) */
function calculateKpi() {
    // 実際にはNotionのログDBから過去の計測時間を集計する必要がありますが、ここではモックデータを表示します。
    dom.kpiWeek.textContent = '8.5h';
    dom.kpiMonth.textContent = '35.2h';
    
    // カテゴリ別KPIのモック
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

    // 1. カテゴリ (マルチセレクト)
    clearElement(dom.newCatContainer);
    if (props.category && props.category.options) {
        const catGroup = document.createElement('div');
        catGroup.className = 'form-group';
        catGroup.innerHTML = '<label>カテゴリ</label><div class="select-group" id="newCatOptions"></div>';
        
        const optionsDiv = catGroup.querySelector('#newCatOptions');
        props.category.options.forEach(option => {
            const id = `new-cat-${option.id}`;
            optionsDiv.innerHTML += `
                <input type="checkbox" id="${id}" name="new-task-cat" value="${option.id}" style="display: none;">
                <label for="${id}" class="select-chip" style="border: 1px solid ${option.color === 'default' ? '#ccc' : `var(--${option.color})`}; color: ${option.color === 'default' ? 'var(--text-color)' : `var(--${option.color})`}; background: #fff; display: inline-block; margin: 5px; cursor: pointer;">
                    <span style="padding: 5px 10px; display: block;">${option.name}</span>
                </label>
            `;
        });
        dom.newCatContainer.appendChild(catGroup);
    }

    // 2. 部門 (マルチセレクト/人)
    clearElement(dom.newDeptContainer);
    if (props.department && props.department.type === 'multi_select' && props.department.options) {
        props.department.options.forEach(option => {
            const id = `new-dept-${option.id}`;
            dom.newDeptContainer.innerHTML += `
                <input type="checkbox" id="${id}" name="new-task-dept" value="${option.id}" style="display: none;">
                <label for="${id}" class="select-chip" style="border: 1px solid ${option.color === 'default' ? '#ccc' : `var(--${option.color})`}; color: ${option.color === 'default' ? 'var(--text-color)' : `var(--${option.color})`}; background: #fff; display: inline-block; margin: 5px; cursor: pointer;">
                    <span style="padding: 5px 10px; display: block;">${option.name}</span>
                </label>
            `;
        });
    } else if (props.department && props.department.type === 'people') {
        dom.newDeptContainer.innerHTML = '<p style="font-size: 14px; color: var(--sub-text-color);">担当者プロパティは自動で担当者（あなた）が設定されます。</p>';
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
    properties[props.title.name] = {
        title: [{ text: { content: title } }]
    };

    // 2. カテゴリ (Multi-select)
    const selectedCats = Array.from(document.querySelectorAll('input[name="new-task-cat"]:checked'))
                                .map(input => ({ id: input.value }));
    if (props.category) {
        properties[props.category.name] = { multi_select: selectedCats };
    }

    // 3. 部門/担当者
    if (props.department) {
        if (props.department.type === 'multi_select') {
            const selectedDepts = Array.from(document.querySelectorAll('input[name="new-task-dept"]:checked'))
                                        .map(input => ({ id: input.value }));
            properties[props.department.name] = { multi_select: selectedDepts };
        } else if (props.department.type === 'people') {
            // 現在のユーザーを自動で追加する（Notion APIの仕様により、userオブジェクトIDが必要になるため、ここでは省略し、手動で設定を推奨）
            // properties[props.department.name] = { people: [{ id: 'YOUR_USER_ID' }] };
        }
    }
    
    // 4. ステータス (Notion DBに合わせて未着手のIDを設定)
    const statusProp = props.status;
    if (statusProp) {
        const notStartedOption = statusProp.selectOptions.find(opt => opt.name.includes('未着手') || opt.name.includes('Todo'));
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

    // フォームをリセットし、既存タスクタブに戻る
    dom.newTaskForm.reset();
    switchToTasks(); // タブを既存タスクに戻す
    loadTasks(); // 既存タスクリストを更新
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
    initDbFilter(); 
    updateRunningTaskDisplay();
    startTimer();
}

// アプリケーションの開始
window.onload = initApp;
