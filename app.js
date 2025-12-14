const PROXY_URL = 'https://company-notion-toggl-api.vercel.app/api/proxy';
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
    notionToken: '',
    notionDatabases: [],
    humanUserId: '', 
    togglApiToken: '',
    togglWorkspaceId: '',
    currentRunningTask: null,
    startTime: null,
    timerInterval: null,
    notificationInterval: null,
    enableOngoingNotification: true // ★ 初期値をtrueに設定
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

        confNotionToken: document.getElementById('confNotionToken'),
        confNotionUserId: document.getElementById('confNotionUserId'),
        confTogglToken: document.getElementById('confTogglToken'),
        confTogglWid: document.getElementById('confTogglWid'),
        
        // ★ 追加
        confEnableOngoingNotification: document.getElementById('confEnableOngoingNotification'), 

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
            // ★ 新しい設定項目を含めて読み込み
            Object.assign(settings, JSON.parse(saved));
        }
    } catch (e) {
        console.error('設定読み込みエラー:', e);
    }
}

function saveSettings() {
    try {
        // ★ 新しい設定項目を含めて保存
        localStorage.setItem('settings', JSON.stringify({
            notionToken: settings.notionToken,
            notionDatabases: settings.notionDatabases,
            humanUserId: settings.humanUserId,
            togglApiToken: settings.togglApiToken,
            togglWorkspaceId: settings.togglWorkspaceId,
            currentRunningTask: settings.currentRunningTask,
            startTime: settings.startTime,
            enableOngoingNotification: settings.enableOngoingNotification // ★ 保存対象に追加
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
    if (dom.confNotionToken) dom.confNotionToken.value = settings.notionToken;
    if (dom.confNotionUserId) dom.confNotionUserId.value = settings.humanUserId;
    if (dom.confTogglToken) dom.confTogglToken.value = settings.togglApiToken;
    if (dom.confTogglWid) dom.confTogglWid.value = settings.togglWorkspaceId;
    
    // ★ 継続通知設定の反映
    if (dom.confEnableOngoingNotification) dom.confEnableOngoingNotification.checked = settings.enableOngoingNotification;

    renderDbConfig();
    renderTaskDbFilter();
}
// ... (renderDbConfig, renderTaskDbFilter, renderNewTaskForm, switchTab は変更なし) ...


// ================= Notifications =================

/**
 * ブラウザのデスクトップ通知を要求し、許可されたら設定します。
 */
function requestNotificationPermission() {
    if (!('Notification' in window)) {
        console.warn('このブラウザはデスクトップ通知をサポートしていません。');
        return;
    }
    // 許可されていない場合のみ許可を求める
    if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
            console.log(`通知権限: ${permission}`);
        });
    }
}

/**
 * 実行中のタスクが長時間継続していることを通知します。
 */
function notifyOngoingTask() {
    // ★ 設定が有効かつ権限がある場合のみ通知を実行
    if (settings.enableOngoingNotification && Notification.permission === 'granted' && settings.currentRunningTask) {
        const title = settings.currentRunningTask.title;
        new Notification('⏰ 長時間タスク継続中', {
            body: `「${title}」が30分以上続いています。ログの記入やタスクの区切りを確認しましょう。`,
            icon: 'favicon.ico', 
            silent: false 
        });
    }
}

// ================= Tasks & Timer =================

// ... (assignHumanProperty, externalApi, notionApi, togglApi, loadTasks, startTask, startNewTask, executeStopAndLog, stopTask, showNotification は変更なし) ...

/**
 * 実行中UIの表示/非表示を切り替えます。
 */
function updateRunningUI(running) {
    if (dom.mainView) dom.mainView.classList.toggle('hidden', running);
    if (dom.settingsView) dom.settingsView.classList.add('hidden');
    if (dom.runningTaskContainer) dom.runningTaskContainer.classList.toggle('hidden', !running);

    if (running && settings.currentRunningTask) {
        dom.runningTaskTitle.textContent = settings.currentRunningTask.title;

        if (settings.timerInterval) clearInterval(settings.timerInterval);
        if (settings.notificationInterval) clearInterval(settings.notificationInterval); 

        // 経過時間タイマー (省略)
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
        
        // ★ 継続通知タイマー開始の制御
        if (settings.enableOngoingNotification) {
            settings.notificationInterval = setInterval(notifyOngoingTask, NOTIFICATION_INTERVAL_MS);
        }

    } else {
        // 停止後の処理
        if (settings.timerInterval) clearInterval(settings.timerInterval);
        if (settings.notificationInterval) clearInterval(settings.notificationInterval); 
        
        settings.timerInterval = null;
        settings.notificationInterval = null;
        
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
                if (dom.confNotionToken) settings.notionToken = dom.confNotionToken.value;
                if (dom.confNotionUserId) settings.humanUserId = dom.confNotionUserId.value.trim(); 
                if (dom.confTogglToken) settings.togglApiToken = dom.confTogglToken.value;
                if (dom.confTogglWid) settings.togglWorkspaceId = dom.confTogglWid.value;
                
                // ★ 継続通知設定の保存
                if (dom.confEnableOngoingNotification) settings.enableOngoingNotification = dom.confEnableOngoingNotification.checked;

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
        
        // ... (以下略) ...
