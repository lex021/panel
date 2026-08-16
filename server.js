/**
 * AURORA TEAM - BACKEND SERVER & REAL-TIME API
 * Zero-dependency Node.js HTTP & SSE Server
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

// Default initial database state
const DEFAULT_DATA = {
  user: {
    username: 'name',
    userId: '620771081',
    tag: '#teg',
    logsCount: 48,
    daysInTeam: 24,
    tonWallet: '',
    tonBalance: 0,
    tonWithdrawn: 0
  },
  minions: [
    '8100791171',
    '8321020721',
    '8058235111',
    '5227767831'
  ],
  stars: {
    postUrl: 'https://t.me/name/1',
    withdrawStars: true,
    howWithdraw: 'all' // 'all' or 'balance'
  },
  config: {
    extraLog: true,
    apiId: '',
    apiHash: ''
  },
  logsChat: {
    chatId: '',
    threadId: ''
  },
  sessions: [
    {
      id: 1,
      bot: '@X9aurorabot',
      sessionName: 'Сессия #1',
      location: 'NL, Amsterdam',
      os: 'iOS 18.7',
      ip: '213.111.139.195',
      ping: 28,
      status: 'online'
    },
    {
      id: 2,
      bot: '@alprozalameilfitness',
      sessionName: 'Сессия #2',
      location: 'US, Ashburn',
      os: 'iOS 18.7',
      ip: '195.181.173.212',
      ping: 44,
      status: 'online'
    },
    {
      id: 3,
      bot: '@name_bot',
      sessionName: 'Сессия #3',
      location: 'DE, Frankfurt',
      os: 'Android 14',
      ip: '188.114.97.12',
      ping: 32,
      status: 'online'
    }
  ],
  contest: {
    title: '$25,000 ПРИЗОВОЙ ФОНД',
    endTime: Date.now() + (4 * 86400 + 18 * 3600 + 32 * 60) * 1000,
    leaderboard: [
      { rank: 1, name: '@cryptoking', logs: 342, prize: '$10,000', badge: 'gold' },
      { rank: 2, name: '@dark_venom', logs: 289, prize: '$6,000', badge: 'silver' },
      { rank: 3, name: '@aurora_boss', logs: 215, prize: '$3,500', badge: 'bronze' },
      { rank: 4, name: '@phantom_x', logs: 180, prize: '$2,000' },
      { rank: 5, name: '@cyber_ninja', logs: 134, prize: '$1,500' },
      { rank: 6, name: '@storm_worker', logs: 92, prize: '$1,000' },
      { rank: 7, name: '@name (Вы)', logs: 48, prize: '$500', isSelf: true }
    ]
  }
};

// Load or initialize database
let db = loadData();

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf8');
      return { ...DEFAULT_DATA, ...JSON.parse(content) };
    }
  } catch (err) {
    console.error('Error reading data.json, using defaults', err);
  }
  saveData(DEFAULT_DATA);
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data || db, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving data.json', err);
  }
}

// SSE Connected clients
const sseClients = new Set();

function broadcastEvent(eventType, payload) {
  const dataString = `event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(dataString);
    } catch (e) {
      sseClients.delete(res);
    }
  }
}

// MIME types dictionary
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.mp4': 'video/mp4',
  '.ico': 'image/x-icon'
};

// Helper: read request JSON body
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

// Helper: send JSON response
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
  });
  res.end(JSON.stringify(data));
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;
  const method = req.method.toUpperCase();

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
    });
    return res.end();
  }

  // ==========================================
  // REAL-TIME SSE STREAM ENDPOINT
  // ==========================================
  if (pathname === '/api/events' && method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write(': connected\n\n');
    sseClients.add(res);

    req.on('close', () => {
      sseClients.delete(res);
    });
    return;
  }

  // ==========================================
  // REST API ENDPOINTS
  // ==========================================

  // GET /api/data (Full state snapshot)
  if (pathname === '/api/data' && method === 'GET') {
    return sendJson(res, 200, db);
  }

  // GET /api/user
  if (pathname === '/api/user' && method === 'GET') {
    return sendJson(res, 200, db.user);
  }

  // POST /api/user/wallet
  if (pathname === '/api/user/wallet' && method === 'POST') {
    try {
      const body = await parseBody(req);
      if (typeof body.wallet !== 'string') {
        return sendJson(res, 400, { error: 'Invalid wallet address' });
      }
      db.user.tonWallet = body.wallet.trim();
      saveData();
      broadcastEvent('user_updated', db.user);
      return sendJson(res, 200, { success: true, user: db.user });
    } catch (e) {
      return sendJson(res, 400, { error: 'Malformed JSON' });
    }
  }

  // POST /api/user/tag
  if (pathname === '/api/user/tag' && method === 'POST') {
    try {
      const body = await parseBody(req);
      if (!body.tag || typeof body.tag !== 'string') {
        return sendJson(res, 400, { error: 'Invalid tag' });
      }
      let tag = body.tag.trim();
      if (!tag.startsWith('#')) tag = '#' + tag;
      db.user.tag = tag;
      saveData();
      broadcastEvent('user_updated', db.user);
      return sendJson(res, 200, { success: true, user: db.user });
    } catch (e) {
      return sendJson(res, 400, { error: 'Malformed JSON' });
    }
  }

  // POST /api/user/withdraw
  if (pathname === '/api/user/withdraw' && method === 'POST') {
    try {
      const body = await parseBody(req);
      const amount = parseFloat(body.amount);
      if (isNaN(amount) || amount <= 0 || amount > db.user.tonBalance) {
        return sendJson(res, 400, { error: 'Invalid withdrawal amount' });
      }
      db.user.tonBalance -= amount;
      db.user.tonWithdrawn += amount;
      saveData();
      broadcastEvent('user_updated', db.user);
      return sendJson(res, 200, { success: true, user: db.user });
    } catch (e) {
      return sendJson(res, 400, { error: 'Malformed JSON' });
    }
  }

  // GET /api/minions
  if (pathname === '/api/minions' && method === 'GET') {
    return sendJson(res, 200, db.minions);
  }

  // POST /api/minions
  if (pathname === '/api/minions' && method === 'POST') {
    try {
      const body = await parseBody(req);
      const id = String(body.id || '').trim();
      if (!id || id.length < 5) {
        return sendJson(res, 400, { error: 'Invalid Telegram ID' });
      }
      if (!db.minions.includes(id)) {
        db.minions.unshift(id);
        saveData();
        broadcastEvent('minions_updated', db.minions);
      }
      return sendJson(res, 200, { success: true, minions: db.minions });
    } catch (e) {
      return sendJson(res, 400, { error: 'Malformed JSON' });
    }
  }

  // DELETE /api/minions/:id
  if (pathname.startsWith('/api/minions/') && method === 'DELETE') {
    const id = pathname.split('/')[3];
    if (id) {
      db.minions = db.minions.filter(m => m !== id);
      saveData();
      broadcastEvent('minions_updated', db.minions);
      return sendJson(res, 200, { success: true, minions: db.minions });
    }
    return sendJson(res, 400, { error: 'Missing ID' });
  }

  // GET /api/stars
  if (pathname === '/api/stars' && method === 'GET') {
    return sendJson(res, 200, db.stars);
  }

  // POST /api/stars
  if (pathname === '/api/stars' && method === 'POST') {
    try {
      const body = await parseBody(req);
      db.stars = { ...db.stars, ...body };
      saveData();
      broadcastEvent('stars_updated', db.stars);
      return sendJson(res, 200, { success: true, stars: db.stars });
    } catch (e) {
      return sendJson(res, 400, { error: 'Malformed JSON' });
    }
  }

  // GET /api/config
  if (pathname === '/api/config' && method === 'GET') {
    return sendJson(res, 200, db.config);
  }

  // POST /api/config
  if (pathname === '/api/config' && method === 'POST') {
    try {
      const body = await parseBody(req);
      db.config = { ...db.config, ...body };
      saveData();
      broadcastEvent('config_updated', db.config);
      return sendJson(res, 200, { success: true, config: db.config });
    } catch (e) {
      return sendJson(res, 400, { error: 'Malformed JSON' });
    }
  }

  // GET /api/logs/settings
  if (pathname === '/api/logs/settings' && method === 'GET') {
    return sendJson(res, 200, db.logsChat);
  }

  // POST /api/logs/settings
  if (pathname === '/api/logs/settings' && method === 'POST') {
    try {
      const body = await parseBody(req);
      db.logsChat = { ...db.logsChat, ...body };
      saveData();
      broadcastEvent('logs_chat_updated', db.logsChat);
      return sendJson(res, 200, { success: true, logsChat: db.logsChat });
    } catch (e) {
      return sendJson(res, 400, { error: 'Malformed JSON' });
    }
  }

  // POST /api/logs/test
  if (pathname === '/api/logs/test' && method === 'POST') {
    broadcastEvent('new_log', {
      title: 'Новый лог!',
      user: 'Михаил Комяков',
      tag: '@M_I_S_H_A2',
      ip: '213.111.139.195',
      country: 'The Netherlands',
      city: 'Amsterdam',
      device: 'iOS 18.7',
      time: new Date().toLocaleTimeString()
    });
    return sendJson(res, 200, { success: true, message: 'Test log broadcasted' });
  }

  // GET /api/sessions
  if (pathname === '/api/sessions' && method === 'GET') {
    return sendJson(res, 200, db.sessions);
  }

  // GET /api/contest
  if (pathname === '/api/contest' && method === 'GET') {
    return sendJson(res, 200, db.contest);
  }

  // ==========================================
  // STATIC FILE SERVING
  // ==========================================
  const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.join(__dirname, safePath === '/' ? 'index.html' : safePath);

  // Prevent directory traversal
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    return res.end('403 Forbidden');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

// Real-time periodic pings / mock background events (simulates real traffic)
setInterval(() => {
  if (sseClients.size > 0) {
    // Heartbeat to keep connections alive
    for (const res of sseClients) {
      try { res.write(': heartbeat\n\n'); } catch (e) {}
    }

    // Randomize ping slightly
    if (db.sessions && db.sessions.length > 0) {
      db.sessions.forEach(s => {
        s.ping = Math.floor(25 + Math.random() * 25);
      });
      broadcastEvent('sessions_updated', db.sessions);
    }
  }
}, 10000);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 AURORA TEAM Server running at http://localhost:${PORT}`);
  console.log(`📱 Real-time Telegram Mini App Backend active with SSE support\n`);
});
