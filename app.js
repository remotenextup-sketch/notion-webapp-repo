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
// API通信 (変更なし)
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
// 設定ロード (変更なし)
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
// フォーム描画（UI改善版）
// =========================================================================
function renderFormOptions() {
  const catContainer = document.getElementById('newCatContainer');
  const deptContainer = document.getElementById('newDeptContainer');
  const targetDisplay = document.getElementById('targetDbDisplay');
  
  const targetDb = CURRENT_DB_CONFIG || ALL_DB_CONFIGS[0];
  if (targetDisplay) targetDisplay.textContent = targetDb ? `登録先: ${targetDb.name} (ID: ${targetDb.id.slice(0,8)}...)` : '設定必要（⚙️ボタンより設定）';
  if ($startNewTaskButton) $startNewTaskButton.disabled = !targetDb;
  
  if (!targetDb || !catContainer || !deptContainer) return;
  
  // カテゴリ選択（カスタムラジオボタン）
  catContainer.innerHTML = `
    <label>カテゴリ選択</label>
    <div class="select-group">
      ${CATEGORIES.map(cat=>`
        <label>
          <input type="radio" name="taskCategory" value="${cat}">
          <span>${cat}</span>
        </label>
      `).join('')}
    </div>
  `;
  
  // 部門選択（カスタムチェックボックス）
  deptContainer.innerHTML = ''; 
  deptContainer.className = 'select-group'; // index.htmlのCSSクラスを使用
  DEPARTMENTS.forEach(dept => {
    const label = document.createElement('label');
    label.innerHTML = `<input type="checkbox" name="taskDepartment" value="${dept}"><span>${dept}</span>`;
    deptContainer.appendChild(label);
  });
}

// =========================================================================
// DBフィルター描画 (変更なし)
// =========================================================================
function renderDbFilterOptions() {
  const select = document.getElementById('taskDbFilter');
  if (!select) return;
  select.innerHTML = '<option value="all">全てのタスク (複数DB)</option>';
  ALL_DB_CONFIGS.forEach(db => {
    const opt = document.createElement('option');
    opt.value = db.id;
    opt.textContent = `${db.name} (${db.id.slice(0,8)}...)`;
    select.appendChild(opt);
  });
  select.value = CURRENT_VIEW_ID;
}

// =========================================================================
// 📱 スマホタブ（スワイプ対応） (変更なし)
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
// 設定モーダル（UI改善対応）
// =========================================================================
function initSettingsModal() {
  console.log('🔧 initSettingsModal実行');
  
  const openBtn = document.getElementById('openSettings');
  const modal = document.getElementById('settingsModal');
  
  if (!openBtn || !modal) {
    console.error('❌ 設定ボタンまたはモーダルが見つかりません');
    return;
  }

  // 独自関数: DBリスト要素のHTML生成
  const getDbListHtml = (dbs) => dbs.map((db, i) => 
    `<div style="padding:10px;border:1px solid var(--border-color);margin-bottom:8px;border-radius:8px; display:flex; justify-content:space-between; align-items:center; background:#fcfcfc;">
      <span style="font-size:14px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex-grow:1;">${db.name} (${db.id.slice(0,8)}...)</span>
      <button onclick="removeDb(${i})" class="btn btn-danger" style="margin-left:10px; padding:4px 10px; font-size:12px; height:auto;">削除</button>
    </div>`
  ).join('');

  // 独自関数: DB削除
  window.removeDb = (index) => {
    const settings = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (settings.allDbConfigs) {
      settings.allDbConfigs.splice(index, 1);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      window.openSettingsHandler(); // 再描画
    }
  };

  // 設定モーダルを開く
  window.openSettingsHandler = () => {
    const settings = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const tokenInput = document.getElementById('notionTokenInput');
    if (tokenInput) tokenInput.value = settings.notionToken || '';
    
    const dbs = settings.allDbConfigs || [];
    const dbListEl = document.getElementById('dbList');
    if (dbListEl) dbListEl.innerHTML = getDbListHtml(dbs);
    
    modal.classList.remove('hidden');
  };

  // イベントリスナーの設定
  openBtn.onclick = window.openSettingsHandler;
  openBtn.ontouchstart = window.openSettingsHandler;
  document.getElementById('closeSettings').onclick = () => modal.classList.add('hidden');
  modal.onclick = (e) => { if (e.target === modal) modal.classList.add('hidden'); };

  // 保存ボタン
  document.getElementById('saveSettings').onclick = () => {
    const token = document.getElementById('notionTokenInput')?.value.trim();
    if (!token) return showToast('トークン入力して！', '#ffc107');
    
    const settings = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    settings.notionToken = token;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    
    modal.classList.add('hidden');
    loadSettings();
    renderFormOptions();
    renderDbFilterOptions();
    loadTasksAndKpi();
    showToast('✅設定保存完了！', '#34c759');
  };

  // DB追加ボタン
  document.getElementById('addDbBtn').onclick = () => {
    const idInput = document.getElementById('dbIdInput');
    const nameInput = document.getElementById('dbNameInput');
    const id = idInput?.value.trim();
    const name = nameInput?.value.trim() || '新DB';
    if (!id) return showToast('DB IDを入力！', '#ffc107');
    
    const settings = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const dbs = settings.allDbConfigs || [];
    dbs.push({ id, name });
    settings.allDbConfigs = dbs;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    
    const dbListEl = document.getElementById('dbList');
    if (dbListEl) dbListEl.innerHTML = getDbListHtml(dbs);
    
    idInput.value = '';
    nameInput.value = '';
    showToast('✅DB追加完了！', '#34c759');
  };

  console.log('✅ 設定モーダル完全初期化完了');
}


// =========================================================================
// タイマー表示更新 (変更なし)
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
// 単一DBからタスク取得 (変更なし)
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
// タスク一覧ロード（UI改善対応）
// =========================================================================
async function loadTaskList() { 
  console.log(`タスク一覧をロード中 (ビュー: ${CURRENT_VIEW_ID})...`);
  
  if (!$taskList) return;
  
  if (!NOTION_TOKEN || ALL_DB_CONFIGS.length === 0) {
    $taskList.innerHTML = '<li class="task-item" style="color:var(--warning-color); text-align:center;">設定必要（⚙️ボタンより設定）</li>';
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
    $taskList.innerHTML = '<li class="task-item"><p style="text-align:center;">表示するDBが見つかりません。</p></li>';
    return;
  }

  try {
    showLoading();
    const taskPromises = dbConfigsToLoad.map(dbConfig => loadTasksFromSingleDb(dbConfig));
    const results = await Promise.all(taskPromises);
    const allTasks = results.flat();

    $taskList.innerHTML = '';
    if (allTasks.length === 0) {
      $taskList.innerHTML = '<li class="task-item"><p style="text-align:center;">現在のタスクはありません。</p></li>';
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
      listItem.className = 'task-item'; // CSSクラスを適用

      // タスクアイテムのHTMLを新しいデザインに合わせて更新
      listItem.innerHTML = `
        <div class="task-info">
          <span class="task-title">${title}</span>
          <span class="task-meta">
            DB: ${sourceDbName} | [${category}] / [${department}] - ステータス: ${status}
          </span>
        </div>
        <div class="task-actions">
          <a href="${notionUrl}" target="_blank" class="btn btn-secondary">🔗 Notionで開く</a>
          <button class="btn btn-success start-tracking-btn" 
            data-page-id="${pageId}" data-task-title="${title}">▶ 計測開始</button> 
        </div>
      `;
      
      listItem.querySelector('.start-tracking-btn').addEventListener('click', (e) => {
        const button = e.target;
        startTogglTracking(button.dataset.taskTitle, button.dataset.pageId);
      });
      $taskList.appendChild(listItem);
    });

  } catch (e) {
    $taskList.innerHTML = `<li class="task-item"><p class="error-message" style="color:var(--danger-color); text-align:center;">タスク一覧のロードに失敗しました。エラー: ${e.message}</p></li>`;
    console.error('タスク一覧ロードエラー:', e);
  } finally {
    hideLoading();
  }
}

// =========================================================================
// KPIロード（UI改善対応）
// =========================================================================
async function loadKpi() {
  const weekEl = document.getElementById('kpiWeek');
  const monthEl = document.getElementById('kpiMonth');
  const catEl = document.getElementById('kpiCategoryContainer');
  
  // CURRENT_VIEW_ID === 'all' の場合は、KPIカード自体を非表示にする
  const kpiCard = document.querySelector('#sectionTasks .card:nth-child(2)');
  if (CURRENT_VIEW_ID === 'all' || !CURRENT_DB_CONFIG) {
    kpiCard?.classList.add('hidden');
    return;
  } else {
    kpiCard?.classList.remove('hidden');
  }
  
  try {
    // TODO: 実際にAPIからKPIデータを取得する処理を実装
    const kpiData = {
      totalWeekMins: 240, // ダミーデータ
      totalMonthMins: 1200, // ダミーデータ
      categoryWeekMins: { '開発': 120, 'デザイン': 80, 'ミーティング': 40 } // ダミーデータ
    };
    
    const formatMins = (mins) => {
      if (!mins || isNaN(mins)) return '0h 0m';
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return `${h}h ${m}m`;
    };
    
    weekEl.textContent = formatMins(kpiData.totalWeekMins);
    monthEl.textContent = formatMins(kpiData.totalMonthMins);

    let categoryListHtml = '<ul style="list-style:none; padding:0; margin:0; display:grid; grid-template-columns:1fr 1fr; gap:5px;">';
    Object.entries(kpiData.categoryWeekMins || {}).forEach(([category, mins]) => {
      categoryListHtml += `<li style="font-size:13px; padding:5px; background:#f5f5f7; border-radius:4px;">${category}: <span style="font-weight:600;">${formatMins(mins)}</span></li>`;
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
// タスク＆KPI同時ロード (変更なし)
// =========================================================================
async function loadTasksAndKpi() {
  await loadTaskList();
  await loadKpi();
}

// =========================================================================
// 新規タスク作成 (変更なし)
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
      showToast('登録先DBが設定されていません', '#ff3b30');
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
    
    showToast('✅ タスク作成＆計測開始！', '#34c759');
    await loadTasksAndKpi();
    
  } catch (e) {
    console.error('作成エラー:', e);
    showToast('作成エラー: ' + e.message, '#ff3b30');
  } finally {
    hideLoading();
  }
}

// =========================================================================
// 計測開始（UI改善対応）
// =========================================================================
async function startTogglTracking(taskTitle, pageId) {
  localRunningTask = { title: taskTitle, pageId, startTime: Date.now() };
  localStorage.setItem('runningTask', JSON.stringify(localRunningTask));
  
  document.getElementById('runningTaskTitle').textContent = taskTitle;
  // 開始時刻はスマホUIで非表示にしたためコメントアウト
  // document.getElementById('runningStartTime').textContent = new Date().toLocaleTimeString();
  document.getElementById('runningTimer').textContent = '00:00:00';
  $runningTaskContainer.classList.remove('hidden');
  
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(updateTimerDisplay, 1000);
}

// =========================================================================
// タスク完了 (変更なし)
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
// 実行中状態チェック（UI改善対応）
// =========================================================================
async function checkRunningState() {
  try {
    const stored = localStorage.getItem('runningTask');
    if (stored) {
      localRunningTask = JSON.parse(stored);
      const titleEl = document.getElementById('runningTaskTitle');
      // const timeEl = document.getElementById('runningStartTime'); // UIで非表示

      if (titleEl) titleEl.textContent = localRunningTask.title;
      // if (timeEl) timeEl.textContent = new Date(localRunningTask.startTime).toLocaleTimeString();
      
      if (timerInterval) clearInterval(timerInterval);
      timerInterval = setInterval(updateTimerDisplay, 1000);
      updateTimerDisplay();
      
      $runningTaskContainer.classList.remove('hidden');
    } else {
      localRunningTask = null;
      if (timerInterval) clearInterval(timerInterval);
      $runningTaskContainer.classList.add('hidden'); // 非実行時は必ず非表示
    }
  } catch (e) {
    console.error('checkRunningStateエラー:', e);
  }
}

// =========================================================================
// 思考ログ追加 (変更なし)
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
// DBフィルター変更 (変更なし)
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
// 思考ログボタン設定（UI改善対応）
// =========================================================================
function setupThinkingLogButtons() {
  const completeBtn = document.getElementById('completeRunningTask');
  const stopBtn = document.getElementById('stopRunningTask');
  
  // タスク完了ボタン
  if (completeBtn) {
    completeBtn.addEventListener('click', async () => {
      const input = document.getElementById('thinkingLogInput');
      const note = input?.value.trim();
      // ログフォーマットを改善: 日付と時刻を追加
      const logEntry = note ? `\n[${new Date().toLocaleString('ja-JP')}] 完了ログ: ${note}` : '';
      
      if (localRunningTask?.pageId && logEntry) {
        await appendThinkingLog(localRunningTask.pageId, logEntry);
      }
      if (localRunningTask?.pageId) {
        await markTaskCompleted(localRunningTask.pageId);
      }
      
      localRunningTask = null;
      localStorage.removeItem('runningTask');
      if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
      $runningTaskContainer.classList.add('hidden');
      if (input) input.value = '';
      
      showToast('✅ タスク完了！' + (logEntry ? '（ログ保存）' : ''), '#34c759');
      loadTasksAndKpi();
    });
  }
  
  // 計測停止ボタン
  if (stopBtn) {
    stopBtn.addEventListener('click', async () => {
      const input = document.getElementById('thinkingLogInput');
      const note = input?.value.trim();
      // ログフォーマットを改善
      const logEntry = note ? `\n[${new Date().toLocaleString('ja-JP')}] 停止ログ: ${note}` : '';
      
      if (localRunningTask?.pageId && logEntry) {
        await appendThinkingLog(localRunningTask.pageId, logEntry);
      }
      
      localRunningTask = null;
      localStorage.removeItem('runningTask');
      if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
      $runningTaskContainer.classList.add('hidden');
      if (input) input.value = '';
      
      showToast('⏹️ 計測停止' + (logEntry ? '（ログ保存）' : ''), '#ff9500');
    });
  }
}

// =========================================================================
// ユーティリティ（UI改善対応）
// =========================================================================
function showToast(message, bgColor) {
  const el = document.createElement('div');
  el.textContent = message;
  // UI改善に合わせてトーストのデザインを微調整
  el.style.cssText = `
    position:fixed;top:20px;right:20px;
    background:${bgColor};color:${bgColor==='#ffc107'?'#333':'white'};
    padding:15px 20px;border-radius:10px;z-index:10002;font-weight:600;
    box-shadow:0 4px 12px rgba(0,0,0,0.3);font-size:15px;max-width:80vw;
  `;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(),3000);
}

function showLoading() {
  // bodyのスタイル操作はやめて、ローディングスピナーに集中
  if ($loader) $loader.classList.remove('hidden');
}

function hideLoading() {
  if ($loader) $loader.classList.add('hidden');
}

// =========================================================================
// 初期化（UI改善対応）
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
