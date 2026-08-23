const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../database/init');
const { success, error } = require('../utils/helpers');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', authMiddleware, requireRole(['admin', 'super_admin']), (req, res) => {
  const { role, grade_id, class_id, keyword, page = 1, pageSize = 20 } = req.query;
  
  let users = db.query('users', { status: 'active' });
  
  if (role) users = users.filter(u => u.role === role);
  if (grade_id) users = users.filter(u => u.grade_id === grade_id);
  if (class_id) users = users.filter(u => u.class_id === class_id);
  if (keyword) {
    const kw = keyword.toLowerCase();
    users = users.filter(u => 
      (u.username && u.username.toLowerCase().includes(kw)) ||
      (u.real_name && u.real_name.includes(keyword))
    );
  }
  
  const total = users.length;
  const start = (page - 1) * pageSize;
  const pagedUsers = users.slice(start, start + parseInt(pageSize)).map(u => {
    const { password, ...safeUser } = u;
    const grade = u.grade_id ? db.queryOne('grades', { id: u.grade_id }) : null;
    const cls = u.class_id ? db.queryOne('classes', { id: u.class_id }) : null;
    const subject = u.subject_id ? db.queryOne('subjects', { id: u.subject_id }) : null;
    return {
      ...safeUser,
      gradeName: grade?.name || null,
      className: cls?.name || null,
      subjectName: subject?.name || null
    };
  });
  
  res.json(success({ users: pagedUsers, total, page: parseInt(page), pageSize: parseInt(pageSize) }));
});

router.get('/teachers', authMiddleware, (req, res) => {
  const { class_id, grade_id } = req.query;
  let teachers = db.query('users', { role: 'teacher', status: 'active' });
  
  if (grade_id) teachers = teachers.filter(t => t.grade_id === grade_id);
  
  teachers = teachers.map(t => {
    const { password, ...safe } = t;
    const subject = t.subject_id ? db.queryOne('subjects', { id: t.subject_id }) : null;
    return { ...safe, subjectName: subject?.name || null };
  });
  
  res.json(success(teachers));
});

router.post('/', authMiddleware, requireRole(['admin', 'super_admin']), (req, res) => {
  const { username, password, real_name, role, grade_id, class_id, subject_id, phone, email, student_no } = req.body;

  if (!username || !password || !real_name || !role) {
    return res.status(400).json(error('请填写必填信息'));
  }

  if (db.queryOne('users', { username })) {
    return res.status(400).json(error('用户名已存在'));
  }

  const hashedPassword = bcrypt.hashSync(password, 10);
  const user = db.insert('users', {
    username,
    password: hashedPassword,
    real_name,
    role,
    grade_id: grade_id || null,
    class_id: class_id || null,
    subject_id: subject_id || null,
    phone: phone || '',
    email: email || '',
    student_no: student_no || null,
    status: 'active'
  });

  const { password: _, ...safeUser } = user;
  res.json(success(safeUser, '用户创建成功'));
});

router.put('/:id', authMiddleware, requireRole(['admin', 'super_admin']), (req, res) => {
  const { real_name, role, grade_id, class_id, subject_id, phone, email, status, student_no } = req.body;
  const user = db.queryOne('users', { id: req.params.id });
  
  if (!user) {
    return res.status(404).json(error('用户不存在'));
  }

  const updated = db.update('users', req.params.id, {
    real_name, role, grade_id, class_id, subject_id, phone, email, status, student_no
  });

  const { password, ...safeUser } = updated;
  res.json(success(safeUser, '用户更新成功'));
});

router.post('/:id/reset-password', authMiddleware, requireRole(['admin', 'super_admin']), (req, res) => {
  const { newPassword } = req.body;
  const user = db.queryOne('users', { id: req.params.id });
  
  if (!user) {
    return res.status(404).json(error('用户不存在'));
  }

  const hashedPassword = bcrypt.hashSync(newPassword || '123456', 10);
  db.update('users', req.params.id, { password: hashedPassword });

  res.json(success(null, '密码重置成功'));
});

router.delete('/:id', authMiddleware, requireRole(['super_admin']), (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json(error('不能删除自己的账号'));
  }
  
  const user = db.queryOne('users', { id: req.params.id });
  if (!user) {
    return res.status(404).json(error('用户不存在'));
  }

  db.update('users', req.params.id, { status: 'inactive' });
  res.json(success(null, '用户已禁用'));
});

module.exports = router;
