// ... (中略)

// ================= UI (Others) =================

/**
 * 数秒間表示される非ブロック型通知を表示します。
 */
function showNotification(message, duration = 3000) {
    if (!dom.notificationContainer) return;
    
    dom.notificationContainer.textContent = message;
    dom.notificationContainer.style.display = 'block';
    
    // フェードイン
    setTimeout(() => {
        dom.notificationContainer.style.opacity = 1;
    }, 10); 

    // フェードアウト
    setTimeout(() => {
        dom.notificationContainer.style.opacity = 0;
        setTimeout(() => {
            dom.notificationContainer.style.display = 'none';
        }, 300);
    }, duration);
}

/**
 * 実行中UIの表示/非表示を切り替えます。
 */
// ... (中略。この関数は変更なし)

// ================= Tasks & Timer =================

// ... (中略)

/**
 * 停止処理（API実行）をバックグラウンドで行う非同期関数。
 */
async function executeStopAndLog(task, log, isComplete) {
    if (isStopping) return;
    isStopping = true;
    
    try {
        // 1. Toggl停止 (省略)

        // ... (中略：Toggl停止ロジック)

        const notionPatches = {};
        
        // 2. 思考ログ保存 (省略)

        // ... (中略：思考ログ保存ロジック)

        // 3. ステータス変更 (省略)

        // ... (中略：ステータス変更ロジック)

        // 4. Notionページ更新
        if (Object.keys(notionPatches).length > 0) {
            await notionApi(`/pages/${task.id}`, 'PATCH', { properties: notionPatches });
            // ★ 反映完了時の通知を再実行
            showNotification('Notionにログとステータスを反映し、タスクを完了しました。', 2500);
        } else {
             // ログやステータス変更がなくても、Togglが停止したら完了を通知
             showNotification('タスクを一時停止しました。', 2500);
        }

    } catch (e) {
        // ... (中略：エラー処理)
    } finally {
        // 処理完了後の後始末 
        settings.currentRunningTask = null;
        settings.startTime = null;
        saveSettings();
        isStopping = false;
    }
}


/**
 * 実行中のタスクを停止します。
 */
function stopTask(isComplete) {
    if (!settings.currentRunningTask || isStopping) return;

    const t = settings.currentRunningTask;
    const log = dom.thinkingLogInput.value.trim();
    const action = isComplete ? '完了' : '一時停止';

    // 1. フロントエンドを即座に更新
    updateRunningUI(false);
    
    // 2. ユーザーへ「処理中」を伝える通知を先に表示
    // ★ ここで通知を必ず表示する
    showNotification(`タスクを${action}しました。Notion/Togglに反映中...`, 3000);
    
    // 3. バックグラウンドでAPI処理を実行
    setTimeout(() => {
        // executeStopAndLog が成功すれば、中で完了通知に上書きされます
        executeStopAndLog(t, log, isComplete);
    }, 50);
}

// ... (以下略。init関数など、他の部分は変更ありません)
