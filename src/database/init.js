const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const DB_DIR = path.join(__dirname, '../../data');
const DB_FILE = path.join(DB_DIR, 'database.json');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const defaultData = {
  users: [],
  grades: [
    { id: 'grade-7', name: '七年级', level: 7, order_num: 1 },
    { id: 'grade-8', name: '八年级', level: 8, order_num: 2 },
    { id: 'grade-9', name: '九年级', level: 9, order_num: 3 }
  ],
  classes: [
    { id: 'class-7-1', grade_id: 'grade-7', name: '七年级(1)班', class_num: 1 },
    { id: 'class-7-2', grade_id: 'grade-7', name: '七年级(2)班', class_num: 2 },
    { id: 'class-7-3', grade_id: 'grade-7', name: '七年级(3)班', class_num: 3 },
    { id: 'class-7-4', grade_id: 'grade-7', name: '七年级(4)班', class_num: 4 },
    { id: 'class-7-5', grade_id: 'grade-7', name: '七年级(5)班', class_num: 5 },
    { id: 'class-7-6', grade_id: 'grade-7', name: '七年级(6)班', class_num: 6 },
    { id: 'class-8-1', grade_id: 'grade-8', name: '八年级(1)班', class_num: 1 },
    { id: 'class-8-2', grade_id: 'grade-8', name: '八年级(2)班', class_num: 2 },
    { id: 'class-8-3', grade_id: 'grade-8', name: '八年级(3)班', class_num: 3 },
    { id: 'class-8-4', grade_id: 'grade-8', name: '八年级(4)班', class_num: 4 },
    { id: 'class-8-5', grade_id: 'grade-8', name: '八年级(5)班', class_num: 5 },
    { id: 'class-8-6', grade_id: 'grade-8', name: '八年级(6)班', class_num: 6 },
    { id: 'class-9-1', grade_id: 'grade-9', name: '九年级(1)班', class_num: 1 },
    { id: 'class-9-2', grade_id: 'grade-9', name: '九年级(2)班', class_num: 2 },
    { id: 'class-9-3', grade_id: 'grade-9', name: '九年级(3)班', class_num: 3 },
    { id: 'class-9-4', grade_id: 'grade-9', name: '九年级(4)班', class_num: 4 },
    { id: 'class-9-5', grade_id: 'grade-9', name: '九年级(5)班', class_num: 5 },
    { id: 'class-9-6', grade_id: 'grade-9', name: '九年级(6)班', class_num: 6 }
  ],
  subjects: [
    { id: 'subject-yuwen', name: '语文', code: 'yuwen' },
    { id: 'subject-shuxue', name: '数学', code: 'shuxue' },
    { id: 'subject-yingyu', name: '英语', code: 'yingyu' },
    { id: 'subject-wuli', name: '物理', code: 'wuli' },
    { id: 'subject-huaxue', name: '化学', code: 'huaxue' },
    { id: 'subject-shengwu', name: '生物', code: 'shengwu' },
    { id: 'subject-zhengzhi', name: '道德与法治', code: 'zhengzhi' },
    { id: 'subject-lishi', name: '历史', code: 'lishi' },
    { id: 'subject-dili', name: '地理', code: 'dili' },
    { id: 'subject-tiyu', name: '体育', code: 'tiyu' },
    { id: 'subject-yinyue', name: '音乐', code: 'yinyue' },
    { id: 'subject-meishu', name: '美术', code: 'meishu' },
    { id: 'subject-xinxi', name: '信息技术', code: 'xinxi' }
  ],
  homework: [],
  notices: [],
  homework_submissions: [],
  visit_stats: [],
  system_config: [
    { id: 1, key: 'site_name', value: '南通市崇川初级中学作业公布站', description: '网站名称' },
    { id: 2, key: 'school_name', value: '南通市崇川初级中学', description: '学校名称' },
    { id: 3, key: 'semester', value: '2024-2025学年第二学期', description: '当前学期' },
    { id: 4, key: 'allow_guest_view', value: 'true', description: '允许游客查看作业' },
    { id: 5, key: 'maintenance_mode', value: 'false', description: '维护模式' },
    { id: 6, key: 'homework_deadline_days', value: '7', description: '作业默认截止天数' }
  ],
  attachments: []
};

let db = null;

function loadDB() {
  if (db) return db;
  
  if (fs.existsSync(DB_FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
      console.error('数据库文件损坏，重新初始化:', e);
      db = JSON.parse(JSON.stringify(defaultData));
    }
  } else {
    db = JSON.parse(JSON.stringify(defaultData));
    initDefaultUsers();
    saveDB();
  }
  return db;
}

function saveDB() {
  if (!db) loadDB();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
}

function initDefaultUsers() {
  const hashedPassword = bcrypt.hashSync('admin123', 10);
  const teacherHash = bcrypt.hashSync('teacher123', 10);
  const studentHash = bcrypt.hashSync('student123', 10);
  
  db.users.push({
    id: uuidv4(),
    username: 'admin',
    password: hashedPassword,
    real_name: '系统管理员',
    role: 'super_admin',
    grade_id: null,
    class_id: null,
    subject_id: null,
    phone: '',
    email: 'a****@**************',
    status: 'active',
    created_at: new Date().toISOString(),
    last_login: null
  });
  
  db.users.push({
    id: uuidv4(),
    username: 'jiaowu',
    password: hashedPassword,
    real_name: '教务处管理员',
    role: 'admin',
    grade_id: null,
    class_id: null,
    subject_id: null,
    phone: '',
    email: 'j*****@**************',
    status: 'active',
    created_at: new Date().toISOString(),
    last_login: null
  });
  
  const subjects = ['yuwen', 'shuxue', 'yingyu', 'wuli'];
  const subjectNames = ['语文', '数学', '英语', '物理'];
  for (let i = 0; i < 4; i++) {
    db.users.push({
      id: uuidv4(),
      username: `teacher${i+1}`,
      password: teacherHash,
      real_name: `${subjectNames[i]}老师`,
      role: 'teacher',
      grade_id: 'grade-7',
      class_id: null,
      subject_id: `subject-${subjects[i]}`,
      phone: '',
      email: '',
      status: 'active',
      created_at: new Date().toISOString(),
      last_login: null
    });
  }
  
  for (let c = 1; c <= 3; c++) {
    for (let s = 1; s <= 5; s++) {
      db.users.push({
        id: uuidv4(),
        username: `7${c}0${s}`,
        password: studentHash,
        real_name: `学生${c}${s}`,
        role: 'student',
        grade_id: 'grade-7',
        class_id: `class-7-${c}`,
        subject_id: null,
        student_no: `20247${String(c).padStart(2,'0')}${String(s).padStart(2,'0')}`,
        phone: '',
        email: '',
        status: 'active',
        created_at: new Date().toISOString(),
        last_login: null
      });
    }
  }
}

function getDB() {
  return loadDB();
}

function query(table, filter = null) {
  const data = loadDB();
  let rows = data[table] || [];
  if (filter) {
    rows = rows.filter(row => {
      for (const key in filter) {
        if (row[key] !== filter[key]) return false;
      }
      return true;
    });
  }
  return rows;
}

function queryOne(table, filter) {
  const rows = query(table, filter);
  return rows[0] || null;
}

function insert(table, row) {
  const data = loadDB();
  if (!data[table]) data[table] = [];
  const newRow = { ...row };
  if (!newRow.id) newRow.id = uuidv4();
  if (!newRow.created_at) newRow.created_at = new Date().toISOString();
  data[table].push(newRow);
  saveDB();
  return newRow;
}

function update(table, id, updates) {
  const data = loadDB();
  const rows = data[table] || [];
  const idx = rows.findIndex(r => r.id === id);
  if (idx === -1) return null;
  rows[idx] = { ...rows[idx], ...updates, updated_at: new Date().toISOString() };
  saveDB();
  return rows[idx];
}

function remove(table, id) {
  const data = loadDB();
  const rows = data[table] || [];
  const idx = rows.findIndex(r => r.id === id);
  if (idx === -1) return false;
  rows.splice(idx, 1);
  saveDB();
  return true;
}

function count(table, filter = null) {
  return query(table, filter).length;
}

module.exports = {
  getDB,
  query,
  queryOne,
  insert,
  update,
  remove,
  count,
  saveDB,
  loadDB
};
