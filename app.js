// =========================================================
// app.js (人間ユーザーID登録と利用 修正版)
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
        notionUserId: '', // Bot ID
        humanUserId: '', // 人間ユーザーのID (New!)
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

const PROXY_API_BASE = '/api/proxy'; 
const NOTION_API_BASE = 'https://api.notion.com/v1';


// DOM要素の取得
const dom = {
    // タブ (変更なし)
    tabTasks: document.getElementById('tabTasks'),
    tabNew: document.getElementById('tabNew'),
    sectionTasks: document.getElementById('sectionTasks'),
    sectionNew: document.getElementById('sectionNew'),

    // ヘッダー/共通 (変更なし)
    openSettings: document.getElementById('openSettings'),
    settingsModal: document.getElementById('settingsModal'),
    closeSettings: document.getElementById('closeSettings'),
    loader: document.getElementById('loader'),

    // 設定
    notionTokenInput: document.getElementById('notionTokenInput'),
    // ★追加: 人間ユーザーID入力欄
    humanUserIdInput: document.getElementById('humanUserIdInput'), 
    saveSettings: document.getElementById('saveSettings'),
    dbList: document.getElementById('dbList'),
    dbNameInput: document.getElementById('dbNameInput'),
    dbIdInput: document.getElementById('dbIdInput'),
    addDbBtn: document.getElementById('addDbBtn'),

    // 既存タスク (変更なし)
    taskDbFilter: document.getElementById('taskDbFilter'),
    reloadTasks: document.getElementById('reloadTasks'),
    taskList: document.getElementById('taskList'),
    kpiWeek: document.getElementById('kpiWeek'),
    kpiMonth: document.getElementById('kpiMonth'),
    kpiCategoryContainer: document.getElementById('kpiCategoryContainer'),

    // 実行中タスク (変更なし)
    runningTaskContainer: document.getElementById('runningTaskContainer'),
    runningTaskTitle: document.getElementById('runningTaskTitle'),
    runningTimer: document.getElementById('runningTimer'),
    thinkingLogInput: document.getElementById('thinkingLogInput'),
    completeRunningTask: document.getElementById('completeRunningTask'),
    stopRunningTask: document.getElementById('stopRunningTask'),

    // 新規タスク (変更なし)
    targetDbDisplay: document.getElementById('targetDbDisplay'),
    newTaskForm: document.getElementById('newTaskForm'),
    newTaskTitle: document.getElementById('newTaskTitle'),
    newCatContainer: document.getElementById('newCatContainer'),
    newDeptContainer: document.getElementById('newDeptContainer'),
    startNewTaskButton: document.getElementById('startNewTaskButton')
};


// =========================================================
// 外部API ラッパー (変更なし)
// =========================================================

async function externalApi(tokenKey, baseUrl, endpoint, method = 'GET', body = null) {
    const tokenValue = settings.token; 
    
    if (tokenKey === 'notionToken' && !tokenValue) return { error: 'Notion token is missing.' };

    const proxyPayload = {
        tokenKey: tokenKey,
        tokenValue: tokenValue,
        targetUrl: `${baseUrl}${endpoint}`,
        method: method,
        body: body
    };

    try {
        dom.loader.classList.remove('hidden');
        
        const response = await fetch(PROXY_API_BASE, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(proxyPayload)
        });
        
        dom.loader.classList.add('hidden');

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown Proxy Error' }));
            console.error('Proxy/API Error:', errorData);
            return { error: errorData.error || errorData.message || `${tokenKey} API request failed via Proxy`, fullError: errorData };
        }

        return await response.json();
    } catch (e) {
        dom.loader.classList.add('hidden');
        console.error('Network or Parse Error:', e);
        return { error: 'Network error or failed to parse response.' };
    }
}

async function notionApi(endpoint, method = 'GET', body = null) {
    return externalApi('notionToken', NOTION_API_BASE, endpoint, method, body);
}

/** Notion APIから現在のユーザー情報（Bot自身）を取得し、IDを保存する */
async function fetchNotionUser() {
    if (!settings.token) return;

    const response = await notionApi('/users/me');

    if (response && response.id) {
        // BotのIDを保存 (タスク一覧取得時のBotフィルター回避のため、Human ID優先)
        settings.notionUserId = response.id; 
        saveSettings(settings);
        console.log(`Notion Bot ID saved: ${response.id} (${response.name})`);
        
        loadTasks();
    } else if (response.error) {
        console.error("Failed to fetch Notion user (Bot):", response.error);
        settings.notionUserId = '';
        saveSettings(settings);
        loadTasks(); 
    }
}


// =========================================================
// 設定管理ロジック
// =========================================================

function renderDbList() {
    clearElement(dom.dbList);
    // ... (変更なし)
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

function initDbFilter() {
    clearElement(dom.taskDbFilter);
    if (settings.databases.length > 0) {
        settings.databases.forEach(db => {
            const option = document.createElement('option');
            option.value = db.id;
            option.textContent = db.name;
            dom.taskDbFilter.appendChild(option);
        });
        dom.taskDbFilter.value = settings.databases[0].id;
        loadTasks();
    } else {
        dom.taskList.innerHTML = '<li><p style="text-align:center; color:var(--sub-text-color);">設定からNotionデータベースを登録してください。</p></li>';
    }
}

// =========================================================
// タスク・タイマーロジック (変更なし)
// =========================================================

function updateRunningTaskDisplay() {
    if (settings.currentRunningTask) {
        dom.runningTaskContainer.classList.remove('hidden');
        dom.runningTaskTitle.textContent = settings.currentRunningTask.title;
        dom.thinkingLogInput.value = settings.currentRunningTask.memo || '';
    } else {
        dom.runningTaskContainer.classList.add('hidden');
    }
}

function startTimer() {
    if (settings.timerInterval) clearInterval(settings.timerInterval);

    if (settings.currentRunningTask && settings.startTime) {
        const elapsed = Math.floor((Date.now() - settings.startTime) / 1000);
        dom.runningTimer.textContent = formatTime(elapsed);
        
        settings.timerInterval = setInterval(() => {
            const totalElapsed = Math.floor((Date.now() - settings.startTime) / 1000);
            dom.runningTimer.textContent = formatTime(totalElapsed);
        }, 1000);
    }
}

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

    const runningItem = document.getElementById(`task-item-${task.id}`);
    if (runningItem) {
        runningItem.style.opacity = '0.5';
        runningItem.querySelector('.task-actions').innerHTML = '実行中...';
    }
}

async function stopTask(isCompleted) {
    if (!settings.currentRunningTask || !settings.startTime) return;

    if (settings.timerInterval) clearInterval(settings.timerInterval);

    const endTime = Date.now();
    const durationSeconds = Math.floor((endTime - settings.startTime) / 1000);
    
    const memo = dom.thinkingLogInput.value;
    settings.currentRunningTask.memo = memo;
    saveSettings(settings);

    const logContent = `【${isCompleted ? '完了' : '停止'}ログ - ${new Date().toLocaleString('ja-JP')}】\n計測時間: ${formatTime(durationSeconds)}\nメモ: ${memo}`;
    
    const dbId = settings.currentRunningTask.dbId;
    const props = dbPropertiesCache[dbId];

    if (!props) {
        alert('エラー: データベースのプロパティ情報が見つかりません。');
        return;
    }

    const propertiesToUpdate = {};
    
    const statusProp = props.status;
    if (statusProp && isCompleted) {
        const completedOption = statusProp.selectOptions.find(opt => opt.name === '完了');
        if (completedOption) {
            propertiesToUpdate[statusProp.name] = {
                select: { id: completedOption.id }
            };
        }
    }

    const logProp = props.logRelation || props.logRichText;

    if (logProp && logProp.type === 'rich_text') {
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

    if (Object.keys(propertiesToUpdate).length > 0) {
        await notionApi(`/pages/${settings.currentRunningTask.id}`, 'PATCH', {
            properties: propertiesToUpdate
        });
    }

    settings.currentRunningTask = null;
    settings.startTime = null;
    settings.timerInterval = null;
    saveSettings(settings);
    updateRunningTaskDisplay();
    dom.runningTimer.textContent = '00:00:00';
    dom.thinkingLogInput.value = '';
    
    loadTasks();
}

// =========================================================
// データ取得・レンダリング
// =========================================================

/** データベースのプロパティ情報を取得し、マッピングする (変更なし) */
async function getDbProperties(dbId) {
    if (dbPropertiesCache[dbId]) return dbPropertiesCache[dbId];

    const data = await notionApi(`/databases/${dbId}`);
    if (data.error) return null;

    const props = data.properties;
    const mappedProps = {};

    for (const name in props) {
        const prop = props[name];
        
        if (prop.type === 'title') {
            mappedProps.title = { name, type: 'title' };
        } 
        else if (prop.type === 'select' && name === 'ステータス') {
            mappedProps.status = { name, type: 'select', selectOptions: prop.select.options };
        }
        else if (prop.type === 'select' && name === 'カテゴリ') {
            mappedProps.category = { name, type: 'select', selectOptions: prop.select.options };
        }
        // 担当者 (People)
        else if (prop.type === 'people' && name === '担当者') {
             mappedProps.assignee = { name, type: 'people' }; 
        }
        // 部門 (Multi-select)
        else if (prop.type === 'multi_select' && name === '部門') {
            mappedProps.department = { name, type: 'multi_select', options: prop.multi_select.options };
        }
        // ログプロパティ
        else if (prop.type === 'rich_text' && (name.includes('思考ログ') || name.includes('ログ') || name.includes('メモ') || name.includes('Log'))) {
            mappedProps.logRichText = { name, type: 'rich_text' };
        }
        // 計測時間(分)
         else if (prop.type === 'number' && name === '計測時間(分)') {
            mappedProps.durationMinutes = { name, type: 'number' };
        }
    }
    
    dbPropertiesCache[dbId] = mappedProps;
    return mappedProps;
}

/** タスク一覧をロードし、レンダリングする (フィルターのユーザーID取得ロジックを修正) */
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
    
    // ★修正: フィルターに使用するユーザーIDを決定
    const targetUserId = settings.humanUserId || settings.notionUserId; // humanUserIdを優先
    
    const allFilters = [];
    const statusProp = props.status;
    
    // 1. ステータスフィルター (OR: 未着手 or 進行中)
    if (statusProp) {
        const activeStatuses = statusProp.selectOptions
            .filter(opt => opt.name === '未着手' || opt.name === '進行中')
            .map(opt => ({ select: { equals: opt.name } }));

        if (activeStatuses.length > 0) {
             allFilters.push({ or: activeStatuses.map(status => ({ property: statusProp.name, ...status })) });
        }
    }

    // 2. 担当者フィルター (AND: 担当者に現在のユーザーを含む)
    const assigneeProp = props.assignee;
    // targetUserIdがあり、かつそれがBot IDと異なれば（またはBot IDがなければ）フィルターを適用
    if (assigneeProp && targetUserId) {
         // humanUserIdが設定されている、またはBot IDしかなくてもBot IDをフィルターに使ってみる
         allFilters.push({ 
            property: assigneeProp.name, 
            people: { contains: targetUserId } 
        });
    }

    const queryBody = {
        sorts: [{ property: props.title.name, direction: 'ascending' }]
    };
    
    if (allFilters.length === 1 && allFilters[0].or) {
        queryBody.filter = allFilters[0];
    } else if (allFilters.length > 0) {
        queryBody.filter = { and: allFilters };
    }
    
    const response = await notionApi(`/databases/${dbId}/query`, 'POST', queryBody);

    if (response.error) {
        dom.taskList.innerHTML = `<li><p style="text-align:center; color:var(--danger-color);">エラー: ${response.error}</p></li>`;
        return;
    }

    availableTasks = response.results.map(page => {
        // ... (マッピングロジックは変更なし)
        const getPagePropValue = (propKey, defaultValue) => {
            const prop = props[propKey];
            if (!prop) return defaultValue;
            
            const pageProp = page.properties[prop.name];
            return pageProp || defaultValue;
        };

        const titleProp = getPagePropValue('title');
        const title = titleProp && titleProp.title.length > 0
            ? titleProp.title.map(t => t.plain_text).join('')
            : 'タイトルなし';

        const categoryProp = getPagePropValue('category', { select: null });
        const categories = categoryProp.select ? [categoryProp.select.name] : [];

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
    
    const targetUserId = settings.humanUserId || settings.notionUserId;
    
    if (availableTasks.length === 0) {
        let filterMessage = '該当するタスクはありません。';
        if (!targetUserId) {
            filterMessage = 'ユーザーIDが設定されていません。設定画面で「あなたのNotionユーザーID」を入力してください。';
        } else if (!dbPropertiesCache[dom.taskDbFilter.value]?.assignee) {
             filterMessage = 'データベースに「担当者」プロパティが見つかりませんでした。';
        } else {
             filterMessage = '担当者として割り当てられた、未着手または進行中のタスクはありません。';
        }
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

/** 新規タスクフォームを準備する (部門クリック有効化を追加) */
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
                <label for="${id}" class="select-chip" data-color="${option.color}" style="border: 1px solid ${colorClass}; color: ${colorClass}; background: #fff; display: inline-block; margin: 5px; cursor: pointer;">
                    <span style="padding: 5px 10px; display: block;">${option.name}</span>
                </label>
            `;
        });
        dom.newDeptContainer.appendChild(deptGroup);

        // 部門のクリックイベントリスナー
        document.querySelectorAll('.select-chip').forEach(label => {
            label.addEventListener('click', function(e) {
                const inputId = this.getAttribute('for');
                const checkbox = document.getElementById(inputId);
                
                if (checkbox) {
                    checkbox.checked = !checkbox.checked;

                    const color = this.dataset.color === 'default' ? '#ccc' : `var(--${this.dataset.color})`;
                    if (checkbox.checked) {
                        this.style.backgroundColor = color;
                        this.style.color = '#fff';
                    } else {
                        this.style.backgroundColor = '#fff';
                        this.style.color = color;
                    }
                }
            });
        });
    }

    // 2-2. 担当者 (People) の表示
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

/** 新規タスクを作成し、計測を開始する (担当者自動設定を修正) */
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
    
    // ★修正: 4. 担当者 (People) - humanUserIdがあればそれを使って設定
    const assigneeProp = props.assignee;
    if (assigneeProp && assigneeProp.type === 'people' && settings.humanUserId) {
        properties[assigneeProp.name] = { people: [{ id: settings.humanUserId }] };
    } else if (assigneeProp && assigneeProp.type === 'people' && settings.notionUserId) {
         // humanUserIdがない場合はBot IDで試すが、エラーになる可能性が高い
         console.warn("Human User IDが設定されていません。Bot IDで担当者割り当てを試みますが、Notion APIの制限により失敗する可能性があります。");
         // properties[assigneeProp.name] = { people: [{ id: settings.notionUserId }] }; // 今回はHuman IDがない場合は割り当て自体をスキップ
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
        alert('タスクの作成に失敗しました: ' + (response.fullError?.message || response.error));
        return;
    }

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

function switchTab(target) {
    if (target === 'tasks') {
        dom.tabTasks.classList.add('tab-active');
        dom.tabNew.classList.remove('tab-active');
        dom.sectionTasks.classList.remove('hidden');
        dom.sectionNew.classList.add('hidden');
        loadTasks();
    } else {
        dom.tabTasks.classList.remove('tab-active');
        dom.tabNew.classList.add('tab-active');
        dom.sectionTasks.classList.add('hidden');
        dom.sectionNew.classList.remove('hidden');
        initNewTaskForm();
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
        // ★追加: humanUserIdInputの値を表示
        dom.humanUserIdInput.value = settings.humanUserId; 
        renderDbList();
        dom.settingsModal.classList.remove('hidden');
    });
    dom.closeSettings.addEventListener('click', () => dom.settingsModal.classList.add('hidden'));

    // 設定保存
    dom.saveSettings.addEventListener('click', () => {
        settings.token = dom.notionTokenInput.value.trim();
        // ★追加: humanUserIdInputの値を保存
        settings.humanUserId = dom.humanUserIdInput.value.trim(); 
        saveSettings(settings);
        fetchNotionUser();
        alert('設定を保存しました。');
    });

    // DB追加 (変更なし)
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

    // タスクフィルターと更新 (変更なし)
    dom.taskDbFilter.addEventListener('change', loadTasks);
    dom.reloadTasks.addEventListener('click', loadTasks);

    // 実行中タスクの操作 (変更なし)
    dom.completeRunningTask.addEventListener('click', () => stopTask(true));
    dom.stopRunningTask.addEventListener('click', () => stopTask(false));

    // 新規タスクの作成 (変更なし)
    dom.newTaskForm.addEventListener('submit', createNewTask);
}

function initApp() {
    initEventListeners();
    fetchNotionUser();
    initDbFilter(); 
    updateRunningTaskDisplay();
    startTimer();
}

// アプリケーションの開始
window.onload = initApp;
