const NOTION_PROXY_URL = 'https://company-notion-toggl-api.vercel.app/api/proxy';
const TOGGL_API_BASE = 'https://api.track.toggl.com/api/v9';

let config = {};
let dbConfigs = [];
let runningTask = null; // { id: ページID, title: タイトル, dbId: DB ID, togglId: Toggl ID, togglStartTime: 開始時刻 (Dateオブジェクト) }
let timerInterval = null;
let lastTimerCheck = 0; // 継続確認通知用
let lastInactiveCheck = 0; // 未計測時通知用

// ==============================================================================
// 2. ユーティリティ関数
// ==============================================================================

// 設定の読み込みと保存
function loadConfig() {
    try {
        const storedConfig = localStorage.getItem('appConfig');
        if (storedConfig) {
            config = JSON.parse(storedConfig);
            dbConfigs = config.dbConfigs || [];
        } else {
            // 初期設定 (初回起動時)
            dbConfigs = [];
        }
        
        // 設定をフォームに反映
        // ★ 削除: confNotionToken は設定画面から削除されたため、読み込みも削除

        document.getElementById('confNotionUserId').value = config.notionUserId || '';
        document.getElementById('confTogglToken').value = config.togglToken || '';
        document.getElementById('confTogglWid').value = config.togglWid || '';
        document.getElementById('confEnableOngoingNotification').checked = config.enableOngoingNotification || false;
        document.getElementById('confEnableInactiveNotification').checked = config.enableInactiveNotification || false;
        renderDbConfigForm();

        // 実行中タスクの復元
        const storedRunningTask = localStorage.getItem('runningTask');
        if (storedRunningTask) {
            runningTask = JSON.parse(storedRunningTask);
            // 開始時刻をDateオブジェクトに変換
            runningTask.togglStartTime = new Date(runningTask.togglStartTime);
            startRunningTimer();
        }

    } catch (e) {
        console.error('設定の読み込み中にエラーが発生しました:', e);
    }
}

function saveConfig() {
    config = {
        // ★ 削除: Notion Token はサーバー側で管理するため、保存しない
        notionUserId: document.getElementById('confNotionUserId').value.trim(),
        togglToken: document.getElementById('confTogglToken').value.trim(),
        togglWid: document.getElementById('confTogglWid').value.trim(),
        enableOngoingNotification: document.getElementById('confEnableOngoingNotification').checked,
        enableInactiveNotification: document.getElementById('confEnableInactiveNotification').checked,
        dbConfigs: dbConfigs
    };

    localStorage.setItem('appConfig', JSON.stringify(config));
    alert('設定を保存しました。');
    toggleSettingsView();
    loadTasks();
}

// 時刻フォーマット
function formatTime(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    
    const pad = (num) => String(num).padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

// 通知表示
function showNotification(message) {
    const container = document.getElementById('notificationContainer');
    container.textContent = message;
    container.style.display = 'block';
    // フェードイン
    setTimeout(() => { container.style.opacity = '1'; }, 10);
    // 3秒後にフェードアウト
    setTimeout(() => {
        container.style.opacity = '0';
        setTimeout(() => { container.style.display = 'none'; }, 300);
    }, 3000);
}

// ファビコンの切り替え
function switchFavicon(isRunning) {
    const link = document.querySelector("link[rel*='icon']");
    if (link) {
        if (isRunning) {
            link.href = 'favicon-running.ico';
        } else {
            link.href = 'favicon.ico';
        }
    }
}

// ==============================================================================
// 3. API通信 (Notion & Toggl)
// ==============================================================================

/**
 * 外部APIへのリクエストを行う共通関数。
 * @param {string} url - APIのフルURL (Toggl API用)
 * @param {string} method - HTTPメソッド ('GET', 'POST', 'PATCH', 'DELETE')
 * @param {object} headers - HTTPヘッダー
 * @param {object} body - リクエストボディ (JSONに変換される)
 * @param {boolean} isNotion - Notion APIへのリクエストかどうか
 * @returns {Promise<object>} - APIレスポンスデータ
 */
async function externalApi(url, method = 'GET', headers = {}, body = null, isNotion = false) {
    const options = {
        method: method,
        headers: headers
    };

    if (body) {
        options.body = JSON.stringify(body);
        options.headers['Content-Type'] = 'application/json';
    }

    // ★ 修正: Notionリクエストの場合はプロキシを経由する
    if (isNotion) {
        // Notionリクエストに必要な追加情報をリクエストボディに含める
        // プロキシ側で必要な処理（例: DBクエリ、ページ更新など）を識別するための情報
        
        // TogglリクエストとNotionリクエストのデータ構造が異なるため、
        // ここではすべてのNotionリクエストをプロキシに転送し、
        // プロキシ側で適切なエンドポイントとヘッダー（Notion Token）を使用する。
        
        // クライアント側の処理をシンプルにするため、新しいプロキシエンドポイントを叩く
        const notionConfig = dbConfigs.find(db => url.includes(db.dbId));
        
        // プロキシURLを使い、メソッド、URLのパス、ボディをサーバーに送る
        const proxyBody = {
            method: method,
            path: url, // Notion APIのパス全体を送る (例: /v1/databases/{dbId}/query)
            body: body,
            dbId: notionConfig ? notionConfig.dbId : null,
        };

        try {
            const response = await fetch(NOTION_PROXY_URL, {
                method: 'POST', // すべてのNotionリクエストはプロキシにPOSTする
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(proxyBody)
            });

            if (!response.ok) {
                // プロキシがエラーを返した場合、エラーメッセージを取得してスロー
                const errorData = await response.json().catch(() => ({ message: response.statusText }));
                throw new Error(JSON.stringify(errorData));
            }

            // プロキシからの正常なレスポンスを返す
            return response.json();
            
        } catch (error) {
            console.error('APIエラー:', error);
            // ユーザーに表示可能なエラーメッセージを抽出
            let errorMessage = "Notion連携エラー";
            try {
                const errorObj = JSON.parse(error.message);
                if (errorObj.message) {
                    errorMessage = errorObj.message;
                }
            } catch {}
            throw new Error(errorMessage);
        }

    } else {
        // Toggl API通信 (認証情報を含むため、直接クライアントから叩く)
        // Toggl Tokenは個人用なので、Notion Tokenのような組織全体の機密情報ではない
        const togglToken = config.togglToken;
        if (!togglToken) {
            throw new Error("Toggl APIトークンが設定されていません。");
        }
        
        // Base64エンコードされた認証ヘッダーを作成
        const authHeader = 'Basic ' + btoa(togglToken + ':api_token');
        options.headers['Authorization'] = authHeader;
        
        // Toggl APIは通常Content-Typeを要求しないため、既に設定されている場合のみ維持

        const response = await fetch(url, options);

        if (!response.ok) {
            // Togglのエラーはそのままスロー
            const errorData = await response.json().catch(() => ({ message: response.statusText }));
            throw new Error(JSON.stringify(errorData));
        }

        return response.json();
    }
}

// --------------------------------------------------
// Notion API関数 (プロキシ経由に変更)
// --------------------------------------------------

/**
 * データベースのメタデータを取得する (プロパティ情報など)
 */
async function getDatabase(dbId) {
    const url = `/v1/databases/${dbId}`;
    return externalApi(url, 'GET', {}, null, true);
}

/**
 * データベースをクエリしてタスクを取得する
 */
async function queryDatabase(dbId, filter) {
    const url = `/v1/databases/${dbId}/query`;
    return externalApi(url, 'POST', {}, { filter: filter }, true);
}

/**
 * 新しいページ（タスク）を作成する
 */
async function createNotionPage(dbId, properties) {
    const url = `/v1/pages`;
    const body = {
        parent: { database_id: dbId },
        properties: properties
    };
    return externalApi(url, 'POST', {}, body, true);
}

/**
 * ページ（タスク）を更新する
 */
async function updateNotionPage(pageId, properties) {
    const url = `/v1/pages/${pageId}`;
    const body = { properties: properties };
    return externalApi(url, 'PATCH', {}, body, true);
}

// --------------------------------------------------
// Toggl API関数 (直接通信)
// --------------------------------------------------

async function getCurrentTimeEntry() {
    const url = `${TOGGL_API_BASE}/time_entries/current`;
    return externalApi(url, 'GET', {}, null, false);
}

async function startTimeEntry(description, workspaceId) {
    const url = `${TOGGL_API_BASE}/time_entries`;
    const body = {
        workspace_id: workspaceId,
        description: description,
        start: new Date().toISOString(),
        created_with: "Notion-Toggl App"
    };
    return externalApi(url, 'POST', {}, { time_entry: body }, false);
}

async function stopTimeEntry(timeEntryId) {
    const url = `${TOGGL_API_BASE}/time_entries/${timeEntryId}/stop`;
    return externalApi(url, 'PATCH', {}, null, false);
}


// ==============================================================================
// 4. メインロジック
// ==============================================================================

// ... (loadTasks, renderTaskList, startTask, stopTask, completeTask, timerUpdate, etc. はそのまま)

// ==============================================================================
// 5. 初期化とイベントリスナー
// ==============================================================================

// ... (省略: 処理内容に変更がないため)
