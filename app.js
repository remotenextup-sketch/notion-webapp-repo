// =====================
// 定数
// =====================
const PROXY_URL = 'https://company-notion-toggl-api.vercel.app/api/proxy';
const TOGGL_V9 = 'https://api.track.toggl.com/api/v9';

// =====================
// 状態
// =====================
const state = {
  notionToken: '',
  notionUserId: '',
  togglToken: '',
  togglWid: '',
  databases: [],
  running: null,
  startTime: null,
  timer: null
};

// =====================
// DOM
// =====================
const dom = {};
[
  'openSettings','mainView','settingsView','closeSettings','saveSettings',
  'notionToken','notionUserId','togglToken','togglWid',
  'dbConfigs','addDb','dbSelect','reloadBtn',
  'taskList','running','runningTitle','timer',
  'thinkingLog','stopBtn','completeBtn',
  'tabExisting','tabNew','existingTab','newTab',
  'newTitle','createBtn'
].forEach(id => dom[id] = document.getElementById(id));

// =====================
// Utils
// =====================
const fmt = ms => {
  const s = Math.floor(ms / 1000);
  const h = String(Math.floor(s / 3600)).padStart(2,'0');
  const m = String(Math.floor((s%3600)/60)).padStart(2,'0');
  const sec = String(s%60).padStart(2,'0');
  return `${h}:${m}:${sec}`;
};

// =====================
// Proxy
// =====================
async function api(targetUrl, method='GET', tokenKey, tokenValue, body=null) {
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ targetUrl, method, tokenKey, tokenValue, body })
  });
  if (!res.ok) throw new Error(await res.text());
  return res.status === 204 ? null : res.json();
}

// =====================
// Settings
// =====================
function loadSettings() {
  Object.assign(state, JSON.parse(localStorage.getItem('settings')||'{}'));
}
function saveSettings() {
  localStorage.setItem('settings', JSON.stringify(state));
}

// =====================
// UI
// =====================
function renderDbConfigs() {
  dom.dbConfigs.innerHTML = '';
  state.databases.forEach((d,i)=>{
    const row = document.createElement('div');
    row.innerHTML = `
      <input class="input" placeholder="表示名" value="${d.name}">
      <input class="input" placeholder="DB ID" value="${d.id}">
    `;
    row.querySelectorAll('input')[0].oninput=e=>d.name=e.target.value;
    row.querySelectorAll('input')[1].oninput=e=>d.id=e.target.value;
    dom.dbConfigs.appendChild(row);
  });
}

function renderDbSelect() {
  dom.dbSelect.innerHTML='';
  state.databases.forEach(d=>{
    const o=document.createElement('option');
    o.value=d.id; o.textContent=d.name;
    dom.dbSelect.appendChild(o);
  });
}

// =====================
// Notion
// =====================
async function loadTasks() {
  const dbId = dom.dbSelect.value;
  if (!dbId) return;

  const db = await api(
    `https://api.notion.com/v1/databases/${dbId}`,
    'GET','notionToken',state.notionToken
  );

  const statusProp = Object.entries(db.properties)
    .find(([,p])=>p.type==='status'||p.type==='select');

  const [statusName,statusDef]=statusProp;
  const type=statusDef.type;

  const res = await api(
    `https://api.notion.com/v1/databases/${dbId}/query`,
    'POST','notionToken',state.notionToken,
    {
      filter:{
        or:['未着手','進行中'].map(v=>({
          property:statusName,
          [type]:{equals:v}
        }))
      }
    }
  );

  dom.taskList.innerHTML='';
  res.results.forEach(p=>{
    const title = Object.values(p.properties)
      .find(x=>x.type==='title')
      ?.title.map(t=>t.plain_text).join('') || 'Untitled';

    const row=document.createElement('div');
    row.className='task-row';
    row.innerHTML=`<span>${title}</span>`;
    const b=document.createElement('button');
    b.textContent='▶ 開始';
    b.className='btn green';
    b.onclick=()=>startTask(title);
    row.appendChild(b);
    dom.taskList.appendChild(row);
  });
}

// =====================
// Toggl
// =====================
async function startTask(title) {
  const res = await api(
    `${TOGGL_V9}/time_entries`,
    'POST','togglApiToken',state.togglToken,
    {
      workspace_id:Number(state.togglWid),
      description:title,
      start:new Date().toISOString(),
      duration:-1,
      created_with:'Notion Timer'
    }
  );

  state.running = res.id;
  state.startTime = Date.now();
  dom.runningTitle.textContent = title;
  dom.running.classList.remove('hidden');

  state.timer = setInterval(()=>{
    dom.timer.textContent = fmt(Date.now()-state.startTime);
  },1000);

  saveSettings();
}

async function stopTask(complete=false) {
  await api(
    `${TOGGL_V9}/workspaces/${state.togglWid}/time_entries/${state.running}/stop`,
    'PATCH','togglApiToken',state.togglToken
  );

  clearInterval(state.timer);
  dom.running.classList.add('hidden');

  state.running=null;
  state.startTime=null;
  saveSettings();
}

// =====================
// Events
// =====================
dom.openSettings.onclick=()=>{
  dom.settingsView.classList.remove('hidden');
  dom.mainView.classList.add('hidden');
};
dom.closeSettings.onclick=()=>{
  dom.settingsView.classList.add('hidden');
  dom.mainView.classList.remove('hidden');
};
dom.addDb.onclick=()=>{
  state.databases.push({name:'',id:''});
  renderDbConfigs();
};
dom.saveSettings.onclick=()=>{
  state.notionToken=dom.notionToken.value.trim();
  state.notionUserId=dom.notionUserId.value.trim();
  state.togglToken=dom.togglToken.value.trim();
  state.togglWid=dom.togglWid.value.trim();
  saveSettings();
  renderDbSelect();
};
dom.reloadBtn.onclick=loadTasks;
dom.stopBtn.onclick=()=>stopTask(false);
dom.completeBtn.onclick=()=>stopTask(true);

dom.tabExisting.onclick=()=>{
  dom.tabExisting.classList.add('active');
  dom.tabNew.classList.remove('active');
  dom.existingTab.classList.remove('hidden');
  dom.newTab.classList.add('hidden');
};
dom.tabNew.onclick=()=>{
  dom.tabNew.classList.add('active');
  dom.tabExisting.classList.remove('active');
  dom.newTab.classList.remove('hidden');
  dom.existingTab.classList.add('hidden');
};
dom.createBtn.onclick=async()=>{
  const t=dom.newTitle.value.trim();
  if(!t)return;
  dom.newTitle.value='';
  startTask(t);
};

// =====================
// Init
// =====================
loadSettings();
renderDbConfigs();
renderDbSelect();
if(state.running){
  dom.running.classList.remove('hidden');
}
