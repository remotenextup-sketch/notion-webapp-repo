const NOTION_SECRET = process.env.NOTION_SECRET;

module.exports = async (req, res) => {
  console.log('🔥 PROXY VERSION 2025-12-13 FINAL', req.method);

  // =====================================================
  // CORS
  // =====================================================
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PATCH');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, Notion-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // =====================================================
  // GET / POST 両対応（Proxy自体は常に受ける）
  // =====================================================
  const payload =
    req.method === 'GET'
      ? req.query
      : req.body || {};

  const {
    targetUrl,
    method,
    tokenKey,
    tokenValue,
    notionVersion,
    body
  } = payload;

  if (!targetUrl || !method || !tokenKey) {
    return res.status(400).json({
      message: 'Missing targetUrl, method, or tokenKey'
    });
  }

  // =====================================================
  // ★ Toggl API Passthrough（Reports API 分岐あり）
  // =====================================================
  if (targetUrl.includes('api.track.toggl.com')) {
    console.log('[Proxy] Toggl passthrough:', method, targetUrl);

    if (!tokenValue) {
      return res.status(401).json({
        message: 'Toggl token missing'
      });
    }

    const authHeader =
      'Basic ' +
      Buffer.from(`${tokenValue}:api_token`).toString('base64');

    const isReportsApi = targetUrl.includes('/reports/api/');

    const fetchOptions = {
      method,
      headers: {
        Authorization: authHeader
      }
    };

    // ---------- body処理 ----------
    if (method !== 'GET' && method !== 'HEAD' && body) {
      if (isReportsApi) {
        // 🔴 Reports API は application/x-www-form-urlencoded 必須
        fetchOptions.headers['Content-Type'] =
          'application/x-www-form-urlencoded';
        fetchOptions.body = new URLSearchParams(body).toString();
      } else {
        // 🟢 通常の Toggl API
        fetchOptions.headers['Content-Type'] = 'application/json';
        fetchOptions.body = JSON.stringify(body);
      }
    }

    const togglRes = await fetch(targetUrl, fetchOptions);
    const text = await togglRes.text();

    if (togglRes.status === 204) {
      return res.status(204).end();
    }

    try {
      return res.status(togglRes.status).json(JSON.parse(text));
    } catch {
      return res.status(togglRes.status).json({ message: text });
    }
  }

  // =====================================================
  // ★ Notion API
  // =====================================================
  let token = '';

  if (tokenKey === 'notionToken') {
    token = NOTION_SECRET || tokenValue;
  } else {
    token = tokenValue;
  }

  if (!token) {
    return res.status(401).json({
      message: `Authorization token missing for ${tokenKey}`
    });
  }

  if (!targetUrl.includes('api.notion.com')) {
    return res.status(400).json({
      message: 'Unsupported target API'
    });
  }

  try {
    const apiRes = await fetch(targetUrl, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': notionVersion || '2022-06-28',
        'Content-Type': 'application/json'
      },
      body:
        method !== 'GET' && method !== 'HEAD' && body
          ? JSON.stringify(body)
          : undefined
    });

    if (apiRes.status === 204) {
      return res.status(204).end();
    }

    const text = await apiRes.text();

    try {
      return res.status(apiRes.status).json(JSON.parse(text));
    } catch {
      return res.status(apiRes.status).json({ message: text });
    }
  } catch (err) {
    console.error('Proxy internal error:', err);
    return res.status(500).json({
      message: 'Internal Proxy Error'
    });
  }
};
