const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../database/init');
const config = require('../config');
const { success, error } = require('../utils/helpers');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password, role } = req.body;

  if (!username || !password) {
    return res.status(400).json(error('请输入用户名和密码'));
  }

  let users = db.query('users', { username, status: 'active' });
  if (role) {
    users = users.filter(u => u.role === role);
  }
  const user = users[0];

  if (!user) {
    return res.status(401).json(error('用户名或密码错误'));
  }

  const isValidPassword = bcrypt.compareSync(password, user.password);
  if (!isValidPassword) {
    return res.status(401).json(error('用户名或密码错误'));
  }

  db.update('users', user.id, { last_login: new Date().toISOString() });

  const token = jwt.sign(
    { userId: user.id, username: user.username, role: user.role },
    config.JWT_SECRET,
    { expiresIn: config.JWT_EXPIRES_IN }
  );

  const grade = user.grade_id ? db.queryOne('grades', { id: user.grade_id }) : null;
  const cls = user.class_id ? db.queryOne('classes', { id: user.class_id }) : null;
  const subject = user.subject_id ? db.queryOne('subjects', { id: user.subject_id }) : null;

  res.json(success({
    token,
    user: {
      id: user.id,
      username: user.username,
      realName: user.real_name,
      role: user.role,
      roleName: config.ROLE_NAMES[user.role],
      gradeId: user.grade_id,
      gradeName: grade?.name || null,
      classId: user.class_id,
      className: cls?.name || null,
      subjectId: user.subject_id,
      subjectName: subject?.name || null,
      studentNo: user.student_no || null
    }
  }, '登录成功'));
});

router.get('/me', authMiddleware, (req, res) => {
  const user = db.queryOne('users', { id: req.user.id });
  if (!user) return res.status(404).json(error('用户不存在'));

  const grade = user.grade_id ? db.queryOne('grades', { id: user.grade_id }) : null;
  const cls = user.class_id ? db.queryOne('classes', { id: user.class_id }) : null;
  const subject = user.subject_id ? db.queryOne('subjects', { id: user.subject_id }) : null;

  const { password, ...safeUser } = user;
  res.json(success({
    ...safeUser,
    gradeName: grade?.name || null,
    className: cls?.name || null,
    subjectName: subject?.name || null,
    roleName: config.ROLE_NAMES[user.role]
  }));
});

router.post('/change-password', authMiddleware, (req, res) => {
  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword) {
    return res.status(400).json(error('请填写完整信息'));
  }

  if (newPassword.length < 6) {
    return res.status(400).json(error('新密码长度至少6位'));
  }

  const user = db.queryOne('users', { id: req.user.id });
  if (!user || !bcrypt.compareSync(oldPassword, user.password)) {
    return res.status(400).json(error('原密码错误'));
  }

  const hashedPassword = bcrypt.hashSync(newPassword, 10);
  db.update('users', user.id, { password: hashedPassword });

  res.json(success(null, '密码修改成功'));
});

module.exports = router;
