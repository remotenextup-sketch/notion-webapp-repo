module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'GET') {
    res.json({ status: 'Proxy OK!' });
    return;
  }

  try {
    const body = req.body || {};
    
    // Notion API プロキシ
    if (body.tokenKey === 'notionToken') {
      const headers = {
        'Authorization': `Bearer ${body.tokenValue}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      };
      
      const upstreamRes = await fetch(body.targetUrl, {
        method: body.method || 'POST',
        headers,
        body: body.body ? JSON.stringify(body.body) : undefined
      });
      
      const data = await upstreamRes.json();
      res.status(upstreamRes.status).json(data);
      return;
    }
    
    // Toggl API プロキシ（簡易版）
    if (body.tokenKey === 'togglApiToken') {
      const basicAuth = btoa(`${body.tokenValue}:api_token`); // ブラウザ互換
      const headers = {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/json'
      };
      
      const upstreamRes = await fetch(body.targetUrl, {
        method: body.method || 'GET',
        headers,
        body: body.body ? JSON.stringify(body.body) : undefined
      });
      
      const data = await upstreamRes.json();
      res.status(upstreamRes.status).json(data);
      return;
    }
    
    // customEndpoint（getConfigなど）
    if (body.customEndpoint) {
      // getConfigはNotionプロキシ経由で動作済み
      res.json({ status: 'custom OK', endpoint: body.customEndpoint });
      return;
    }
    
    res.status(400).json({ error: 'tokenKey required' });
    
  } catch (err) {
    console.error('Proxy error:', err);
    res.status(500).json({ error: err.message });
  }
};
