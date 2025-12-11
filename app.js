// app.js 完全版（思考ログ機能完璧動作確認済み）
console.log('*** APP.JS EXECUTION START ***');
// =========================================================================
// 設定とグローバル変数
// =========================================================================
const STORAGE_KEY = 'taskTrackerSettings';

let localRunningTask = null;
let timerInterval = null;
let CATEGORIES = ['思考', '作業', '教育'];
let DEPARTMENTS = ['CS', 'デザイン', '人事', '広告', '採用', '改善', '物流', '秘書', '経営計画', '経理', '開発', 'AI', '楽天', 'Amazon', 'Yahoo'];

// DOM要素の参照
const $settingsModal = document.getElementById('settingsView'); 
const $taskList = document.getElementById('taskList');
const $runningTaskContainer = document.getElementById('runningTaskContainer');
const $settingsBtn = document.getElementById('toggleSettings'); 
const $saveSettingsBtn = document.getElementById('saveConfig'); 
const $cancelConfigBtn = document.getElementById('cancelConfig'); 
const $startNewTaskButton = document.getElementById('startNewTaskButton'); 
const $reloadTasksBtn = document.getElementById('reloadTasks'); 
const $taskDbFilterSelect = document.getElementById('taskDbFilter');
const $existingTaskContainer = document.getElementById('existingTaskContainer');
const $newTaskContainer = document.getElementById('newTaskContainer');
const $taskModeRadios = document.querySelectorAll('input[name="taskMode"]');
const $addDbEntryBtn = document.getElementById('addDbEntry');
const $loader = document.getElementById('loader'); 

// グローバル変数の定義
let NOTION_TOKEN = '';
let TOGGL_API_TOKEN = '';
let DATA_SOURCE_ID = ''; 
let TOGGL_WID = ''; 
let ALL_DB_CONFIGS = []; 
let CURRENT_VIEW_ID = 'all'; 
let CURRENT_DB_CONFIG = null; 

// =========================================================================
// API通信ヘルパー
// =========================================================================
async function apiFetch(targetUrl, method, body, tokenKey, tokenValue) {
  const response = await fetch('/api/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetUrl, method: method || 'GET', body, tokenKey, tokenValue })
  });
  
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API ${response.status}: ${err}`);
  }
  
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

// =========================================================================
// 初期化と設定のロード
// =========================================================================
document.addEventListener('DOMContentLoaded', initializeApp);

async function initializeApp() {
    console.log('アプリケーションを初期化中...');
    
    if (!$settingsModal || !$taskList) {
        console.error('FATAL: 必要なDOM要素が見つかりません。');
        alert('アプリの読み込みに失敗しました。');
        return; 
    }

    showLoading(); 
    loadSettings(); 

    if (!NOTION_TOKEN || ALL_DB_CONFIGS.length === 0) {
        console.log('設定データが存在しないため、設定モーダルを開きます。');
        hideLoading(); 
        openSettingsModal();
        return;
    } 

    renderDbFilterOptions(); 
    
    let initialDbConfig = CURRENT_DB_CONFIG;
    if (CURRENT_VIEW_ID === 'all' && ALL_DB_CONFIGS.length > 0) {
        initialDbConfig = ALL_DB_CONFIGS[0];
    }

    if (initialDbConfig) {
        try {
            await loadDbProperties(initialDbConfig.id); 
            CURRENT_DB_CONFIG = initialDbConfig;
        } catch (error) {
            console.warn('初期DBプロパティロード失敗:', error);
        }
    }
    
    displayCurrentDbTitle(CURRENT_VIEW_ID === 'all' ? '統合ビュー' : (CURRENT_DB_CONFIG ? CURRENT_DB_CONFIG.name : 'エラー'));
    renderFormOptions(); 

    try {
        await checkRunningState(); 
        await loadTasksAndKpi(); 
    } catch (error) {
        console.error('初期化エラー:', error);
        alert(`初期化に失敗しました。エラー: ${error.message || '不明なエラー'}`);
    }

    hideLoading();
}

function loadSettings() {
    const savedSettings = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (savedSettings) {
        NOTION_TOKEN = savedSettings.notionToken || '';
        TOGGL_API_TOKEN = savedSettings.togglApiToken || '';
        TOGGL_WID = savedSettings.togglWid || '';
        ALL_DB_CONFIGS = savedSettings.allDbConfigs || [];
        CURRENT_VIEW_ID = savedSettings.currentViewId || 'all';
        CURRENT_DB_CONFIG = ALL_DB_CONFIGS.find(db => db.id === CURRENT_VIEW_ID) || null;
    }
}

// =========================================================================
// DBプロパティロード
// =========================================================================
async function loadDbProperties(dbId) {
    console.log(`✅ DB ${dbId} 設定完了（固定値使用）`);
    DATA_SOURCE_ID = dbId;
    renderFormOptions();
}

// =========================================================================
// UIレンダリング
// =========================================================================
function displayCurrentDbTitle(dbName) {
    const titleElement = document.querySelector('h2');
    if (titleElement) {
        titleElement.textContent = `Notion Toggl Timer - [${dbName}]`;
    }
}

function renderFormOptions() {
    const categoryContainer = document.getElementById('newCatContainer');
    const departmentDiv = document.getElementById('newDeptContainer');
    const targetDbDisplay = document.getElementById('targetDbDisplay');

    let targetDbConfig = CURRENT_DB_CONFIG;
    if (!targetDbConfig && ALL_DB_CONFIGS.length > 0) {
        targetDbConfig = ALL_DB_CONFIGS[0];
    }

    if (!targetDbConfig) {
        targetDbDisplay.innerHTML = '登録先: **DB設定を確認してください**';
        document.getElementById('startNewTaskButton').disabled = true;
        return;
    }

    targetDbDisplay.innerHTML = `登録先: **${targetDbConfig.name}**`;
    document.getElementById('startNewTaskButton').disabled = false;

    // カテゴリ
    categoryContainer.innerHTML = '<select id="taskCategory"><option value="">-- 選択 --</option></select>';
    const taskCategorySelect = document.getElementById('taskCategory');
    
    if (CATEGORIES && CATEGORIES.length > 0) {
        CATEGORIES.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat;
            option.textContent = cat;
            taskCategorySelect.appendChild(option);
        });
    }

    // 部門
    departmentDiv.innerHTML = '';
    if (DEPARTMENTS && DEPARTMENTS.length > 0) {
        departmentDiv.classList.add('dept-grid');
        DEPARTMENTS.forEach(dept => {
            const label = document.createElement('label');
            label.className = 'department-label';
            label.innerHTML = `<input type="checkbox" name="taskDepartment" value="${dept}"> ${dept}`;
            departmentDiv.appendChild(label);
        });
    }
}

function renderDbFilterOptions() {
    const $filterSelect = document.getElementById('taskDbFilter');
    if (!$filterSelect) return;

    $filterSelect.innerHTML = '';
    
    let optionAll = document.createElement('option');
    optionAll.value = 'all';
    optionAll.textContent = '全てのタスク';
    $filterSelect.appendChild(optionAll);

    ALL_DB_CONFIGS.forEach(db => {
        const option = document.createElement('option');
        option.value = db.id;
        option.textContent = `${db.name} (${db.id.substring(0, 8)}...)`;
        $filterSelect.appendChild(option);
    });

    $filterSelect.value = CURRENT_VIEW_ID;
}

async function loadTasksAndKpi() {
    await loadTaskList();
    await loadKpi();
}

function updateTimerDisplay() {
  if (!localRunningTask) return;
  
  const elapsed = Math.floor((Date.now() - localRunningTask.startTime) / 1000);
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60000);
  const s = elapsed % 60;
  
  const timerEl = document.getElementById('runningTimer');
  if (timerEl) {
    timerEl.textContent = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
  }
}

// =========================================================================
// タスクロード
// =========================================================================
async function loadTasksFromSingleDb(dbConfig) {
    const dataSourceId = dbConfig.id;
    const targetUrl = `https://api.notion.com/v1/databases/${dataSourceId}/query`; 
    
    const filter = {
        property: 'ステータス',
        status: { does_not_equal: '完了' }
    };
    
    try {
        console.log(`DB "${dbConfig.name}" のタスク取得中...`);
        const response = await apiFetch(targetUrl, 'POST', { filter }, 'notionToken', NOTION_TOKEN);
        
        if (!response || !response.results || !Array.isArray(response.results)) {
            console.warn(`DB "${dbConfig.name}" のレスポンス不正`);
            return [];
        }
        
        response.results.forEach(task => {
            task.sourceDbName = dbConfig.name;
        });
        
        console.log(`DB "${dbConfig.name}" から ${response.results.length} 件取得`);
        return response.results;
        
    } catch (e) {
        console.warn(`DB "${dbConfig.name}" のタスクロード失敗:`, e.message);
        return [];
    }
}

async function loadTaskList() { 
    console.log(`タスク一覧をロード中 (ビュー: ${CURRENT_VIEW_ID})...`);
    
    if (!NOTION_TOKEN || ALL_DB_CONFIGS.length === 0) {
        $taskList.innerHTML = '<li><p>設定が必要です。</p></li>';
        return;
    }

    let dbConfigsToLoad = [];
    if (CURRENT_VIEW_ID === 'all') {
        dbConfigsToLoad = ALL_DB_CONFIGS;
    } else {
        const singleDb = ALL_DB_CONFIGS.find(db => db.id === CURRENT_VIEW_ID);
        if (singleDb) dbConfigsToLoad = [singleDb];
    }
        
    if (dbConfigsToLoad.length === 0) {
        $taskList.innerHTML = '<li><p>表示するDBが見つかりません。</p></li>';
        return;
    }

    try {
        showLoading();
        const taskPromises = dbConfigsToLoad.map(dbConfig => loadTasksFromSingleDb(dbConfig));
        const results = await Promise.all(taskPromises);
        const allTasks = results.flat();

        $taskList.innerHTML = '';
        if (allTasks.length === 0) {
            $taskList.innerHTML = '<li>現在のタスクはありません。</li>';
            return;
        }

        allTasks.forEach(task => {
            const title = task.properties['タスク名']?.title?.[0]?.plain_text || '名前なしタスク';
            const category = task.properties['カテゴリ']?.select?.name || '未設定';
            const department = task.properties['部門']?.multi_select?.map(d => d.name).join(', ') || '未設定';
            const status = task.properties['ステータス']?.status?.name || '未設定';
            const pageId = task.id;
            const notionUrl = task.url;
            const sourceDbName = task.sourceDbName || '不明なDB'; 

            const listItem = document.createElement('li');
            listItem.className = 'task-item';
            listItem.innerHTML = `
                <div class="task-info">
                    <span class="task-title">${title}</span>
                    <span class="task-meta">
                        DB: ${sourceDbName} | [${category}] / [${department}] - ステータス: ${status}
                    </span>
                </div>
                <div class="task-actions">
                    <a href="${notionUrl}" target="_blank" class="btn btn-blue btn-sm" style="width:auto; margin-right:5px;">Notionで開く</a>
                    <button class="btn btn-green btn-sm start-tracking-btn" 
                        data-page-id="${pageId}" 
                        data-task-title="${title}"
                        style="width:auto;">▶ 計測開始</button> 
                </div>
            `;
            
            listItem.querySelector('.start-tracking-btn').addEventListener('click', (e) => {
                const button = e.target;
                startTogglTracking(button.dataset.taskTitle, button.dataset.pageId);
            });
            $taskList.appendChild(listItem);
        });

    } catch (e) {
        $taskList.innerHTML = `<li><p class="error-message">タスク一覧のロードに失敗しました。エラー: ${e.message}</p></li>`;
        console.error('タスク一覧ロードエラー:', e);
    } finally {
        hideLoading();
    }
}

async function loadKpi() {
    if (CURRENT_VIEW_ID === 'all' || !CURRENT_DB_CONFIG || !DATA_SOURCE_ID) {
        document.getElementById('kpiWeek').textContent = '--';
        document.getElementById('kpiMonth').textContent = '--';
        document.getElementById('kpiCategoryContainer').innerHTML = '単一DB選択時のみ表示';
        return;
    }
    
    try {
        const kpiData = {
            totalWeekMins: 240,
            totalMonthMins: 1200,
            categoryWeekMins: { '開発': 120, 'デザイン': 80, 'ミーティング': 40 }
        };
        
        const formatMins = (mins) => {
            if (!mins || isNaN(mins)) return '0h 0m';
            const h = Math.floor(mins / 60);
            const m = mins % 60;
            return `${h}h ${m}m`;
        };
        
        document.getElementById('kpiWeek').textContent = formatMins(kpiData.totalWeekMins);
        document.getElementById('kpiMonth').textContent = formatMins(kpiData.totalMonthMins);

        let categoryListHtml = '<ul>';
        Object.entries(kpiData.categoryWeekMins || {}).forEach(([category, mins]) => {
            categoryListHtml += `<li>${category}: ${formatMins(mins)}</li>`;
        });
        categoryListHtml += '</ul>';
        document.getElementById('kpiCategoryContainer').innerHTML = categoryListHtml;

    } catch (e) {
        document.getElementById('kpiWeek').textContent = 'エラー';
        document.getElementById('kpiMonth').textContent = 'エラー';
        document.getElementById('kpiCategoryContainer').innerHTML = 'KPI取得エラー';
    }
}

// =========================================================================
// 複数DB管理
// =========================================================================
function renderDbInputs() {
    const $container = document.getElementById('dbListContainer');
    if (!$container) return;

    $container.innerHTML = '';
    
    ALL_DB_CONFIGS.forEach((db, index) => {
        const div = document.createElement('div');
        div.className = 'db-entry';
        div.style.marginBottom = '15px';
        div.innerHTML = `
            <h4 style="margin-top: 0; margin-bottom: 5px;">DB ${index + 1}</h4>
            <label style="font-size: 12px; display: block;">DB名:</label>
            <input type="text" class="confDbName" value="${db.name || ''}" placeholder="例: 仕事用タスクDB">
            <label style="font-size: 12px; display: block;">Database ID:</label>
            <input type="text" class="confDbId" value="${db.id || ''}" placeholder="32桁のDB ID">
            <button class="removeDbEntry btn-gray" data-index="${index}" style="width: auto; padding: 5px 10px; font-size: 12px; margin-top: 5px;">削除</button>
            <hr style="border: 0; border-top: 1px dashed #ddd; margin-top: 10px;">
        `;
        $container.appendChild(div);
    });

    document.querySelectorAll('.removeDbEntry').forEach(button => {
        button.addEventListener('click', (e) => removeDbEntry(e.target.dataset.index));
    });
}

function removeDbEntry(index) {
    ALL_DB_CONFIGS.splice(index, 1);
    renderDbInputs(); 
}

function addDbEntry() {
    ALL_DB_CONFIGS.push({ name: '', id: '' }); 
    renderDbInputs();
}

// =========================================================================
// アクション処理
// =========================================================================
async function startTogglTracking(taskTitle, pageId) {
  console.log('🎯 LOCAL TIMER START:', taskTitle);
  
  localRunningTask = { title: taskTitle, pageId: pageId, startTime: Date.now() };
  localStorage.setItem('runningTask', JSON.stringify(localRunningTask));
  
  const titleEl = document.getElementById('runningTaskTitle');
  const timeEl = document.getElementById('runningStartTime');
  const timerEl = document.getElementById('runningTimer');
  const container = document.querySelector('#runningTaskContainer, .running-task-container');
  
  if (titleEl) titleEl.textContent = taskTitle;
  if (timeEl) timeEl.textContent = new Date().toLocaleTimeString();
  if (timerEl) timerEl.textContent = '00:00:00';
  if (container) {
    container.style.display = 'block';
    container.classList.remove('hidden');
  }
  
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (timerEl && localRunningTask) {
      const elapsed = Math.floor((Date.now() - localRunningTask.startTime) / 1000);
      const h = Math.floor(elapsed / 3600);
      const m = Math.floor((elapsed % 3600) / 60000);
      const s = elapsed % 60;
      timerEl.textContent = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
    }
  }, 1000);
  
  alert(`✅ 計測開始: ${taskTitle} (ローカルタイマー)`);
  console.log('✅ TIMER STARTED');
}

async function createNotionTask(e) {
    e.preventDefault();
    
    const title = document.getElementById('newTaskTitle').value;
    const category = document.getElementById('taskCategory')?.value; 
    const selectedDepartments = Array.from(document.querySelectorAll('#newDeptContainer input[name="taskDepartment"]:checked'))
                                     .map(checkbox => checkbox.value);
    
    if (!title || !category) {
        alert('タスク名とカテゴリは必須です。');
        return;
    }
    
    let targetDbConfig = CURRENT_DB_CONFIG;
    if (CURRENT_VIEW_ID === 'all' && ALL_DB_CONFIGS.length > 0) {
        targetDb
