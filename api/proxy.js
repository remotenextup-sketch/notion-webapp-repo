module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method === 'GET') { res.json({ status: 'Proxy OK!' }); return; }

  try {
    const body = req.body || {};
    
    // Notion
    if (body.tokenKey === 'notionToken') {
      const headers = {
        'Authorization': `Bearer ${body.tokenValue}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      };
      const upstream = await fetch(body.targetUrl, {
        method: body.method || 'POST',
        headers,
        body: body.body ? JSON.stringify(body.body) : undefined
      });
      const data = await upstream.json();
      return res.status(upstream.status).json(data);
    }
    
    // Toggl（CORS回避）
    if (body.tokenKey === 'togglApiToken') {
      const basic = btoa(`${body.tokenValue}:api_token`);
      const headers = {
        'Authorization': `Basic ${basic}`,
        'Content-Type': 'application/json'
      };
      const upstream = await fetch(body.targetUrl, {
        method: body.method || 'GET',
        headers,
        body: body.body ? JSON.stringify(body.body) : undefined
      });
      const data = await upstream.json();
      return res.status(upstream.status).json(data);
    }
    
    res.status(400).json({ error: 'tokenKey required' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
