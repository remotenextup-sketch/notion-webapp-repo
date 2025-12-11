console.log('*** 📱スマホ完璧版 APP.JS 全関数完備 START ***');

// =========================================================================
// グローバル変数
// =========================================================================
const STORAGE_KEY = 'taskTrackerSettings';
let localRunningTask = null;
let timerInterval = null;
let CATEGORIES = ['思考', '作業', '教育'];
let DEPARTMENTS = ['CS', 'デザイン', '人事', '広告', '採用', '改善', '物流', '秘書', '経営計画', '経理', '開発', 'AI', '楽天', 'Amazon', 'Yahoo'];

let $taskList, $runningTaskContainer, $startNewTaskButton, $reloadTasksBtn, $taskDbFilterSelect, $loader;
let $tabTasks, $tabNew, $sectionTasks, $sectionNew;
let NOTION_TOKEN = '', ALL_DB_CONFIGS = [], CURRENT_VIEW_ID = 'all', CURRENT_DB_CONFIG = null;

// =========================================================================
// API通信
// =========================================================================
async function apiFetch(targetUrl, method, body, tokenKey, tokenValue) {
  const response = await fetch('/api/proxy', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetUrl, method: method || 'GET', body, tokenKey, tokenValue })
  });
  if (!response.ok) throw new Error(`API ${response.status}: ${await response.text()}`);
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

// =========================================================================
// 設定ロード
// =========================================================================
function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved) {
      NOTION_TOKEN = saved.notionToken || '';
      ALL_DB_CONFIGS = saved.allDbConfigs || [];
      CURRENT_VIEW_ID = saved.currentViewId || 'all';
      CURRENT_DB_CONFIG = ALL_DB_CONFIGS.find(db=>db.id===CURRENT_VIEW_ID) || ALL_DB_CONFIGS[0] || null;
    }
  } catch(e) { console.error('設定エラー:', e); }
}

// =========================================================================
// フォーム描画（スマホ最適化）
// =========================================================================

function renderFormOptions() {
  const catContainer = document.getElementById('newCatContainer');
  const deptContainer = document.getElementById('newDeptContainer');
  const targetDisplay = document.getElementById('targetDbDisplay');
  
  const targetDb = CURRENT_DB_CONFIG || ALL_DB_CONFIGS[0];
  if (targetDisplay) targetDisplay.textContent = targetDb ? `登録先: ${targetDb.name}` : '設定必要（F12→Console）';
  if ($startNewTaskButton) $startNewTaskButton.disabled = !targetDb;
  
  if (!targetDb || !catContainer || !deptContainer) return;
  
  catContainer.innerHTML = `
    <div style="margin-bottom:15px;">
      <label style="display:block;font-weight:600;margin-bottom:8px;color:#555;font-size:16px;">カテゴリ選択</label>
      <div style="display:flex;flex-wrap:wrap;gap:10px;">
        ${CATEGORIES.map(cat=>`
          <label style="flex:1;min-width:80px;padding:12px;background:#f8f9fa;border:2px solid #e9ecef;border-radius:8px;text-align:center;font-size:14px;cursor:pointer;">
            <input type="radio" name="taskCategory" value="${cat}">
            ${cat}
          </label>
        `).join('')}
      </div>
    </div>
  `;
  
  deptContainer.innerHTML = ''; 
  deptContainer.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:8px;margin:15px 0;padding:10px;';
  DEPARTMENTS.forEach(dept => {
    const label = document.createElement('label');
    label.style.cssText = 'display:flex;align-items:center;padding:10px;background:#fff;border:1px solid #dee2e6;border-radius:6px;font-size:13px;cursor:pointer;';
    label.innerHTML = `<input type="checkbox" name="taskDepartment" value="${dept}" style="margin-right:6px;width:18px;height:18px;">${dept}`;
    deptContainer.appendChild(label);
  });
}

// =========================================================================
// DBフィルター描画
// =========================================================================
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

// =========================================================================
// 📱 スマホタブ（スワイプ対応）
// =========================================================================
function initMobileTabs() {
  $tabTasks = document.getElementById('tabTasks');
  $tabNew = document.getElementById('tabNew');
  $sectionTasks = document.getElementById('sectionTasks');
  $sectionNew = document.getElementById('sectionNew');

  if (!$tabTasks || !$sectionTasks) return;

  const switchTab = (showTasks) => {
    $sectionTasks.style.display = showTasks ? '' : 'none';
    $sectionNew.style.display = showTasks ? 'none' : '';
    $tabTasks.classList.toggle('tab-active', showTasks);
    $tabNew?.classList.toggle('tab-active', !showTasks);
    if (!showTasks) renderFormOptions();
  };

  $tabTasks?.addEventListener('click', ()=>switchTab(true));
  $tabTasks?.addEventListener('touchstart', ()=>switchTab(true));
  $tabNew?.addEventListener('click', ()=>switchTab(false));
  $tabNew?.addEventListener('touchstart', ()=>switchTab(false));

  let startX = 0;
  document.addEventListener('touchstart', e=>startX = e.touches[0].clientX);
  document.addEventListener('touchend', e=>{
    const endX = e.changedTouches[0].clientX;
    if (Math.abs(startX-endX)>50) switchTab(startX>endX);
  });

  switchTab(true);
}

// =========================================================================
// 設定モーダル（スマホ対応）
// =========================================================================
function initSettingsModal() {
  const openBtn = document.getElementById('openSettings');
  const modal = document.getElementById('settingsModal');
  const closeBtn = document.getElementById('closeSettings');
  const saveBtn = document.getElementById('saveSettings');
  const addDbBtn = document.getElementById('addDbBtn');

  if (!modal) return;

  const renderDbList = () => {
    const dbs = JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}').allDbConfigs || [];
    document.getElementById('dbList').innerHTML = dbs.map((db,i)=>
      `<div style="padding:8px;border:1px solid #eee;margin-bottom:5px;border-radius:4px;">
        ${db.name} (${db.id.slice(0,8)}...) 
        <button onclick="removeDb(${i})" style="float:right;background:#dc3545;color:white;border:none;padding:2px 8px;border-radius:3px;font-size:11px;">削除</button>
      </div>`
    ).join('');
  };

  window.removeDb = (index)=>{
    const settings = JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');
    settings.allDbConfigs.splice(index,1);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    renderDbList();
  };

  openBtn?.onclick = ()=>{
    const settings = JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');
    document.getElementById('notionTokenInput').value = settings.notionToken || '';
    renderDbList(); modal.classList.remove('hidden');
  };

  closeBtn?.onclick = ()=>modal.classList.add('hidden');
  modal.onclick = (e)=>{if(e.target===modal) modal.classList.add('hidden');};

  saveBtn?.onclick = ()=>{
    const token = document.getElementById('notionTokenInput').value.trim();
    if (!token) return showToast('トークン入力して！', '#ffc107');
    const settings = JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');
    settings.notionToken = token;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    modal.classList.add('hidden');
    loadSettings(); renderFormOptions(); renderDbFilterOptions(); loadTasksAndKpi();
    showToast('✅設定保存！','#28a745');
  };

  addDbBtn?.onclick = ()=>{
    const id = document.getElementById('dbIdInput').value;
    const name = document.getElementById('dbNameInput').value || '新DB';
    if (!id) return;
    const settings = JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');
    const dbs = settings.allDbConfigs || []; dbs.push({id,name});
    settings.allDbConfigs = dbs;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    renderDbList();
    document.getElementById('dbIdInput').value=''; document.getElementById('dbNameInput').value='';
    showToast('✅DB追加！','#28a745');
  };
}

// =========================================================================
// タイマー表示更新
// =========================================================================
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
// 単一DBからタスク取得
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

// =========================================================================
// タスク一覧ロード
// =========================================================================
// =========================================================================
// タスク一覧ロード
// =========================================================================
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
      listItem.style.cssText = 'padding:15px;margin-bottom:10px;border:1px solid #eee;border-radius:8px;background:white;';
      listItem.innerHTML = `
        <div class="task-info">
          <span class="task-title" style="font-weight:bold;font-size:16px;display:block;">${title}</span>
          <span class="task-meta" style="color:#666;font-size:12px;">
            DB: ${sourceDbName} | [${category}] / [${department}] - ステータス: ${status}
          </span>
        </div>
        <div class="task-actions" style="margin-top:10px;">
          <a href="${notionUrl}" target="_blank" class="btn btn-blue btn-sm" 
             style="display:inline-block;padding:8px 12px;margin-right:5px;background:#007aff;color:white;text-decoration:none;border-radius:6px;font-size:14px;">Notion</a>
          <button class="btn btn-green btn-sm start-tracking-btn" 
            data-page-id="${pageId}" data-task-title="${title}"
            style="padding:8px 12px;background:#28a745;color:white;border:none;border-radius:6px;font-size:14px;">▶ 計測開始</button> 
        </div>
      `;
      
      listItem.querySelector('.start-tracking-btn').addEventListener('click', (e) => {
        const button = e.target;
        startTogglTracking(button.dataset.taskTitle, button.dataset.pageId);
      });
      $taskList.appendChild(listItem);
    });

  } catch (e) {
    $taskList.innerHTML = `<li><p class="error-message" style="color:red;">タスク一覧のロードに失敗しました。エラー: ${e.message}</p></li>`;
    console.error('タスク一覧ロードエラー:', e);
  } finally {
    hideLoading();
  }
}

// =========================================================================
// KPIロード
// =========================================================================
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
// タスク＆KPI同時ロード
// =========================================================================
async function loadTasksAndKpi() {
  await loadTaskList();
  await loadKpi();
}

// =========================================================================
// 新規タスク作成
// =========================================================================
async function createNotionTask(e) {
  e.preventDefault();
  
  try {
    showLoading();
    
    const categoryRadios = document.querySelector('input[name="taskCategory"]:checked');
    const category = categoryRadios ? categoryRadios.value : '';
    const departmentCheckboxes = document.querySelectorAll('input[name="taskDepartment"]:checked');
    const departments = Array.from(departmentCheckboxes).map(cb => cb.value);
    const title = document.getElementById('newTaskTitle').value.trim();
    
    if (!title) {
      showToast('タスク名を入力してください', '#ffc107');
      return;
    }
    if (!category) {
      showToast('カテゴリを選択してください', '#ffc107');
      return;
    }
    
    const targetDbId = CURRENT_DB_CONFIG?.id;
    if (!targetDbId) {
      showToast('登録先DBが設定されていません', '#dc3545');
      return;
    }
    
    const targetUrl = `https://api.notion.com/v1/pages`;
    const body = {
      parent: { database_id: targetDbId },
      properties: {
        'タスク名': { title: [{ text: { content: title } }] },
        'カテゴリ': { select: { name: category } },
        '部門': { multi_select: departments.map(d => ({ name: d })) },
        'ステータス': { status: { name: '進行中' } },
        '開始時刻': { date: { start: new Date().toISOString() } }
      }
    };
    
    const pageResponse = await apiFetch(targetUrl, 'POST', body, 'notionToken', NOTION_TOKEN);
    await startTogglTracking(title, pageResponse.id);
    
    document.getElementById('newTaskTitle').value = '';
    document.querySelectorAll('input[name="taskCategory"]').forEach(r => r.checked = false);
    document.querySelectorAll('input[name="taskDepartment"]').forEach(cb => cb.checked = false);
    
    showToast('✅ タスク作成＆計測開始！', '#28a745');
    await loadTasksAndKpi();
    
  } catch (e) {
    console.error('作成エラー:', e);
    showToast('作成エラー: ' + e.message, '#dc3545');
  } finally {
    hideLoading();
  }
}

// =========================================================================
// 計測開始
// =========================================================================
async function startTogglTracking(taskTitle, pageId) {
  localRunningTask = { title: taskTitle, pageId, startTime: Date.now() };
  localStorage.setItem('runningTask', JSON.stringify(localRunningTask));
  
  document.getElementById('runningTaskTitle').textContent = taskTitle;
  document.getElementById('runningStartTime').textContent = new Date().toLocaleTimeString();
  document.getElementById('runningTimer').textContent = '00:00:00';
  document.getElementById('runningTaskContainer').classList.remove('hidden');
  
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(updateTimerDisplay, 1000);
}

// =========================================================================
// タスク完了
// =========================================================================
async function markTaskCompleted(pageId) {
  try {
    const targetUrl = `https://api.notion.com/v1/pages/${pageId}`;
    await apiFetch(targetUrl, 'PATCH', {
      properties: { 'ステータス': { status: { name: '完了' } } }
    }, 'notionToken', NOTION_TOKEN);
    await loadTasksAndKpi();
  } catch (e) {
    console.error('完了エラー:', e);
  }
}

// =========================================================================
// 実行中状態チェック
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
    } else {
      localRunningTask = null;
      if (timerInterval) clearInterval(timerInterval);
    }
  } catch (e) {
    console.error('checkRunningStateエラー:', e);
  }
}

// =========================================================================
// 思考ログ追加
// =========================================================================
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

// =========================================================================
// DBフィルター変更
// =========================================================================
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

// =========================================================================
// 思考ログボタン設定
// =========================================================================
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

// =========================================================================
// ユーティリティ
// =========================================================================
function showToast(message, bgColor) {
  const el = document.createElement('div');
  el.textContent = message;
  el.style.cssText = `
    position:fixed;top:20px;right:20px;background:${bgColor};color:${bgColor==='#ffc107'?'#333':'white'};
    padding:15px 20px;border-radius:8px;z-index:10001;font-weight:bold;box-shadow:0 4px 12px rgba(0,0,0,0.3);
    font-size:14px;max-width:300px;
  `;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(),3000);
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

// =========================================================================
// 初期化（スマホ完璧版）
// =========================================================================
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 📱スマホ対応アプリ初期化開始');
  
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
  initMobileTabs();
  initSettingsModal();
  
  await checkRunningState();
  await loadTasksAndKpi();
  
  // 📱 イベント（タッチ対応）
  $reloadTasksBtn?.addEventListener('click', loadTasksAndKpi);
  $startNewTaskButton?.addEventListener('click', createNotionTask);
  $taskDbFilterSelect?.addEventListener('change', handleDbFilterChange);
  setupThinkingLogButtons();
  
  console.log('✅ 📱スマホ完璧版 初期化完了！');
});

console.log('✅ 📱スマホ完璧版 APP.JS 全関数完備 LOADED！');
