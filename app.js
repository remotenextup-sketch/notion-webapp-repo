const PROXY_URL = 'https://company-notion-toggl-api.vercel.app/api/proxy';
const TOGGL_V9 = 'https://api.track.toggl.com/api/v9';

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

const dom = {};
[
  'openSettings','mainView','settingsView','closeSettings','saveSettings',
  'notionToken','notionUserId','togglToken','togglWid',
  'dbConfigs','addDb','dbSelect','reloadBtn','taskList',
  'running','runningTitle','timer','thinkingLog',
  'stopBtn','completeBtn',
  'newTitle','newCategory','newDepartment','createBtn'
].forEach(id => dom[id] = document.getElementById(id));

/* ---------------- Utils ---------------- */
const log = (...a) => console.log('[APP]', ...a);
const fmt = ms => {
  const s = Math.floor(ms / 1000);
  const h = String(Math.floor(s / 3600)).padStart(2,'0');
  const m = String(Math.floor((s%3600)/60)).padStart(2,'0');
  const sec = String(s%60).padStart(2,'0');
  return `${h}:${m}:${sec}`;
};

/* ---------------- Proxy ---------------- */
async function api(targetUrl, method, tokenKey, tokenValue, body=null) {
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ targetUrl, method, tokenKey, tokenValue, body })
  });
  if (!res.ok) throw new Error(await res.text());
  return res.status === 204 ? null : res.json();
}

/* ---------------- Settings ---------------- */
function loadSettings() {
  Object.assign(state, JSON.parse(localStorage.getItem('settings') || '{}'));
  dom.notionToken.value = state.notionToken || '';
  dom.notionUserId.value = state.notionUserId || '';
  dom.togglToken.value = state.togglToken || '';
  dom.togglWid.value = state.togglWid || '';
}
function saveSettings() {
  localStorage.setItem('settings', JSON.stringify(state));
  log('設定保存', state);
}

/* ---------------- DB UI ---------------- */
function renderDbConfigs() {
  dom.dbConfigs.innerHTML = '';
  state.databases.forEach((d,i)=>{
    const row=document.createElement('div');
    row.innerHTML=`
      <input class="input" placeholder="表示名" value="${d.name}">
      <input class="input" placeholder="DB ID" value="${d.id}">
    `;
    row.children[0].oninput=e=>d.name=e.target.value;
    row.children[1].oninput=e=>d.id=e.target.value;
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

/* ---------------- Notion ---------------- */
async function loadTasks() {
  log('Notion読み込み開始');
  const dbId = dom.dbSelect.value;
  if (!dbId) return;

  const db = await api(
    `https://api.notion.com/v1/databases/${dbId}`,
    'GET','notionToken',state.notionToken
  );

  const statusProp = Object.entries(db.properties)
    .find(([,p])=>p.type==='status'||p.type==='select');

  if (!statusProp) {
    alert('ステータスプロパティが見つかりません');
    return;
  }

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

  log('Notion取得件数', res.results.length);
}

/* ---------------- Toggl ---------------- */
async function startTask(title) {
  const cat = dom.newCategory.value.trim();
  const dept = dom.newDepartment.value
    .split(',')
    .map(v=>v.trim())
    .filter(Boolean);

  const tagPrefix = [
    ...dept.map(d=>`【${d}】`),
    cat ? `【${cat}】` : ''
  ].join('');

  const desc = `${tagPrefix}${title}`;

  const res = await api(
    `${TOGGL_V9}/time_entries`,
    'POST','togglApiToken',state.togglToken,
    {
      workspace_id:Number(state.togglWid),
      description: desc,
      start:new Date().toISOString(),
      duration:-1,
      created_with:'Notion Timer'
    }
  );

  state.running=res.id;
  state.startTime=Date.now();
  dom.runningTitle.textContent=desc;
  dom.running.classList.remove('hidden');

  state.timer=setInterval(()=>{
    dom.timer.textContent=fmt(Date.now()-state.startTime);
  },1000);

  saveSettings();
}

async function stopTask() {
  await api(
    `${TOGGL_V9}/workspaces/${state.togglWid}/time_entries/${state.running}/stop`,
    'PATCH','togglApiToken',state.togglToken
  );
  clearInterval(state.timer);
  dom.running.classList.add('hidden');
  state.running=null;
  saveSettings();
}

/* ---------------- Events ---------------- */
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
dom.stopBtn.onclick=stopTask;
dom.completeBtn.onclick=stopTask;
dom.createBtn.onclick=()=>startTask(dom.newTitle.value.trim());

/* ---------------- Init ---------------- */
loadSettings();
renderDbConfigs();
renderDbSelect();
log('init完了');
