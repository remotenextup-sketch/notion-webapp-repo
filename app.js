console.log('*** APP.JS (設定モーダル削除版) START ***');

// =========================================================================
// 設定とグローバル変数（簡素化）
// =========================================================================
const STORAGE_KEY = 'taskTrackerSettings';

let localRunningTask = null;
let timerInterval = null;
let CATEGORIES = ['思考', '作業', '教育'];
let DEPARTMENTS = ['CS', 'デザイン', '人事', '広告', '採用', '改善', '物流', '秘書', '経営計画', '経理', '開発', 'AI', '楽天', 'Amazon', 'Yahoo'];

// DOM要素
let $taskList, $runningTaskContainer, $startNewTaskButton, $reloadTasksBtn, $taskDbFilterSelect, $loader;

// グローバル設定（LocalStorage直読み）
let NOTION_TOKEN = '';
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
// 初期化（設定モーダル削除版）
// =========================================================================
document.addEventListener('DOMContentLoaded', initializeApp);

async function initializeApp() {
    console.log('アプリケーション初期化中...');
    
    // DOM要素取得
    $taskList = document.getElementById('taskList');
    $runningTaskContainer = document.getElementById('runningTaskContainer');
    $startNewTaskButton = document.getElementById('startNewTaskButton');
    $reloadTasksBtn = document.getElementById('reloadTasks');
    $taskDbFilterSelect = document.getElementById('taskDbFilter');
    $loader = document.getElementById('loader');
    
    if (!$taskList) {
        console.error('FATAL: taskListが見つかりません');
        return;
    }

    // LocalStorageから設定読み込み
    loadSettings();
    
    // 設定がない場合は手動設定促し
    if (!NOTION_TOKEN || ALL_DB_CONFIGS.length === 0) {
        console.log('⚠️ 設定が必要です。LocalStorageに以下を設定:');
        console.log('localStorage.setItem("taskTrackerSettings", JSON.stringify({');
        console.log('  notionToken: "your_token",');
        console.log('  allDbConfigs: [{name: "DB名", id: "32桁DBID"}]'));
        console.log('}));');
        $taskList.innerHTML = '<li style="color:red;">設定が必要です。F12→Consoleで設定コマンド実行</li>';
        return;
    }
    
    renderDbFilterOptions();
    renderFormOptions();
    
    await checkRunningState();
    await loadTasksAndKpi();
}

function loadSettings() {
    try {
        const savedSettings = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (savedSettings) {
            NOTION_TOKEN = savedSettings.notionToken || '';
            ALL_DB_CONFIGS = savedSettings.allDbConfigs || [];
            CURRENT_VIEW_ID = savedSettings.currentViewId || 'all';
            CURRENT_DB_CONFIG = ALL_DB_CONFIGS.find(db => db.id === CURRENT_VIEW_ID) || null;
        }
    } catch(e) {
        console.error('設定読み込みエラー:', e);
    }
}

// =========================================================================
// UIレンダリング（簡素化）
// =========================================================================
function renderFormOptions() {
    const categoryContainer = document.getElementById('newCatContainer');
    const departmentDiv = document.getElementById('newDeptContainer');
    const targetDbDisplay = document.getElementById('targetDbDisplay');

    let targetDbConfig = CURRENT_DB_CONFIG || ALL_DB_CONFIGS[0];
    
    if (!targetDbConfig) {
        targetDbDisplay.innerHTML = '登録先: **設定確認**';
        if ($startNewTaskButton) $startNewTaskButton.disabled = true;
        return;
    }

    targetDbDisplay.innerHTML = `登録先: **${targetDbConfig.name}**`;
    if ($startNewTaskButton) $startNewTaskButton.disabled = false;

    // カテゴリ
    categoryContainer.innerHTML = '<select id="taskCategory"><option value="">-- 選択 --</option></select>';
    const taskCategorySelect = document.getElementById('taskCategory');
    CATEGORIES.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        taskCategorySelect.appendChild(option);
    });

    // 部門
    departmentDiv.innerHTML = '';
    departmentDiv.classList.add('dept-grid');
    DEPARTMENTS.forEach(dept => {
        const label = document.createElement('label');
        label.className = 'department-label';
        label.innerHTML = `<input type="checkbox" name="taskDepartment" value="${dept}"> ${dept}`;
        departmentDiv.appendChild(label);
    });
}

function renderDbFilterOptions() {
    const $filterSelect = document.getElementById('taskDbFilter');
    if (!$filterSelect) return;

    $filterSelect.innerHTML = '<option value="all">全てのタスク</option>';
    ALL_DB_CONFIGS.forEach(db => {
        const option = document.createElement('option');
        option.value = db.id;
        option.textContent = `${db.name} (${db.id.substring(0, 8)}...)`;
        $filterSelect.appendChild(option);
    });
    $filterSelect.value = CURRENT_VIEW_ID;
}

// =========================================================================
// タイマー・タスク処理（変更なし）
// =========================================================================
function updateTimerDisplay() {
  if (!localRunningTask) return;
  const elapsed = Math.floor((Date.now() - localRunningTask.startTime) / 1000);
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60000);
  const s = elapsed % 60;
  const timerEl = document.getElementById('runningTimer');
  if (timerEl) timerEl.textContent = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
}

async function startTogglTracking(taskTitle, pageId) {
  console.log('🎯 TIMER START:', taskTitle);
  localRunningTask = { title: taskTitle, pageId: pageId, startTime: Date.now() };
  localStorage.setItem('runningTask', JSON.stringify(localRunningTask));
  
  document.getElementById('runningTaskTitle').textContent = taskTitle;
  document.getElementById('runningStartTime').textContent = new Date().toLocaleTimeString();
  document.getElementById('runningTimer').textContent = '00:00:00';
  document.getElementById('runningTaskContainer').classList.remove('hidden');
  
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(updateTimerDisplay, 1000);
}

// ★思考ログ機能・トースト（変更なし）★
const completeBtn = document.getElementById('completeRunningTask');
if (completeBtn) {
  completeBtn.addEventListener('click', async () => {
    const thinkingLogInput = document.getElementById('thinkingLogInput');
    const thinkingNote = thinkingLogInput?.value.trim();
    const logEntry = thinkingNote ? `\n[${new Date().toLocaleDateString('ja-JP')}] ${thinkingNote}` : '';
    
    if (localRunningTask?.pageId && logEntry) await appendThinkingLog(localRunningTask.pageId, logEntry);
    if (localRunningTask?.pageId) await markTaskCompleted(localRunningTask.pageId);
    
    localRunningTask = null; localStorage.removeItem('runningTask');
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    document.getElementById('runningTaskContainer').classList.add('hidden');
    if (thinkingLogInput) thinkingLogInput.value = '';
    
    showToast('✅ タスク完了！' + (logEntry ? '（思考ログ保存）' : ''), '#28a745');
    loadTasksAndKpi();
  });
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
  const container = document.getElementById('runningTaskContainer');
  
  if (titleEl) titleEl.textContent = taskTitle;
  if (timeEl) timeEl.textContent = new Date().toLocaleTimeString();
  if (timerEl) timerEl.textContent = '00:00:00';
  if (container) {
    container.classList.remove('hidden');
  }
  
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(updateTimerDisplay, 1000);
  
  console.log('✅ TIMER STARTED（サイレント）');
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
        targetDbConfig = ALL_DB_CONFIGS[0];
    }

    if (!targetDbConfig) {
        alert('エラー: タスクを登録するDBが選択されていません。設定を確認してください。');
        return;
    }
    
    const deptProps = selectedDepartments.map(d => ({ name: d }));
    const pageProperties = {
        'タスク名': { title: [{ type: 'text', text: { content: title } }] },
        'カテゴリ': { select: { name: category } },
        '部門': { multi_select: deptProps },
        'ステータス': { status: { name: '未着手' } }
    };
    
    const parentObject = { type: 'database_id', database_id: targetDbConfig.id };
    const targetUrl = 'https://api.notion.com/v1/pages';
    
    try {
        showLoading();
        const pageResponse = await apiFetch(targetUrl, 'POST', { parent: parentObject, properties: pageProperties }, 'notionToken', NOTION_TOKEN);
        const newPageId = pageResponse.id; 

        alert(`タスクが正常にDB「${targetDbConfig.name}」に作成されました！`);
        await startTogglTracking(title, newPageId); 
        
        document.getElementById('newTaskTitle').value = ''; 
        if (document.getElementById('taskCategory')) document.getElementById('taskCategory').value = ''; 
        document.querySelectorAll('#newDeptContainer input[name="taskDepartment"]:checked').forEach(cb => cb.checked = false);
        await loadTasksAndKpi();
    } catch (e) {
        alert(`タスク作成に失敗しました。\nエラー: ${e.message}`);
        console.error('タスク作成エラー:', e);
    } finally {
        hideLoading();
    }
}

async function markTaskCompleted(pageId) {
    if (confirm('このタスクを「完了」にしますか？')) {
        const targetUrl = `https://api.notion.com/v1/pages/${pageId}`;
        const updateProperties = {
            'ステータス': { status: { name: '完了' } },
            '完了日': { date: { start: new Date().toISOString().split('T')[0] } } 
        };

        try {
            showLoading();
            await apiFetch(targetUrl, 'PATCH', { properties: updateProperties }, 'notionToken', NOTION_TOKEN);
            alert('タスクを完了にしました。');
            await loadTasksAndKpi();
        } catch (e) {
            alert(`タスク完了処理に失敗しました。\nエラー: ${e.message}`);
            console.error('タスク完了エラー:', e);
        } finally {
            hideLoading();
        }
    }
}

// =========================================================================
// Toggl 連携（完全版）
// =========================================================================
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
      console.log('✅ 実行中状態復元完了');
    } else {
      localRunningTask = null;
      if (timerInterval) clearInterval(timerInterval);
      const container = document.getElementById('runningTaskContainer');
      if (container) container.classList.add('hidden');
    }
  } catch (e) {
    console.error('checkRunningStateエラー:', e);
  }
}

async function appendThinkingLog(pageId, newLog) {
  try {
    console.log('📝 思考ログ追記開始:', pageId);
    
    const pageResponse = await apiFetch(`https://api.notion.com/v1/pages/${pageId}`, 'GET', null, 'notionToken', NOTION_TOKEN);
    let currentLog = pageResponse.properties['思考ログ']?.rich_text?.map(t => t.text?.content || '').join('\n') || '';
    const fullLog = currentLog + newLog;
    
    await apiFetch(`https://api.notion.com/v1/pages/${pageId}`, 'PATCH', {
      properties: { 
        '思考ログ': { 
          rich_text: [{ type: 'text', text: { content: fullLog } }] 
        } 
      }
    }, 'notionToken', NOTION_TOKEN);
    console.log('✅ 思考ログ保存完了');
  } catch (e) { 
    console.error('思考ログエラー:', e); 
  }
}

// =========================================================================
// UIイベントリスナー
// =========================================================================
if ($startNewTaskButton) $startNewTaskButton.addEventListener('click', createNotionTask);
if ($settingsBtn) $settingsBtn.addEventListener('click', openSettingsModal);
if ($saveSettingsBtn) $saveSettingsBtn.addEventListener('click', saveSettings);
if ($cancelConfigBtn) $cancelConfigBtn.addEventListener('click', () => $settingsModal.classList.add('hidden'));
if ($reloadTasksBtn) $reloadTasksBtn.addEventListener('click', loadTasksAndKpi);

if ($taskDbFilterSelect) {
    $taskDbFilterSelect.addEventListener('change', async function() {
        const newViewId = this.value;
        CURRENT_VIEW_ID = newViewId;
        CURRENT_DB_CONFIG = ALL_DB_CONFIGS.find(db => db.id === newViewId) || null;
        
        const currentSettings = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
        currentSettings.currentViewId = newViewId;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(currentSettings));
        
        let targetDbConfig = CURRENT_DB_CONFIG;
        if (!targetDbConfig && ALL_DB_CONFIGS.length > 0) targetDbConfig = ALL_DB_CONFIGS[0];

        if (targetDbConfig) {
            try {
                await loadDbProperties(targetDbConfig.id); 
                renderFormOptions();
                displayCurrentDbTitle(newViewId === 'all' ? '統合ビュー' : targetDbConfig.name);
            } catch (e) {
                alert(`DB設定のロードに失敗しました。新規タスクの作成はできません。\nエラー: ${e.message}`);
                CATEGORIES = []; DEPARTMENTS = []; renderFormOptions();
                displayCurrentDbTitle(newViewId === 'all' ? '統合ビュー' : 'エラー');
            }
        } else {
            CATEGORIES = []; DEPARTMENTS = []; renderFormOptions();
            displayCurrentDbTitle('エラー');
        }
        loadTasksAndKpi(); 
    });
}

if ($taskModeRadios) {
    $taskModeRadios.forEach(radio => {
        radio.addEventListener('change', function() {
            if (this.value === 'new') {
                $existingTaskContainer.classList.add('hidden');
                $newTaskContainer.classList.remove('hidden');
            } else {
                $existingTaskContainer.classList.remove('hidden');
                $newTaskContainer.classList.add('hidden');
            }
        });
    });
}

if ($addDbEntryBtn) $addDbEntryBtn.addEventListener('click', addDbEntry);

// ★思考ログ機能 フォーム常駐・ダイアログ完全廃止版★
const completeBtn = document.getElementById('completeRunningTask');
if (completeBtn) {
  completeBtn.addEventListener('click', async () => {
    console.log('🛑 完了ボタンクリック！');
    
    const thinkingLogInput = document.getElementById('thinkingLogInput');
    const thinkingNote = thinkingLogInput?.value.trim();
    const logEntry = thinkingNote ? `\n[${new Date().toLocaleDateString('ja-JP')}] ${thinkingNote}` : '';
    
    if (localRunningTask?.pageId && logEntry) {
      await appendThinkingLog(localRunningTask.pageId, logEntry);
    }
    
    if (localRunningTask?.pageId) {
      await markTaskCompleted(localRunningTask.pageId);
    }
    
    localRunningTask = null;
    localStorage.removeItem('runningTask');
    if (timerInterval) { 
      clearInterval(timerInterval); 
      timerInterval = null; 
    }
    $runningTaskContainer.classList.add('hidden');
    
    if (thinkingLogInput) thinkingLogInput.value = '';
    
    // 右上トースト（3秒）
    showToast('✅ タスク完了！' + (logEntry ? '（思考ログ保存）' : ''), '#28a745');
    loadTasksAndKpi();
  });
}

const stopBtn = document.getElementById('stopRunningTask');
if (stopBtn) {
  stopBtn.addEventListener('click', async () => {
    console.log('⏹️ 停止ボタンクリック');
    
    const thinkingLogInput = document.getElementById('thinkingLogInput');
    const thinkingNote = thinkingLogInput?.value.trim();
    const logEntry = thinkingNote ? `\n[${new Date().toLocaleDateString('ja-JP')}] ${thinkingNote}` : '';
    
    if (localRunningTask?.pageId && logEntry) {
      await appendThinkingLog(localRunningTask.pageId, logEntry);
    }
    
    localRunningTask = null;
    localStorage.removeItem('runningTask');
    if (timerInterval) { 
      clearInterval(timerInterval); 
      timerInterval = null; 
    }
    $runningTaskContainer.classList.add('hidden');
    
    if (thinkingLogInput) thinkingLogInput.value = '';
    
    showToast('⏹️ 計測停止' + (logEntry ? '（思考ログ保存）' : ''), '#ffc107');
  });
}

// ★トースト通知関数（共通）★
function showToast(message, bgColor) {
  const messageEl = document.createElement('div');
  messageEl.textContent = message;
  messageEl.style.cssText = `
    position: fixed; top: 20px; right: 20px; 
    background: ${bgColor}; color: ${bgColor === '#ffc107' ? '#333' : 'white'}; 
    padding: 15px 20px; border-radius: 8px; z-index: 10001; 
    font-weight: bold; box-shadow: 0 4px 12px rgba(0,0,0,0.3); 
    font-size: 14px; max-width: 300px;
  `;
  document.body.appendChild(messageEl);
  
  setTimeout(() => {
    if (document.body.contains(messageEl)) {
      document.body.removeChild(messageEl);
    }
  }, 3000);
}

// =========================================================================
// 設定モーダル関数
// =========================================================================
function saveSettings() {
    const notionToken = document.getElementById('confNotionToken').value;
    const togglApiToken = document.getElementById('confTogglToken').value;
    const togglWid = document.getElementById('confTogglWid').value;
    
    const newAllDbConfigs = [];
    const dbNames = document.querySelectorAll('.confDbName');
    const dbIds = document.querySelectorAll('.confDbId');

    for (let i = 0; i < dbNames.length; i++) {
        if (dbIds[i].value && dbNames[i].value) {
            newAllDbConfigs.push({ name: dbNames[i].value, id: dbIds[i].value });
        }
    }
    
    if (!notionToken || newAllDbConfigs.length === 0) {
        alert('Notionトークンと少なくとも一つのDBの設定（名前とID）は必須です。');
        return;
    }

    let newCurrentViewId = CURRENT_VIEW_ID;
    const currentDbStillExists = newAllDbConfigs.some(db => db.id === newCurrentViewId);
    if (newCurrentViewId !== 'all' && !currentDbStillExists) newCurrentViewId = 'all'; 
    else if (!newCurrentViewId && newAllDbConfigs.length > 0) newCurrentViewId = newAllDbConfigs[0].id;

    const settings = { notionToken, togglApiToken, togglWid, allDbConfigs: newAllDbConfigs, currentViewId: newCurrentViewId };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    
    alert('設定を保存しました。アプリケーションをリロードします。');
    $settingsModal.classList.add('hidden');
    location.reload(); 
}

function openSettingsModal() {
    if (!$settingsModal) {
         console.error('設定モーダル要素が見つかりません。');
         alert('設定モーダルを開けませんでした。');
         return;
    }

    document.getElementById('confNotionToken').value = NOTION_TOKEN;
    document.getElementById('confTogglToken').value = TOGGL_API_TOKEN;
    document.getElementById('confTogglWid').value = TOGGL_WID;
    renderDbInputs(); 
    $settingsModal.classList.remove('hidden'); 
}

// =========================================================================
// ローディングUI
// =========================================================================
function showLoading() {
    document.body.style.cursor = 'wait';
    document.body.style.pointerEvents = 'none'; 
    const loader = document.getElementById('loader');
    if (loader) loader.classList.remove('hidden');
}

function hideLoading() {
    document.body.style.cursor = 'default';
    document.body.style.pointerEvents = 'auto';
    const loader = document.getElementById('loader');
    if (loader) loader.classList.add('hidden');
}

console.log('*** APP.JS LOADED COMPLETELY ***');
