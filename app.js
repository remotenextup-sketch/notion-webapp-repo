console.log('*** APP.JS (重複整理版) START ***');

const STORAGE_KEY = 'taskTrackerSettings';
let localRunningTask = null;
let timerInterval = null;
let CATEGORIES = ['思考', '作業', '教育'];
let DEPARTMENTS = ['CS','デザイン','人事','広告','採用','改善','物流','秘書','経営計画','経理','開発','AI','楽天','Amazon','Yahoo'];

let $taskList, $runningTaskContainer, $startNewTaskButton, $reloadTasksBtn, $taskDbFilterSelect, $loader;
let $tabTasks, $tabNew, $sectionTasks, $sectionNew;

let NOTION_TOKEN = '';
let ALL_DB_CONFIGS = [];
let CURRENT_VIEW_ID = 'all';
let CURRENT_DB_CONFIG = null;

// ================================================================
// API通信
// ================================================================
async function apiFetch(targetUrl, method, body, tokenKey, tokenValue) {
  const response = await fetch('/api/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetUrl, method: method || 'GET', body, tokenKey, tokenValue })
  });
  if (!response.ok) throw new Error(`API ${response.status}: ${await response.text()}`);
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

// ================================================================
// タブ切り替え
// ================================================================
function initTabs() {
  $tabTasks = document.getElementById('tabTasks');
  $tabNew = document.getElementById('tabNew');
  $sectionTasks = document.getElementById('sectionTasks');
  $sectionNew = document.getElementById('sectionNew');
  if (!$tabTasks || !$tabNew) return;

  const switchTab = (showTasks) => {
    $sectionTasks.style.display = showTasks ? '' : 'none';
    $sectionNew.style.display = showTasks ? 'none' : '';
    $tabTasks.classList.toggle('tab-active', showTasks);
    $tabNew.classList.toggle('tab-active', !showTasks);
    if (!showTasks) renderFormOptions();
  };

  switchTab(true); // 初期：タスクタブ
  $tabTasks.addEventListener('click', () => switchTab(true));
  $tabNew.addEventListener('click', () => switchTab(false));
}

// ================================================================
// 設定ロード
// ================================================================
function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved) {
      NOTION_TOKEN = saved.notionToken || '';
      ALL_DB_CONFIGS = saved.allDbConfigs || [];
      CURRENT_VIEW_ID = saved.currentViewId || 'all';
      CURRENT_DB_CONFIG = ALL_DB_CONFIGS.find(db=>db.id===CURRENT_VIEW_ID) || ALL_DB_CONFIGS[0] || null;
    }
  } catch(e) {
    console.error('設定読み込みエラー:', e);
  }
}

// ================================================================
// 設定モーダル関連
// ================================================================
function initSettingsModal() {
  const openBtn = document.getElementById('openSettings');
  const modal = document.getElementById('settingsModal');
  const closeBtn = document.getElementById('closeSettings');
  const saveBtn = document.getElementById('saveSettings');
  const addDbBtn = document.getElementById('addDbBtn');

  if (!modal) return;

  const renderDbList = () => {
    const dbs = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}').allDbConfigs || [];
    document.getElementById('dbList').innerHTML = dbs.map((db,i)=>
      `<div style="padding:8px;border:1px solid #eee;margin-bottom:5px;border-radius:4px;">
        ${db.name} (${db.id.slice(0,8)}...)
        <button onclick="removeDb(${i})" style="float:right;background:#dc3545;color:white;border:none;padding:2px 8px;border-radius:3px;font-size:11px;">削除</button>
      </div>`
    ).join('');
  };

  window.removeDb = (index)=>{
    const settings = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    settings.allDbConfigs.splice(index,1);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    renderDbList();
  };

  if (openBtn) openBtn.onclick = ()=>{
    const settings = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    document.getElementById('notionTokenInput').value = settings.notionToken || '';
    renderDbList();
    modal.classList.remove('hidden');
  };

  if (closeBtn) closeBtn.onclick = ()=> modal.classList.add('hidden');
  modal.onclick = (e)=>{ if(e.target===modal) modal.classList.add('hidden'); };

  if (saveBtn) saveBtn.onclick = ()=>{
    const token = document.getElementById('notionTokenInput').value.trim();
    if (!token) return showToast('トークンを入力してください', '#ffc107');
    const settings = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    settings.notionToken = token;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    modal.classList.add('hidden');
    loadSettings();
    renderFormOptions();
    renderDbFilterOptions();
    loadTasksAndKpi();
    showToast('✅ 設定保存完了！','#28a745');
  };

  if (addDbBtn) addDbBtn.onclick = ()=>{
    const id = document.getElementById('dbIdInput').value;
    const name = document.getElementById('dbNameInput').value || '新DB';
    if (!id) return;
    const settings = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const dbs = settings.allDbConfigs || [];
    dbs.push({id,name});
    settings.allDbConfigs = dbs;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    renderDbList();
    document.getElementById('dbIdInput').value='';
    document.getElementById('dbNameInput').value='';
    showToast('✅ DB追加！','#28a745');
  };
}

// ================================================================
// 初期化
// ================================================================
document.addEventListener('DOMContentLoaded', async ()=>{
  console.log('🚀 アプリ初期化開始');
  $taskList = document.getElementById('taskList');
  $runningTaskContainer = document.getElementById('runningTaskContainer');
  $startNewTaskButton = document.getElementById('startNewTaskButton');
  $reloadTasksBtn = document.getElementById('reloadTasks');
  $taskDbFilterSelect = document.getElementById('taskDbFilter');
  $loader = document.getElementById('loader');

  loadSettings();
  renderFormOptions();
  renderDbFilterOptions();
  initTabs();
  initSettingsModal();

  await checkRunningState();
  await loadTasksAndKpi();

  if ($reloadTasksBtn) $reloadTasksBtn.addEventListener('click', loadTasksAndKpi);
  if ($startNewTaskButton) $startNewTaskButton.addEventListener('click', createNotionTask);
  if ($taskDbFilterSelect) $taskDbFilterSelect.addEventListener('change', handleDbFilterChange);
  setupThinkingLogButtons();

  console.log('✅ 初期化完了（重複整理版）');
});
