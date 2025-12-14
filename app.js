const NOTION_TOGGL_PROXY_URL = 'https://company-notion-toggl-api.vercel.app/api/proxy'; // ★ 変更なし
const TOGGL_V9_BASE_URL = 'https://api.track.toggl.com/api/v9';

const STATUS_ACTIVE = ['未着手', '進行中'];
const ASSIGNEE_PROPERTY_NAME = '担当者'; 
const NOTIFICATION_INTERVAL_MS = 30 * 60 * 1000; // 30分

const DEPARTMENTS = [
    'CS', 'デザイン', '人事', '広告', '採用', '改善', '物流', '秘書',
    '経営計画', '経理', '開発', 'AI', '楽天', 'Amazon', 'Yahoo'
];
const CATEGORIES = ['作業', '思考', '教育'];

const settings = {
    // notionToken: '', // ★ 削除: クライアント側からNotion Tokenを削除
    notionDatabases: [],
    humanUserId: '', 
    togglApiToken: '',
    togglWorkspaceId: '',
    currentRunningTask: null,
    startTime: null,
    timerInterval: null,
    notificationInterval: null,
    enableOngoingNotification: true, 
    enableInactiveNotification: true,
    lastStopTime: null, 
    inactiveCheckInterval: null
};

let dom = {};
let isStopping = false; 

// ================= DOM =================
function getDom() {
    return {
        mainView: document.getElementById('mainView'),
        settingsView: document.getElementById('settingsView'),
        toggleSettings: document.getElementById('toggleSettings'),
        cancelConfig: document.getElementById('cancelConfig'),
        saveConfig: document.getElementById('saveConfig'),
        addDbConfig: document.getElementById('addDbConfig'),
        dbConfigContainer: document.getElementById('dbConfigContainer'),

        // confNotionToken: document.getElementById('confNotionToken'), // ★ 削除
        confNotionUserId: document.getElementById('confNotionUserId'),
        confTogglToken: document.getElementById('confTogglToken'),
        confTogglWid: document.getElementById('confTogglWid'),
        
        confEnableOngoingNotification: document.getElementById('confEnableOngoingNotification'), 
        confEnableInactiveNotification: document.getElementById('confEnableInactiveNotification'), 

        taskDbFilter: document.getElementById('taskDbFilter'),
        reloadTasks: document.getElementById('reloadTasks'),
        taskListContainer: document.getElementById('taskListContainer'),

        startExistingTask: document.getElementById('startExistingTask'),
        startNewTask: document.getElementById('startNewTask'),
        existingTaskTab: document.getElementById('existingTaskTab'),
        newTaskTab: document.getElementById('newTaskTab'),

        newTaskTitle: document.getElementById('newTaskTitle'),
        newCategoryContainer: document.getElementById('newCategoryContainer'),
        newDepartmentContainer: document.getElementById('newDepartmentContainer'),
        startNewTaskButton: document.getElementById('startNewTaskButton'),

        runningTaskContainer: document.getElementById('runningTaskContainer'),
        runningTaskTitle: document.getElementById('runningTaskTitle'),
        runningTimer: document.getElementById('runningTimer'),
        thinkingLogInput: document.getElementById('thinkingLogInput'),
        stopTaskButton: document.getElementById('stopTaskButton'),
        completeTaskButton: document.getElementById('completeTaskButton'),
        notificationContainer: document.getElementById('notificationContainer')
    };
}

// ================= Storage =================
function loadSettings() {
    try {
        const saved = localStorage.getItem('settings');
        if (saved) {
            // notionTokenはここで無視される
            Object.assign(settings, JSON.parse(saved));
            
            if (typeof settings.enableInactiveNotification !== 'boolean') {
                settings.enableInactiveNotification = true;
            }
            if (typeof settings.lastStopTime !== 'number' && settings.lastStopTime !== null) {
                settings.lastStopTime = null;
            }
        }
    } catch (e) {
        console.error('設定読み込みエラー:', e);
    }
}

function saveSettings() {
    try {
        localStorage.setItem('settings', JSON.stringify({
            // notionToken: settings.notionToken, // ★ 削除: Notion Tokenは保存しない
            notionDatabases: settings.notionDatabases,
            humanUserId: settings.humanUserId,
            togglApiToken: settings.togglApiToken,
            togglWorkspaceId: settings.togglWorkspaceId,
            currentRunningTask: settings.currentRunningTask,
            startTime: settings.startTime,
            enableOngoingNotification: settings.enableOngoingNotification,
            enableInactiveNotification: settings.enableInactiveNotification, 
            lastStopTime: settings.lastStopTime 
        }));
    } catch (e) {
        console.error('設定保存エラー:', e);
    }
}


// ================= UI (Render) =================

/**
 * 設定画面の各種値をDOMに反映させます。
 */
function renderSettings() {
    // if (dom.confNotionToken) dom.confNotionToken.value = settings.notionToken; // ★ 削除
    if (dom.confNotionUserId) dom.confNotionUserId.value = settings.humanUserId;
    if (dom.confTogglToken) dom.confTogglToken.value = settings.togglApiToken;
    if (dom.confTogglWid) dom.confTogglWid.value = settings.togglWorkspaceId;
    
    if (dom.confEnableOngoingNotification) dom.confEnableOngoingNotification.checked = settings.enableOngoingNotification;
    if (dom.confEnableInactiveNotification) dom.confEnableInactiveNotification.checked = settings.enableInactiveNotification; 

    renderDbConfig();
    renderTaskDbFilter();
}

/**
 * データベース設定のDOMをレンダリングします。
 */
function renderDbConfig() {
    if (!dom.dbConfigContainer) return;

    dom.dbConfigContainer.innerHTML = '';

    // ... (削除・更新ロジックは変更なし)
    settings.notionDatabases.forEach((db, index) => {
        const div = document.createElement('div');
        div.className = 'db-config-item';
        div.style.cssText = 'border: 1px solid #ced4da; padding: 10px; margin-bottom: 8px; border-radius: 4px; background: #fff;';
        div.dataset.index = index;

        div.innerHTML = `
            <label style="margin-top: 0;">DB名:</label>
            <input type="text" class="db-name-input" value="${db.name || ''}" style="width: 100%; box-sizing: border-box; margin-bottom: 5px;">
            <label>DB ID:</label>
            <input type="text" class="db-id-input" value="${db.id || ''}" style="width: 100%; box-sizing: border-box; margin-bottom: 5px;">
            <button class="remove-db btn btn-gray" data-index="${index}" style="float: right;">削除</button>
            <div style="clear: both;"></div>
        `;

        div.querySelector('.remove-db').onclick = (e) => {
            e.preventDefault();
            const indexToRemove = parseInt(e.target.dataset.index);
            if (!isNaN(indexToRemove)) {
                settings.notionDatabases.splice(indexToRemove, 1);
                renderDbConfig();
            }
        };

        dom.dbConfigContainer.appendChild(div);
    });
}

/**
 * メイン画面のタスクDBフィルターをレンダリングします。
 */
function renderTaskDbFilter() {
    if (!dom.taskDbFilter) return;

    dom.taskDbFilter.innerHTML = '';
    if (settings.notionDatabases.length === 0) {
        const defaultOption = document.createElement('option');
        defaultOption.textContent = '設定からDBを追加してください';
        defaultOption.value = '';
        dom.taskDbFilter.appendChild(defaultOption);
        return;
    }

    settings.notionDatabases.forEach(db => {
        const option = document.createElement('option');
        option.value = db.id;
        option.textContent = db.name || db.id;
        dom.taskDbFilter.appendChild(option);
    });

    dom.taskDbFilter.onchange = loadTasks;
}

/**
 * 新規タスクフォームにカテゴリと部門の選択肢をレンダリングします。
 */
function renderNewTaskForm() {
    if (dom.newCategoryContainer) {
        dom.newCategoryContainer.innerHTML = CATEGORIES.map((cat, index) => `
            <label style="display: inline-flex; align-items: center; margin-top: 0; font-weight: normal;">
                <input type="radio" name="newCategory" value="${cat}" ${index === 0 ? 'checked' : ''} style="width: auto; margin-right: 5px;"> ${cat}
            </label>
        `).join('');
    }

    if (dom.newDepartmentContainer) {
        const departmentHtml = DEPARTMENTS.map(dept => `
            <label style="display: inline-flex; align-items: center; width: 48%; margin-right: 2%; font-weight: normal; margin-top: 0;">
                <input type="checkbox" name="newDepartment" value="${dept}" style="width: auto; margin-right: 5px;"> ${dept}
            </label>
        `).join('');
        
        dom.newDepartmentContainer.innerHTML = departmentHtml;
        dom.newDepartmentContainer.style.cssText = 'display: flex; flex-wrap: wrap; gap: 8px 0;';
    }
}

/**
 * タブ切り替え処理
 */
function switchTab(targetId) {
    const isExisting = targetId === 'existingTaskTab';

    if(dom.startExistingTask) dom.startExistingTask.classList.toggle('active', isExisting);
    if(dom.startNewTask) dom.startNewTask.classList.toggle('active', !isExisting);

    if(dom.existingTaskTab) dom.existingTaskTab.classList.toggle('hidden', !isExisting);
    if(dom.newTaskTab) dom.newTaskTab.classList.toggle('hidden', isExisting);

    if (isExisting) {
        loadTasks();
    }
}


// ================= API =================
async function externalApi(targetUrl, method = 'GET', auth, body = null) {
    try {
        // ★ NOTION_TOGGL_PROXY_URLにリクエストを送信
        const res = await fetch(NOTION_TOGGL_PROXY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                targetUrl,
                method,
                tokenKey: auth.key,
                tokenValue: auth.value, // Notionの場合は空文字列
                notionVersion: auth.notionVersion || '',
                body
            })
        });
        if (!res.ok) {
            const errorText = await res.text();
            try {
                const errorJson = JSON.parse(errorText);
                throw new Error(errorJson.message || errorText);
            } catch {
                throw new Error(errorText);
            }
        }
        return res.status === 204 ? null : await res.json();
    } catch (e) {
        console.error('APIエラー:', e);
        throw e;
    }
}

// ★ 修正: Notion APIはトークンを送信せず、空文字列を送信
const notionApi = (endpoint, method, body) =>
    externalApi(`https://api.notion.com/v1${endpoint}`, method, {
        key: 'notionToken',
        value: '', // ★ セキュリティ修正: クライアント側からトークンを送信しない
        notionVersion: '2022-06-28'
    }, body);

const togglApi = (url, method, body) =>
    externalApi(url, method, {
        key: 'togglApiToken',
        value: settings.togglApiToken
    }, body);
// ... (Notifications, Tasks & Timer, executeStopAndLog などの関数は変更なし)

// ... (省略された関数は元のコードのまま)
async function loadTasks() {
    // if (!settings.notionToken) { // ★ 削除: クライアント側のトークンチェックを削除
    //     console.warn('Notion token 未設定のためタスク読込を中断');
    //     dom.taskListContainer.innerHTML = '<li>Notionトークンを設定してください</li>';
    //     return;
    // }

    try {
        const dbId = dom.taskDbFilter.value;
        if (!dbId) {
            dom.taskListContainer.innerHTML = '<li>データベースを選択してください</li>';
            return;
        }

        dom.taskListContainer.innerHTML = '読み込み中...';
        // ... (notionApiコールはそのまま)
        const res = await notionApi(`/databases/${dbId}/query`, 'POST', {
            filter: {
                or: STATUS_ACTIVE.map(s => ({
                    property: 'ステータス',
                    status: { equals: s }
                }))
            },
            sorts: [{
                property: 'タスク名',
                direction: 'ascending'
            }]
        });

        // ... (リストレンダリング処理はそのまま)
        dom.taskListContainer.innerHTML = '';
        if (!res.results || res.results.length === 0) {
            dom.taskListContainer.innerHTML = '<li>該当タスクがありません</li>';
            return;
        }

        res.results.forEach(p => {
            const title = p.properties['タスク名']?.title?.[0]?.plain_text || '無題';
            const li = document.createElement('li');
            li.style.cssText = 'display: flex; justify-content: space-between; align-items: center;';
            
            const span = document.createElement('span');
            span.textContent = title;
            span.style.flex = '1';

            const btn = document.createElement('button');
            btn.textContent = '▶ 開始';
            btn.className = 'btn btn-blue';
            btn.onclick = () => startTask({
                id: p.id,
                title,
                dbId,
                properties: p.properties
            });

            li.append(span, btn);
            dom.taskListContainer.appendChild(li);
        });
    } catch (e) {
        console.error('タスク読み込みエラー:', e);
        dom.taskListContainer.innerHTML = `<li style="color: red;">エラー: ${e.message}</li>`;
    }
}


// ... (その他の関数は変更なし)


// ================= Init =================
function init() {
    try {
        dom = getDom();
        loadSettings();
        renderSettings(); 
        
        requestNotificationPermission();

        // イベントハンドラ設定
        if (dom.toggleSettings) {
            dom.toggleSettings.onclick = () => {
                renderSettings();
                if (dom.settingsView) dom.settingsView.classList.remove('hidden');
                if (dom.mainView) dom.mainView.classList.add('hidden');
                if (dom.runningTaskContainer) dom.runningTaskContainer.classList.add('hidden');
            };
        }

        if (dom.cancelConfig) {
            dom.cancelConfig.onclick = () => {
                if (dom.settingsView) dom.settingsView.classList.add('hidden');
                if (dom.mainView) dom.mainView.classList.remove('hidden');
                updateRunningUI(!!settings.currentRunningTask);
            };
        }

        if (dom.addDbConfig) {
            dom.addDbConfig.onclick = () => {
                settings.notionDatabases.push({ id: '', name: '' });
                renderDbConfig();
            };
        }

        if (dom.saveConfig) {
            dom.saveConfig.onclick = () => {
                // if (dom.confNotionToken) settings.notionToken = dom.confNotionToken.value; // ★ 削除
                if (dom.confNotionUserId) settings.humanUserId = dom.confNotionUserId.value.trim(); 
                if (dom.confTogglToken) settings.togglApiToken = dom.confTogglToken.value;
                if (dom.confTogglWid) settings.togglWorkspaceId = dom.confTogglWid.value;
                
                if (dom.confEnableOngoingNotification) settings.enableOngoingNotification = dom.confEnableOngoingNotification.checked;
                if (dom.confEnableInactiveNotification) settings.enableInactiveNotification = dom.confEnableInactiveNotification.checked; 

                const dbItems = dom.dbConfigContainer.querySelectorAll('.db-config-item');
                settings.notionDatabases = Array.from(dbItems).map(item => ({
                    name: item.querySelector('.db-name-input').value.trim(),
                    id: item.querySelector('.db-id-input').value.trim()
                })).filter(db => db.id);

                saveSettings();
                alert('設定を保存しました。');
                location.reload();
            };
        }

        // タブ切り替えイベント
        if (dom.startExistingTask) {
            dom.startExistingTask.onclick = () => switchTab('existingTaskTab');
        }
        if (dom.startNewTask) {
            dom.startNewTask.onclick = () => switchTab('newTaskTab');
        }

        if (dom.reloadTasks) dom.reloadTasks.onclick = loadTasks;
        if (dom.stopTaskButton) dom.stopTaskButton.onclick = () => stopTask(false);
        if (dom.completeTaskButton) dom.completeTaskButton.onclick = () => stopTask(true);

        // 新規タスク開始ボタンのイベント設定
        if (dom.startNewTaskButton) dom.startNewTaskButton.onclick = startNewTask;

        if (settings.currentRunningTask && settings.startTime) {
            updateRunningUI(true);
        } else {
            renderTaskDbFilter();
            renderNewTaskForm();
            switchTab('existingTaskTab');
            
            updateRunningUI(false); 
        }
    } catch (e) {
        console.error('初期化エラー:', e);
        if (dom.mainView) dom.mainView.classList.add('hidden');
        if (dom.settingsView) dom.settingsView.classList.remove('hidden');
    }
}

// ページ読み込み完了後に初期化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
