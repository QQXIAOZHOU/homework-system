const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 配置 - 端口号、数据文件路径、公告文件路径、统计文件路径
const PORT = process.env.PORT || 5000;
const DATA_FILE = path.join(__dirname, 'data', 'homework.json');
const NOTICE_FILE = path.join(__dirname, 'data', 'notice.json');
const STATS_FILE = path.join(__dirname, 'data', 'stats.json');

// 确保data目录存在
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

// 初始化数据文件
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));
}

// 初始化公告文件
if (!fs.existsSync(NOTICE_FILE)) {
  fs.writeFileSync(NOTICE_FILE, JSON.stringify({ content: '欢迎使用作业公布站！' }, null, 2));
}

// 初始化统计文件
if (!fs.existsSync(STATS_FILE)) {
  fs.writeFileSync(STATS_FILE, JSON.stringify({
    totalVisits: 0,
    visits: []
  }, null, 2));
}

// 读取公告数据
function readNotice() {
  try {
    const data = fs.readFileSync(NOTICE_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return { content: '' };
  }
}

// 保存公告数据
function saveNotice(data) {
  fs.writeFileSync(NOTICE_FILE, JSON.stringify(data, null, 2));
}

// 读取统计数据
function readStats() {
  try {
    const data = fs.readFileSync(STATS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return { totalVisits: 0, visits: [] };
  }
}

// 保存统计数据
function saveStats(data) {
  fs.writeFileSync(STATS_FILE, JSON.stringify(data, null, 2));
}

// 记录访问
function recordVisit(userAgent, ip) {
  const stats = readStats();
  stats.totalVisits++;
  
  const visit = {
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    userAgent: userAgent || '未知',
    ip: ip || '未知'
  };
  
  stats.visits.unshift(visit);
  
  // 只保留最近1000条记录
  if (stats.visits.length > 1000) {
    stats.visits = stats.visits.slice(0, 1000);
  }
  
  saveStats(stats);
}

// 中间件
app.use(cors());
app.use(bodyParser.json());

// 访问统计中间件
app.use((req, res, next) => {
  // 只统计页面访问，不统计API和静态资源
  if (req.path === '/' || req.path === '/teacher' || req.path === '/stats') {
    const userAgent = req.headers['user-agent'];
    const ip = req.ip || req.connection.remoteAddress || 
                 req.socket.remoteAddress ||
                 (req.connection.socket ? req.connection.socket.remoteAddress : null);
    recordVisit(userAgent, ip);
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// 读取作业数据
function readHomework() {
  try {
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}

// 保存作业数据
function saveHomework(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// 广播消息到所有连接的客户端
function broadcast(message) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

// WebSocket连接处理
wss.on('connection', ws => {
  console.log('新客户端连接');
  
  ws.on('message', message => {
    console.log('收到消息:', message.toString());
  });
  
  ws.on('close', () => {
    console.log('客户端断开连接');
  });
});

// API路由
app.get('/api/homework', (req, res) => {
  const homework = readHomework();
  res.json(homework);
});

app.post('/api/homework', (req, res) => {
  const homework = readHomework();
  const newHomework = {
    id: Date.now().toString(),
    title: req.body.title,
    subject: req.body.subject,
    content: req.body.content,
    links: req.body.links || [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  homework.unshift(newHomework);
  saveHomework(homework);
  
  // 广播更新
  broadcast({ type: 'homework_created', data: newHomework });
  
  res.json(newHomework);
});

app.put('/api/homework/:id', (req, res) => {
  const homework = readHomework();
  const index = homework.findIndex(h => h.id === req.params.id);
  
  if (index === -1) {
    return res.status(404).json({ error: '作业不存在' });
  }
  
  homework[index] = {
    ...homework[index],
    title: req.body.title,
    subject: req.body.subject,
    content: req.body.content,
    links: req.body.links || [],
    updatedAt: new Date().toISOString()
  };
  
  saveHomework(homework);
  
  // 广播
  broadcast({ type: 'homework_updated', data: homework[index] });
  
  res.json(homework[index]);
});

app.delete('/api/homework/:id', (req, res) => {
  let homework = readHomework();
  const deleted = homework.find(h => h.id === req.params.id);
  
  if (!deleted) {
    return res.status(404).json({ error: '作业不存在' });
  }
  
  homework = homework.filter(h => h.id !== req.params.id);
  saveHomework(homework);
  
  // 广播更新
  broadcast({ type: 'homework_deleted', data: { id: req.params.id } });
  
  res.json({ success: true });
});

// 公告API
app.get('/api/notice', (req, res) => {
  const notice = readNotice();
  res.json(notice);
});

app.put('/api/notice', (req, res) => {
  const notice = {
    content: req.body.content || ''
  };
  saveNotice(notice);
  
  // 广播更新
  broadcast({ type: 'notice_updated', data: notice });
  
  res.json(notice);
});

// 统计API
app.get('/api/stats', (req, res) => {
  const stats = readStats();
  res.json(stats);
});

// 页面
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'student.html'));
});

app.get('/teacher', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'teacher.html'));
});

app.get('/stats', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'stats.html'));
});

// 启动服务器
server.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
  console.log(`学生端: http://localhost:${PORT}/`);
  console.log(`教师端: http://localhost:${PORT}/teacher`);
});
  //create by geyuqi
  // 作业公布站-homework-system
  //mit license
