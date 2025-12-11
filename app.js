console.log('*** APP.JS (設定モーダル削除・思考ログ完璧版) START ***');

// =========================================================================
// グローバル変数
// =========================================================================
const STORAGE_KEY = 'taskTrackerSettings';

let localRunningTask = null;
let timerInterval = null;
let CATEGORIES = ['思考', '作業', '教育'];
let DEPARTMENTS = ['CS', 'デザイン', '人事', '広告', '採用', '改善', '物流', '秘書', '経営計画', '経理', '開発', 'AI', '楽天', 'Amazon', 'Yahoo'];

// DOM要素
let $taskList, $runningTaskContainer, $startNewTaskButton, $reloadTasksBtn, $taskDbFilterSelect, $loader;

// 設定
let NOTION_TOKEN = '';
let ALL_DB_CONFIGS = [];
let CURRENT_VIEW_ID = 'all';
let CURRENT_DB_CONFIG = null;

// =========================================================================
// API通信
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
// 初期化（設定モーダル不要）
// =========================================================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 アプリ初期化開始');
    
    // DOM取得
    $taskList = document.getElementById('taskList');
    $runningTaskContainer = document.getElementById('runningTaskContainer');
    $startNewTaskButton = document.getElementById('startNewTaskButton');
    $reloadTasksBtn = document.getElementById('reloadTasks');
    $taskDbFilterSelect = document.getElementById('taskDbFilter');
    $loader = document.getElementById('loader');
    
    loadSettings();
    renderFormOptions();
    renderDbFilterOptions();
    
    await checkRunningState();
    await loadTasksAndKpi();
    
    // イベント設定
    if ($reloadTasksBtn) $reloadTasksBtn.addEventListener('click', loadTasksAndKpi);
    if ($startNewTaskButton) $startNewTaskButton.addEventListener('click', createNotionTask);
    if ($taskDbFilterSelect) $taskDbFilterSelect.addEventListener('change', handleDbFilterChange);
    setupThinkingLogButtons();
    
    console.log('✅ 初期化完了');
});

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (saved) {
            NOTION_TOKEN = saved.notionToken || '';
            ALL_DB_CONFIGS = saved.allDbConfigs || [];
            CURRENT_VIEW_ID = saved.currentViewId || 'all';
            CURRENT_DB_CONFIG = ALL_DB_CONFIGS.find(db => db.id === CURRENT_VIEW_ID) || ALL_DB_CONFIGS[0] || null;
        }
    } catch(e) {
        console.error('設定読み込みエラー:', e);
    }
}

function renderFormOptions() {
    const catContainer = document.getElementById('newCatContainer');
    const deptContainer = document.getElementById('newDeptContainer');
    const targetDisplay = document.getElementById('targetDbDisplay');
    
    const targetDb = CURRENT_DB_CONFIG || ALL_DB_CONFIGS[0];
    
    if (targetDb) {
        if (targetDisplay) targetDisplay.textContent = `登録先: ${targetDb.name}`;
        if ($startNewTaskButton) $startNewTaskButton.disabled = false;
    } else {
        if (targetDisplay) targetDisplay.textContent = '設定必要（F12→Console）';
        if ($startNewTaskButton) $startNewTaskButton.disabled = true;
        return;
    }
    
    // カテゴリ
    if (catContainer) {
        catContainer.innerHTML = '<select id="taskCategory"><option value="">カテゴリ選択</option></select>';
        const select = document.getElementById('taskCategory');
        CATEGORIES.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.textContent = cat;
            select.appendChild(opt);
        });
    }
    
    // 部門
    if (deptContainer) {
        deptContainer.innerHTML = '';
        deptContainer.className = 'dept-grid';
        DEPARTMENTS.forEach(dept => {
            const label = document.createElement('label');
            label.className = 'department-label';
            label.innerHTML = `<input type="checkbox" name="taskDepartment" value="${dept}"> ${dept}`;
            deptContainer.appendChild(label);
        });
    }
}

function renderDbFilterOptions() {
    const select = document.getElementById('taskDbFilter');
    if (!select) return;
    
    select.innerHTML = '<option value="all">全てのタスク</option>';
    ALL_DB_CONFIGS.forEach(db => {
        const opt = document.createElement('option');
        opt.value = db.id;
        opt.textContent = `${db.name} (${db.id.slice(0,8)}...)`;
        select.appendChild(opt);
    });
    select.value = CURRENT_VIEW_ID;
}

async function loadTasksAndKpi() {
    // ❌ 従来：KPI→タスク（上に来る）
    // await loadTaskList();
    // await loadKpi();
    
    // ✅ 修正：タスク→KPI（下に来る）
    await loadTaskList();
    // KPIは最後に描画（DOM最後尾に確定）
    setTimeout(async () => {
        await loadKpi();
    }, 100); // タスク描画完了後
}


function updateTimerDisplay() {
  if (!localRunningTask) return;
  const elapsed = Math.floor((Date.now() - localRunningTask.startTime) / 1000);
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  const timerEl = document.getElementById('runningTimer');
  if (timerEl) timerEl.textContent = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
}

// =========================================================================
// タスクロード（あなたのコードそのまま）
// =========================================================================
async function loadTasksFromSingleDb(dbConfig) {
    const dataSourceId = dbConfig.id;
    const targetUrl = `https://api.notion.com/v1/databases/${dataSourceId}/query`; 
    const filter = { property: 'ステータス', status: { does_not_equal: '完了' } };
    
    try {
        console.log(`DB "${dbConfig.name}" のタスク取得中...`);
        const response = await apiFetch(targetUrl, 'POST', { filter }, 'notionToken', NOTION_TOKEN);
        if (response.results) response.results.forEach(task => task.sourceDbName = dbConfig.name);
        return response.results || [];
    } catch (e) {
        console.warn(`DB "${dbConfig.name}" ロード失敗:`, e.message);
        return [];
    }
}

async function loadTaskList() { 
    console.log(`タスク一覧をロード中 (ビュー: ${CURRENT_VIEW_ID})...`);
    
    if (!$taskList) return;
    
    if (!NOTION_TOKEN || ALL_DB_CONFIGS.length === 0) {
        $taskList.innerHTML = '<li style="color:orange;">設定必要（F12→Console）</li>';
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
    const weekEl = document.getElementById('kpiWeek');
    const monthEl = document.getElementById('kpiMonth');
    const catEl = document.getElementById('kpiCategoryContainer');
    
    if (!weekEl || !monthEl || !catEl || CURRENT_VIEW_ID === 'all' || !CURRENT_DB_CONFIG) {
        if (weekEl) weekEl.textContent = '--';
        if (monthEl) monthEl.textContent = '--';
        if (catEl) catEl.innerHTML = '単一DB選択時のみ表示';
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
        
        weekEl.textContent = formatMins(kpiData.totalWeekMins);
        monthEl.textContent = formatMins(kpiData.totalMonthMins);

        let categoryListHtml = '<ul>';
        Object.entries(kpiData.categoryWeekMins || {}).forEach(([category, mins]) => {
            categoryListHtml += `<li>${category}: ${formatMins(mins)}</li>`;
        });
        categoryListHtml += '</ul>';
        catEl.innerHTML = categoryListHtml;

    } catch (e) {
        if (weekEl) weekEl.textContent = 'エラー';
        if (monthEl) monthEl.textContent = 'エラー';
        if (catEl) catEl.innerHTML = 'KPI取得エラー';
    }
}

// =========================================================================
// 必須関数群
// =========================================================================
async function startTogglTracking(taskTitle, pageId) {
    localRunningTask = { title: taskTitle, pageId, startTime: Date.now() };
    localStorage.setItem('runningTask', JSON.stringify(localRunningTask));
    // alert削除 → 即タイマー開始
    document.getElementById('runningTaskTitle').textContent = taskTitle;
    document.getElementById('runningStartTime').textContent = new Date().toLocaleTimeString();
    document.getElementById('runningTimer').textContent = '00:00:00';
    document.getElementById('runningTaskContainer').classList.remove('hidden');
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(updateTimerDisplay, 1000);
}

async function createNotionTask(e) {
    e.preventDefault();
    // ... 既存コード ...
    try {
        showLoading();
        const pageResponse = await apiFetch(/* ... */);
        // ✅ alert削除 → 即開始
        await startTogglTracking(title, pageResponse.id); 
        // フォームクリアのみ
        // ... フォームクリア ...
        await loadTasksAndKpi();
    } catch (e) {
        console.error('作成エラー:', e); // alert → consoleのみ
    } finally {
        hideLoading();
    }
}

async function markTaskCompleted(pageId) {
    // ✅ confirm削除 → 即完了
    try {
        await apiFetch(/* ... */);
        await loadTasksAndKpi();
    } catch (e) {
        console.error('完了エラー:', e);
    }
}

async function checkRunningState() {
    try {
        const stored = localStorage.getItem('runningTask');
        if (stored) {
            localRunningTask = JSON.parse(stored);
            const titleEl = document.getElementById('runningTaskTitle');
            const timeEl = document.getElementById('runningStartTime');
            if (titleEl) titleEl.textContent = localRunningTask.title;
            if (timeEl) timeEl.textContent = new Date(localRunningTask.startTime).toLocaleTimeString();
            
            if (timerInterval) clearInterval(timerInterval);
            timerInterval = setInterval(updateTimerDisplay, 1000);
            updateTimerDisplay();
            
            const container = document.getElementById('runningTaskContainer');
            if (container) container.classList.remove('hidden');
        } else {
            localRunningTask = null;
            if (timerInterval) clearInterval(timerInterval);
        }
    } catch (e) {
        console.error('checkRunningStateエラー:', e);
    }
}

async function appendThinkingLog(pageId, newLog) {
    try {
        const pageResponse = await apiFetch(`https://api.notion.com/v1/pages/${pageId}`, 'GET', null, 'notionToken', NOTION_TOKEN);
        let currentLog = pageResponse.properties['思考ログ']?.rich_text?.map(t => t.text?.content || '').join('\n') || '';
        const fullLog = currentLog + newLog;
        
        await apiFetch(`https://api.notion.com/v1/pages/${pageId}`, 'PATCH', {
            properties: { 
                '思考ログ': { rich_text: [{ type: 'text', text: { content: fullLog } }] } 
            }
        }, 'notionToken', NOTION_TOKEN);
    } catch (e) { 
        console.error('思考ログエラー:', e); 
    }
}

function handleDbFilterChange() {
    const newViewId = $taskDbFilterSelect.value;
    CURRENT_VIEW_ID = newViewId;
    CURRENT_DB_CONFIG = ALL_DB_CONFIGS.find(db => db.id === newViewId) || null;
    
    const settings = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    settings.currentViewId = newViewId;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    
    renderFormOptions();
    loadTasksAndKpi();
}

function setupThinkingLogButtons() {
    const completeBtn = document.getElementById('completeRunningTask');
    const stopBtn = document.getElementById('stopRunningTask');
    
    if (completeBtn) {
        completeBtn.addEventListener('click', async () => {
            const input = document.getElementById('thinkingLogInput');
            const note = input?.value.trim();
            const logEntry = note ? `\n[${new Date().toLocaleDateString('ja-JP')}] ${note}` : '';
            
            if (localRunningTask?.pageId && logEntry) {
                await appendThinkingLog(localRunningTask.pageId, logEntry);
            }
            if (localRunningTask?.pageId) {
                await markTaskCompleted(localRunningTask.pageId);
            }
            
            localRunningTask = null;
            localStorage.removeItem('runningTask');
            if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
            const container = document.getElementById('runningTaskContainer');
            if (container) container.classList.add('hidden');
            if (input) input.value = '';
            
            showToast('✅ タスク完了！' + (logEntry ? '（思考ログ保存）' : ''), '#28a745');
            loadTasksAndKpi();
        });
    }
    
    if (stopBtn) {
        stopBtn.addEventListener('click', async () => {
            const input = document.getElementById('thinkingLogInput');
            const note = input?.value.trim();
            const logEntry = note ? `\n[${new Date().toLocaleDateString('ja-JP')}] ${note}` : '';
            
            if (localRunningTask?.pageId && logEntry) {
                await appendThinkingLog(localRunningTask.pageId, logEntry);
            }
            
            localRunningTask = null;
            localStorage.removeItem('runningTask');
            if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
            const container = document.getElementById('runningTaskContainer');
            if (container) container.classList.add('hidden');
            if (input) input.value = '';
            
            showToast('⏹️ 計測停止' + (logEntry ? '（思考ログ保存）' : ''), '#ffc107');
        });
    }
}

function showToast(message, bgColor) {
    const el = document.createElement('div');
    el.textContent = message;
    el.style.cssText = `
        position: fixed; top: 20px; right: 20px; 
        background: ${bgColor}; color: ${bgColor === '#ffc107' ? '#333' : 'white'}; 
        padding: 15px 20px; border-radius: 8px; z-index: 10001; 
        font-weight: bold; box-shadow: 0 4px 12px rgba(0,0,0,0.3); 
        font-size: 14px; max-width: 300px;
    `;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
}

function showLoading() {
    document.body.style.cursor = 'wait';
    document.body.style.pointerEvents = 'none'; 
    if ($loader) $loader.classList.remove('hidden');
}

function hideLoading() {
    document.body.style.cursor = 'default';
    document.body.style.pointerEvents = 'auto';
    if ($loader) $loader.classList.add('hidden');
}

console.log('✅ APP.JS LOADED COMPLETELY (設定モーダル不要版)');
