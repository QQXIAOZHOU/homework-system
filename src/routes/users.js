const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../database/init');
const { success, error } = require('../utils/helpers');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

function formatUser(u) {
  const { password, ...safeUser } = u;
  const grade = u.grade_id ? db.queryOne('grades', { id: u.grade_id }) : null;
  const cls = u.class_id ? db.queryOne('classes', { id: u.class_id }) : null;
  const subject = u.subject_id ? db.queryOne('subjects', { id: u.subject_id }) : null;
  return {
    ...safeUser,
    gradeId: u.grade_id,
    classId: u.class_id,
    subjectId: u.subject_id,
    realName: u.real_name,
    gradeName: grade?.name || null,
    grade_name: grade?.name || null,
    className: cls?.name || null,
    class_name: cls?.name || null,
    subjectName: subject?.name || null,
    subject_name: subject?.name || null,
    status: u.status === 'active',
    statusValue: u.status
  };
}

router.get('/', authMiddleware, requireRole(['admin', 'super_admin']), (req, res) => {
  let role = req.query.role;
  let grade_id = req.query.grade_id || req.query.gradeId;
  let class_id = req.query.class_id || req.query.classId;
  let keyword = req.query.keyword;
  let page = parseInt(req.query.page) || 1;
  let pageSize = parseInt(req.query.pageSize) || 20;
  
  let users = db.query('users');
  
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
  const pagedUsers = users.slice(start, start + pageSize).map(formatUser);
  
  res.json(success({ 
    list: pagedUsers, 
    users: pagedUsers,
    total, 
    page, 
    pageSize 
  }));
});

router.get('/teachers', authMiddleware, (req, res) => {
  let class_id = req.query.class_id || req.query.classId;
  let grade_id = req.query.grade_id || req.query.gradeId;
  let teachers = db.query('users', { role: 'teacher', status: 'active' });
  
  if (grade_id) teachers = teachers.filter(t => t.grade_id === grade_id);
  
  teachers = teachers.map(formatUser);
  
  res.json(success(teachers));
});

router.get('/subjects', authMiddleware, (req, res) => {
  const subjects = db.query('subjects');
  res.json(success(subjects));
});

router.post('/', authMiddleware, requireRole(['admin', 'super_admin']), (req, res) => {
  const { 
    username, password, 
    real_name, realName, 
    role, 
    grade_id, gradeId, 
    class_id, classId, 
    subject_id, subjectId,
    phone, email, student_no 
  } = req.body;
  
  const finalRealName = real_name || realName;
  const finalGradeId = grade_id || gradeId;
  const finalClassId = class_id || classId;
  const finalSubjectId = subject_id || subjectId;

  if (!username || !password || !finalRealName || !role) {
    return res.status(400).json(error('请填写必填信息'));
  }

  if (db.queryOne('users', { username })) {
    return res.status(400).json(error('用户名已存在'));
  }

  const hashedPassword = bcrypt.hashSync(password, 10);
  const user = db.insert('users', {
    username,
    password: hashedPassword,
    real_name: finalRealName,
    role,
    grade_id: finalGradeId || null,
    class_id: finalClassId || null,
    subject_id: finalSubjectId || null,
    phone: phone || '',
    email: email || '',
    student_no: student_no || null,
    status: 'active'
  });

  res.json(success(formatUser(user), '用户创建成功'));
});

router.put('/:id', authMiddleware, requireRole(['admin', 'super_admin']), (req, res) => {
  const { 
    real_name, realName, 
    role, 
    grade_id, gradeId, 
    class_id, classId, 
    subject_id, subjectId,
    phone, email, status, student_no 
  } = req.body;
  const user = db.queryOne('users', { id: req.params.id });
  
  if (!user) {
    return res.status(404).json(error('用户不存在'));
  }

  let finalStatus;
  if (status !== undefined) {
    if (typeof status === 'boolean') {
      finalStatus = status ? 'active' : 'inactive';
    } else {
      finalStatus = status;
    }
  }

  const updates = {};
  if (real_name !== undefined || realName !== undefined) updates.real_name = real_name || realName;
  if (role !== undefined) updates.role = role;
  if (grade_id !== undefined || gradeId !== undefined) updates.grade_id = grade_id || gradeId || null;
  if (class_id !== undefined || classId !== undefined) updates.class_id = class_id || classId || null;
  if (subject_id !== undefined || subjectId !== undefined) updates.subject_id = subject_id || subjectId || null;
  if (phone !== undefined) updates.phone = phone;
  if (email !== undefined) updates.email = email;
  if (finalStatus !== undefined) updates.status = finalStatus;
  if (student_no !== undefined) updates.student_no = student_no;

  const updated = db.update('users', req.params.id, updates);
  res.json(success(formatUser(updated), '用户更新成功'));
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
