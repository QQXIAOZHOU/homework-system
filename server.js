const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const config = require('./src/config');
const db = require('./src/database/init');
const authRoutes = require('./src/routes/auth');
const gradesRoutes = require('./src/routes/grades');
const usersRoutes = require('./src/routes/users');
const homeworkModule = require('./src/routes/homework');
const noticesModule = require('./src/routes/notices');
const statsRoutes = require('./src/routes/stats');
const uploadRoutes = require('./src/routes/upload');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

db.loadDB();
homeworkModule.setWSS(wss);
noticesModule.setWSS(wss);

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

const UPLOAD_DIR = path.join(__dirname, 'uploads');
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/grades', gradesRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/homework', homeworkModule.router);
app.use('/api/notices', noticesModule.router);
app.use('/api/stats', statsRoutes);
app.use('/api/upload', uploadRoutes);

app.get('/api/config', (req, res) => {
  const configs = db.query('system_config');
  const configObj = {};
  configs.forEach(c => { configObj[c.key] = c.value; });
  
  res.json({
    schoolName: configObj.school_name || config.SCHOOL_NAME,
    siteName: configObj.site_name || '作业公布站',
    semester: configObj.semester || '',
    roles: config.ROLE_NAMES,
    maintenanceMode: configObj.maintenance_mode === 'true'
  });
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/teacher', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'teacher.html'));
});

app.get('/student', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'student.html'));
});

app.get('/stats', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'stats.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({ success: false, message: '服务器内部错误', error: err.message });
});

const PORT = config.PORT || 3000;
server.listen(PORT, () => {
  console.log('========================================');
  console.log(`${config.SCHOOL_NAME}作业公布站`);
  console.log('========================================');
  console.log(`服务器运行在 http://localhost:${PORT}`);
  console.log('');
  console.log('页面入口:');
  console.log(`  首页: http://localhost:${PORT}/`);
  console.log(`  登录: http://localhost:${PORT}/login`);
  console.log(`  学生端: http://localhost:${PORT}/student`);
  console.log(`  教师端: http://localhost:${PORT}/teacher`);
  console.log(`  管理端: http://localhost:${PORT}/admin`);
  console.log(`  统计页: http://localhost:${PORT}/stats`);
  console.log('');
  console.log('默认账号:');
  console.log('  超级管理员: admin / admin123');
  console.log('  教务管理员: jiaowu / admin123');
  console.log('  教师账号: teacher1 / teacher123 (语文)');
  console.log('  学生账号: 7101 / student123 (七1班)');
  console.log('========================================');
});
