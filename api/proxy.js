module.exports = async function(req, res) {
  console.log('🔥 PROXY HIT:', req.method);
  
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
    
    // targetUrlがあればNotion/Toggl転送
    if (body.targetUrl) {
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${body.tokenValue}`,
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
    
    res.json({ status: 'Proxy OK!', received: body });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
