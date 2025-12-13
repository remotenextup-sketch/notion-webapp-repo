const settings = {
  notionToken: '',
  notionUserId: '',
  togglToken: '',
  togglWid: '',
  notionDatabases: []
};

let dom = {};

function $(id) {
  return document.getElementById(id);
}

// =====================
// Settings load/save
// =====================
function loadSettings() {
  settings.notionToken = localStorage.getItem('notionToken') || '';
  settings.notionUserId = localStorage.getItem('notionUserId') || '';
  settings.togglToken = localStorage.getItem('togglToken') || '';
  settings.togglWid = localStorage.getItem('togglWid') || '';
  settings.notionDatabases = JSON.parse(localStorage.getItem('notionDatabases') || '[]');
}

function saveSettings() {
  localStorage.setItem('notionToken', settings.notionToken);
  localStorage.setItem('notionUserId', settings.notionUserId);
  localStorage.setItem('togglToken', settings.togglToken);
  localStorage.setItem('togglWid', settings.togglWid);
  localStorage.setItem('notionDatabases', JSON.stringify(settings.notionDatabases));
}

// =====================
// DB UI
// =====================
function renderDbConfigs() {
  dom.dbConfigContainer.innerHTML = '';

  settings.notionDatabases.forEach((db, i) => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '8px';
    row.innerHTML = `
      <input placeholder="DB名" value="${db.name || ''}">
      <input placeholder="Database ID" value="${db.id || ''}">
    `;
    dom.dbConfigContainer.appendChild(row);
  });
}

function addDbConfig() {
  settings.notionDatabases.push({ name:'', id:'' });
  renderDbConfigs();
}

// =====================
// Init
// =====================
function init() {
  dom = {
    mainView: $('mainView'),
    settingsView: $('settingsView'),
    toggleSettings: $('toggleSettings'),
    cancelConfig: $('cancelConfig'),
    saveConfig: $('saveConfig'),
    addDbConfig: $('addDbConfig'),

    confNotionToken: $('confNotionToken'),
    confNotionUserId: $('confNotionUserId'),
    confTogglToken: $('confTogglToken'),
    confTogglWid: $('confTogglWid'),
    dbConfigContainer: $('dbConfigContainer')
  };

  loadSettings();

  // 値反映
  dom.confNotionToken.value = settings.notionToken;
  dom.confNotionUserId.value = settings.notionUserId;
  dom.confTogglToken.value = settings.togglToken;
  dom.confTogglWid.value = settings.togglWid;

  renderDbConfigs();

  // === イベント（nullチェック付き）
  dom.toggleSettings && (dom.toggleSettings.onclick = () => {
    dom.settingsView.classList.remove('hidden');
    dom.mainView.classList.add('hidden');
  });

  dom.cancelConfig && (dom.cancelConfig.onclick = () => {
    dom.settingsView.classList.add('hidden');
    dom.mainView.classList.remove('hidden');
  });

  dom.addDbConfig && (dom.addDbConfig.onclick = addDbConfig);

  dom.saveConfig && (dom.saveConfig.onclick = () => {
    settings.notionToken = dom.confNotionToken.value.trim();
    settings.notionUserId = dom.confNotionUserId.value.trim();
    settings.togglToken = dom.confTogglToken.value.trim();
    settings.togglWid = dom.confTogglWid.value.trim();
    saveSettings();
    alert('保存しました');
  });

  console.log('✅ init 完了', dom);
}

init();
