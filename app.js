const PROXY_URL = 'https://company-notion-toggl-api.vercel.app/api/proxy';
const TOGGL_V9_BASE_URL = 'https://api.track.toggl.com/api/v9';

const STATUS_ACTIVE = ['未着手', '進行中'];
const ASSIGNEE_PROPERTY_NAME = '担当者'; 
const NOTIFICATION_INTERVAL_MS = 30 * 60 * 1000; // 30分

const DEPARTMENTS = [
    'CS', 'デザイン', '人事', '広告', '採用', '改善', '物流', '秘書',
    '経営計画', '経理', '開発', 'AI', '楽天', 'Amazon', 'Yahoo', 'ルーティン' 
];
const CATEGORIES = ['作業', '思考', '教育'];

const settings = {
    // notionToken: '', // ★ 削除
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
    inactiveCheckInterval: null, 
    enableTickSound: false, 
    tickSound: null 
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
        confEnableTickSound: document.getElementById('confEnableTickSound'), 

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
            const loaded = JSON.parse(saved);
            delete loaded.notionToken; // ★ 読み込み時に削除
            Object.assign(settings, loaded);
            
            // 新規設定のデフォルト値保証
            if (typeof settings.enableInactiveNotification !== 'boolean') {
                settings.enableInactiveNotification = true;
            }
            if (typeof settings.enableTickSound !== 'boolean') {
                settings.enableTickSound = false; 
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
            // notionTokenの保存は不要
            notionDatabases: settings.notionDatabases,
            humanUserId: settings.humanUserId,
            togglApiToken: settings.togglApiToken,
            togglWorkspaceId: settings.togglWorkspaceId,
            currentRunningTask: settings.currentRunningTask,
            startTime: settings.startTime,
            enableOngoingNotification: settings.enableOngoingNotification,
            enableInactiveNotification: settings.enableInactiveNotification, 
            enableTickSound: settings.enableTickSound, 
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
    if (dom.confEnableTickSound) dom.confEnableTickSound.checked = settings.enableTickSound; 

    renderDbConfig();
    renderTaskDbFilter();
}

/**
 * データベース設定のDOMをレンダリングします。
 */
function renderDbConfig() {
    if (!dom.dbConfigContainer) return;

    dom.dbConfigContainer.innerHTML = '';

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
        const res = await fetch(PROXY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                targetUrl,
                method,
                tokenKey: auth.key,
                tokenValue: auth.value,
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

const notionApi = (endpoint, method, body) =>
    externalApi(`https://api.notion.com/v1${endpoint}`, method, {
        key: 'notionToken',
        value: 'USE_SERVER_ENV', // ★ Vercelプロキシに「環境変数を使って」と伝える固定値
        notionVersion: '2022-06-28'
    }, body);

const togglApi = (url, method, body) =>
    externalApi(url, method, {
        key: 'togglApiToken',
        value: settings.togglApiToken
    }, body);

// ================= Notifications =================

/**
 * ブラウザのデスクトップ通知を要求し、許可されたら設定します。
 */
function requestNotificationPermission() {
    if (!('Notification' in window)) {
        console.warn('このブラウザはデスクトップ通知をサポートしていません。');
        return;
    }
    if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
            console.log(`通知権限: ${permission}`);
        });
    }
}

/**
 * 実行中のタスクが長時間継続していることを通知します。（既存）
 */
function notifyOngoingTask() {
    if (settings.enableOngoingNotification && Notification.permission === 'granted' && settings.currentRunningTask) {
        const title = settings.currentRunningTask.title;
        new Notification('⏰ 長時間タスク継続中', {
            body: `「${title}」が30分以上続いています。ログの記入やタスクの区切りを確認しましょう。`,
            icon: 'favicon.ico', 
            silent: false 
        });
    }
}

/**
 * タイマーが30分以上停止していることを通知します。（新規）
 */
function notifyInactiveTimer() {
    if (Notification.permission === 'granted') {
        new Notification('🚨 タイマー停止中 (30分経過)', {
            body: `30分以上タスクが開始されていません。次のタスクを開始しましょう。`,
            icon: 'favicon.ico', 
            silent: false 
        });
    }
    // アプリ内通知も表示
    showNotification('🚨 タイマー停止中 (30分経過)', 5000);
}

/**
 * 未計測時間をチェックし、通知が必要なら実行します。（新規）
 */
function checkInactiveTime() {
    if (!settings.enableInactiveNotification) return;

    // lastStopTimeが設定されており、かつ30分以上経過しているかチェック
    const THRESHOLD = NOTIFICATION_INTERVAL_MS;
    if (settings.lastStopTime && (Date.now() - settings.lastStopTime) >= THRESHOLD) {
        notifyInactiveTimer();
        
        // 通知を出したら、スパム防止のためチェック間隔をクリア
        if (settings.inactiveCheckInterval) {
            clearInterval(settings.inactiveCheckInterval);
            settings.inactiveCheckInterval = null;
        }
    }
}


// ================= Tasks & Timer =================

/**
 * Notionのページプロパティに担当者情報（人プロパティ）を追加する
 */
function assignHumanProperty() {
    if (settings.humanUserId) {
        return {
            [ASSIGNEE_PROPERTY_NAME]: {
                people: [{ id: settings.humanUserId }]
            }
        };
    }
    return {};
}


async function loadTasks() {
    // if (!settings.notionToken) { // ★ 削除: クライアント側でのチェックは不要
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

/**
 * Togglに時間エントリを作成し、タイマーを開始します。
 */
async function startTask(task) {
    if (!settings.togglApiToken || !settings.togglWorkspaceId) {
        alert('Toggl APIトークンまたはWorkspace IDが未設定です。設定を確認してください。');
        return;
    }

    try {
        let desc = task.title;
        if (task.properties) {
            const cat = task.properties['カテゴリ']?.select?.name || '未分類';
            const depts = task.properties['部門']?.multi_select?.map(d => d.name) || [];
            const deptTags = depts.map(d => `【${d}】`).join('');
            const catTag = `【${cat}】`;
            desc = `${deptTags}${catTag}${task.title}`;
        }
        
        const patches = {};
        
        // 1. 担当者チェック
        if (settings.humanUserId && 
            (!task.properties[ASSIGNEE_PROPERTY_NAME] || 
             !task.properties[ASSIGNEE_PROPERTY_NAME].people ||
             !task.properties[ASSIGNEE_PROPERTY_NAME].people.some(p => p.id === settings.humanUserId))
        ) {
            Object.assign(patches, assignHumanProperty());
        }

        // 2. ステータスが未着手なら、進行中に変更する
        if (task.properties['ステータス']?.status?.name === '未着手') {
             patches['ステータス'] = { status: { name: '進行中' } };
        }
        
        if (Object.keys(patches).length > 0) {
              await notionApi(`/pages/${task.id}`, 'PATCH', { properties: patches });
        }


        const entry = await togglApi(`${TOGGL_V9_BASE_URL}/time_entries`, 'POST', {
            workspace_id: Number(settings.togglWorkspaceId),
            description: desc,
            created_with: 'Notion Toggl Timer',
            start: new Date().toISOString(),
            duration: -1 
        });

        settings.currentRunningTask = { ...task, togglEntryId: entry.id };
        settings.startTime = Date.now();
        settings.lastStopTime = null; 
        saveSettings();
        updateRunningUI(true);
    } catch (e) {
        console.error('タスク開始エラー:', e);
        alert(`タスク開始エラー: ${e.message}`);
    }
}

/**
 * 新規タスクをNotionに作成し、タイマーを開始します。
 */
async function startNewTask() {
    const title = dom.newTaskTitle.value.trim();
    if (!title) {
        alert('タスク名は必須です。');
        return;
    }
    const dbId = dom.taskDbFilter.value;
    if (!dbId) {
        alert('データベースを選択してください。');
        return;
    }
    const selectedCategory = Array.from(dom.newCategoryContainer.querySelectorAll('input[name="newCategory"]:checked'))
        .map(radio => radio.value)[0] || CATEGORIES[0];
    const selectedDepartments = Array.from(dom.newDepartmentContainer.querySelectorAll('input[name="newDepartment"]:checked'))
        .map(cb => cb.value);

    try {
        const notionProperties = {
            'タスク名': { title: [{ text: { content: title } }] },
            'ステータス': { status: { name: '進行中' } },
            'カテゴリ': { select: { name: selectedCategory } },
            '部門': { multi_select: selectedDepartments.map(dept => ({ name: dept })) },
            ...assignHumanProperty() 
        };

        const newPage = await notionApi(`/pages`, 'POST', {
            parent: { database_id: dbId },
            properties: notionProperties
        });

        await startTask({
            id: newPage.id,
            title: title,
            dbId: dbId,
            properties: newPage.properties
        });

        dom.newTaskTitle.value = '';
        Array.from(dom.newDepartmentContainer.querySelectorAll('input[name="newDepartment"]:checked')).forEach(cb => { cb.checked = false; });
        Array.from(dom.newCategoryContainer.querySelectorAll('input[name="newCategory"]')).find(radio => radio.value === CATEGORIES[0]).checked = true;

    } catch (e) {
        console.error('新規タスク作成＆開始エラー:', e);
        alert(`新規タスク作成＆開始エラー: ${e.message}`);
    }
}

/**
 * 停止処理（API実行）をバックグラウンドで行う非同期関数。
 */
async function executeStopAndLog(task, log, isComplete) {
    if (isStopping) return;
    isStopping = true;
    
    try {
        // 1. Toggl停止 
        try {
            await togglApi(
                `${TOGGL_V9_BASE_URL}/workspaces/${settings.togglWorkspaceId}/time_entries/${task.togglEntryId}/stop`,
                'PATCH'
            );
        } catch (e) {
            if (e.message && e.message.includes("Time entry already stopped")) {
                console.warn('Toggl警告: タイムエントリは既に停止済みでした。');
            } else {
                showNotification(`エラー: ${e.message} (Toggl API)`, 5000);
                throw e;
            }
        }

        const notionPatches = {};
        
        // 2. 思考ログ保存 
        if (log) {
            // Notionのページを取得して既存のログを取得
            const currentPage = await notionApi(`/pages/${task.id}`, 'GET');
            // '思考ログ'プロパティが存在し、かつrich_textプロパティがあるか確認
            const existingLogProp = currentPage.properties['思考ログ']?.rich_text;
            
            let existingText = '';
            if (existingLogProp && existingLogProp.length > 0) {
                // 既存のログを結合
                existingText = existingLogProp.map(rt => rt.plain_text).join('');
                // 既存のテキストが改行で終わっていない場合は改行を追加
                if (existingText.length > 0 && !existingText.endsWith('\n')) {
                    existingText += '\n';
                }
            }
            
            // 現在時刻をフォーマット
            const now = new Date().toLocaleString('ja-JP', {
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit',
                hour12: false
            }).replace(/\//g, '/');

            // 新しいログエントリを作成
            const newLogEntry = `\n[${now}]\n${log}`;
            const updatedLogContent = existingText + newLogEntry;

            notionPatches['思考ログ'] = {
                rich_text: [{
                    text: { content: updatedLogContent }
                }]
            };
        }

        // 3. ステータス変更
        if (isComplete) {
            notionPatches['ステータス'] = { status: { name: '完了' } };
        }

        // 4. Notionページ更新
        if (Object.keys(notionPatches).length > 0) {
            await notionApi(`/pages/${task.id}`, 'PATCH', { properties: notionPatches });
            showNotification('Notionにログとステータスを反映し、タスクを完了しました。', 2500);
        } else {
             showNotification('タスクを一時停止しました。', 2500);
        }

    } catch (e) {
        console.error('バックグラウンド停止処理エラー:', e);
        showNotification(`エラー: タスク停止・ログ反映に失敗しました。詳細をコンソールで確認してください。`, 5000);
    } finally {
        // 処理完了後の後始末 
        settings.currentRunningTask = null;
        settings.startTime = null;
        settings.lastStopTime = Date.now(); 
        saveSettings();
        isStopping = false;
        
        // 停止直後に未計測チェックを実行
        if (settings.enableInactiveNotification) {
             checkInactiveTime(); 
        }
    }
}


/**
 * 実行中のタスクを停止します。
 */
function stopTask(isComplete) {
    if (!settings.currentRunningTask || isStopping) return;

    const t = settings.currentRunningTask;
    const log = dom.thinkingLogInput.value.trim();
    const action = isComplete ? '完了' : '一時停止';

    // 1. フロントエンドを即座に更新 (Inactiveチェック開始ロジックも含む)
    updateRunningUI(false);
    
    // 2. ユーザーへ「処理中」を伝える通知を先に表示
    showNotification(`タスクを${action}しました。Notion/Togglに反映中...`, 3000);
    
    // 3. バックグラウンドでAPI処理を実行
    setTimeout(() => {
        executeStopAndLog(t, log, isComplete);
    }, 50);
}

// ================= Sound =================

/**
 * カチカチ音を再生します。（新規）
 */
function playTickSound() {
    if (!settings.enableTickSound) return;

    if (!settings.tickSound) {
        settings.tickSound = new Audio('tick.mp3'); 
        settings.tickSound.loop = true;
        settings.tickSound.volume = 0.5; 
    }

    if (settings.tickSound.paused) {
        settings.tickSound.play().catch(e => {
            console.warn('カチカチ音の再生開始に失敗しました。ユーザー操作が必要です。', e);
        });
    }
}

/**
 * カチカチ音を停止します。（新規）
 */
function stopTickSound() {
    if (settings.tickSound) {
        settings.tickSound.pause();
        settings.tickSound.currentTime = 0; 
    }
}

// ================= UI (Others) =================

/**
 * 数秒間表示される非ブロック型通知を表示します。
 */
function showNotification(message, duration = 3000) {
    if (!dom.notificationContainer) return;
    
    dom.notificationContainer.textContent = message;
    dom.notificationContainer.style.display = 'block';
    
    setTimeout(() => {
        dom.notificationContainer.style.opacity = 1;
    }, 10); 

    setTimeout(() => {
        dom.notificationContainer.style.opacity = 0;
        setTimeout(() => {
            dom.notificationContainer.style.display = 'none';
        }, 300);
    }, duration);
}

/**
 * 実行中UIの表示/非表示を切り替えます。
 */
function updateRunningUI(running) {
    if (running && settings.currentRunningTask) {
        // 実行開始時の処理
        if (dom.mainView) dom.mainView.classList.add('hidden');
        if (dom.settingsView) dom.settingsView.classList.add('hidden');
        if (dom.runningTaskContainer) dom.runningTaskContainer.classList.remove('hidden');
        
        if (dom.runningTaskTitle) dom.runningTaskTitle.textContent = settings.currentRunningTask.title;

        if (settings.timerInterval) clearInterval(settings.timerInterval);
        if (settings.notificationInterval) clearInterval(settings.notificationInterval); 
        if (settings.inactiveCheckInterval) clearInterval(settings.inactiveCheckInterval); 
        settings.inactiveCheckInterval = null;

        // 経過時間タイマー
        settings.timerInterval = setInterval(() => {
            if (!settings.startTime) return;
            const sec = Math.floor((Date.now() - settings.startTime) / 1000);
            if (dom.runningTimer) {
                const hours = Math.floor(sec / 3600);
                const minutes = Math.floor((sec % 3600) / 60);
                const seconds = sec % 60;
                dom.runningTimer.textContent = [hours, minutes, seconds]
                    .map(v => v.toString().padStart(2, '0'))
                    .join(':');
            }
        }, 1000);
        
        // 継続通知タイマー開始の制御
        if (settings.enableOngoingNotification) {
            settings.notificationInterval = setInterval(notifyOngoingTask, NOTIFICATION_INTERVAL_MS);
        }
        
        // カチカチ音再生
        playTickSound();

    } else {
        // 停止後の処理 (または非実行時の初期化)
        if (dom.mainView) dom.mainView.classList.remove('hidden');
        if (dom.settingsView) dom.settingsView.classList.add('hidden');
        if (dom.runningTaskContainer) dom.runningTaskContainer.classList.add('hidden');
        
        if (settings.timerInterval) clearInterval(settings.timerInterval);
        if (settings.notificationInterval) clearInterval(settings.notificationInterval); 
        
        settings.timerInterval = null;
        settings.notificationInterval = null;
        
        // カチカチ音停止
        stopTickSound();
        
        // New: 未計測チェックの開始/停止
        if (settings.enableInactiveNotification) {
            if (!settings.inactiveCheckInterval) {
                // 1分ごとにチェック
                settings.inactiveCheckInterval = setInterval(checkInactiveTime, 60000); 
            }
        } else {
             if (settings.inactiveCheckInterval) clearInterval(settings.inactiveCheckInterval);
             settings.inactiveCheckInterval = null;
        }
        
        if (dom.runningTimer) dom.runningTimer.textContent = '00:00:00';
        if (dom.thinkingLogInput) dom.thinkingLogInput.value = '';
        loadTasks();
    }
}


// ================= Init =================
function init() {
    try {
        dom = getDom();
        loadSettings();
        renderSettings(); 
        
        // 画面の初期表示制御: すべての画面を一旦非表示にする (厳格な制御)
        if (dom.mainView) dom.mainView.classList.add('hidden');
        if (dom.settingsView) dom.settingsView.classList.add('hidden');
        if (dom.runningTaskContainer) dom.runningTaskContainer.classList.add('hidden');


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
                // 設定を閉じるときは、実行中なら実行UI、そうでなければメインUIを表示する
                if (dom.settingsView) dom.settingsView.classList.add('hidden');
                
                if (settings.currentRunningTask) {
                    if (dom.runningTaskContainer) dom.runningTaskContainer.classList.remove('hidden');
                    if (dom.mainView) dom.mainView.classList.add('hidden');
                } else {
                    if (dom.mainView) dom.mainView.classList.remove('hidden');
                    if (dom.runningTaskContainer) dom.runningTaskContainer.classList.add('hidden');
                }
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
                if (dom.confEnableTickSound) settings.enableTickSound = dom.confEnableTickSound.checked; 

                const dbItems = dom.dbConfigContainer.querySelectorAll('.db-config-item');
                settings.notionDatabases = Array.from(dbItems).map(item => ({
                    name: item.querySelector('.db-name-input').value.trim(),
                    id: item.querySelector('.db-id-input').value.trim()
                })).filter(db => db.id);

                saveSettings();
                alert('設定を保存しました。');
                // カチカチ音設定変更を反映するためリロード
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

        // アプリケーション起動時の最終UI設定
        if (settings.currentRunningTask && settings.startTime) {
            updateRunningUI(true); // 実行中画面を表示
        } else {
            // カチカチ音を停止 (念のため)
            stopTickSound(); 
            
            renderTaskDbFilter();
            renderNewTaskForm();
            switchTab('existingTaskTab');
            
            // 非実行中画面を表示し、タスクを読み込む
            updateRunningUI(false); 
        }
    } catch (e) {
        console.error('初期化エラー:', e);
        // エラー発生時は強制的に設定画面を表示
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
