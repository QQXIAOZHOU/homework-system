const express = require('express');
const db = require('../database/init');
const config = require('../config');
const { success, error } = require('../utils/helpers');
const { authMiddleware, optionalAuth, requireRole, canAccessClass } = require('../middleware/auth');

const router = express.Router();

router.get('/', optionalAuth, (req, res) => {
  const { class_id, grade_id, subject_id, date, page = 1, pageSize = 20 } = req.query;
  
  let homework = db.query('homework', { status: 'published' });
  
  if (class_id) {
    homework = homework.filter(h => h.class_id === class_id);
  } else if (grade_id) {
    const classIds = db.query('classes', { grade_id }).map(c => c.id);
    homework = homework.filter(h => classIds.includes(h.class_id));
  }
  
  if (subject_id) homework = homework.filter(h => h.subject_id === subject_id);
  if (date) homework = homework.filter(h => (h.due_date || '').startsWith(date));
  
  homework.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  
  const total = homework.length;
  const start = (page - 1) * pageSize;
  const pagedHw = homework.slice(start, start + parseInt(pageSize)).map(h => {
    const subject = db.queryOne('subjects', { id: h.subject_id });
    const teacher = db.queryOne('users', { id: h.teacher_id });
    const cls = db.queryOne('classes', { id: h.class_id });
    return {
      ...h,
      subjectName: subject?.name || '未知科目',
      teacherName: teacher?.real_name || '未知教师',
      className: cls?.name || '未知班级'
    };
  });
  
  res.json(success({ homework: pagedHw, total, page: parseInt(page), pageSize: parseInt(pageSize) }));
});

router.get('/my', authMiddleware, (req, res) => {
  const user = db.queryOne('users', { id: req.user.id });
  if (!user) return res.status(401).json(error('请先登录'));

  let homework = [];
  
  if (user.role === 'student' && user.class_id) {
    homework = db.query('homework', { class_id: user.class_id, status: 'published' });
  } else if (user.role === 'teacher') {
    homework = db.query('homework', { teacher_id: user.id });
  } else if (['admin', 'super_admin'].includes(user.role)) {
    homework = db.query('homework');
  } else {
    homework = db.query('homework', { status: 'published' });
  }
  
  homework.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  
  const result = homework.map(h => {
    const subject = db.queryOne('subjects', { id: h.subject_id });
    const teacher = db.queryOne('users', { id: h.teacher_id });
    const cls = db.queryOne('classes', { id: h.class_id });
    return {
      ...h,
      subjectName: subject?.name || '未知科目',
      teacherName: teacher?.real_name || '未知教师',
      className: cls?.name || '未知班级'
    };
  });
  
  res.json(success(result));
});

router.get('/:id', optionalAuth, (req, res) => {
  const hw = db.queryOne('homework', { id: req.params.id });
  if (!hw) {
    return res.status(404).json(error('作业不存在'));
  }

  const subject = db.queryOne('subjects', { id: hw.subject_id });
  const teacher = db.queryOne('users', { id: hw.teacher_id });
  const cls = db.queryOne('classes', { id: hw.class_id });
  const grade = cls ? db.queryOne('grades', { id: cls.grade_id }) : null;

  res.json(success({
    ...hw,
    subjectName: subject?.name || '未知科目',
    teacherName: teacher?.real_name || '未知教师',
    className: cls?.name || '未知班级',
    gradeName: grade?.name || null
  }));
});

router.post('/', authMiddleware, requireRole(['teacher', 'admin', 'super_admin']), (req, res) => {
  const { title, content, class_id, subject_id, due_date, attachments } = req.body;
  const user = db.queryOne('users', { id: req.user.id });

  if (!title || !content || !class_id) {
    return res.status(400).json(error('请填写完整信息（标题、内容、班级）'));
  }

  const cls = db.queryOne('classes', { id: class_id });
  if (!cls) {
    return res.status(400).json(error('班级不存在'));
  }

  if (!canAccessClass(user, class_id) && !['admin', 'super_admin'].includes(user.role)) {
    return res.status(403).json(error('您没有权限在该班级发布作业'));
  }

  const homework = db.insert('homework', {
    title,
    content,
    class_id,
    grade_id: cls.grade_id,
    subject_id: subject_id || user.subject_id || null,
    teacher_id: user.id,
    due_date: due_date || null,
    attachments: JSON.stringify(attachments || []),
    status: 'published'
  });

  broadcastUpdate({
    type: 'homework_created',
    payload: { ...homework, className: cls.name }
  });

  res.json(success(homework, '作业发布成功'));
});

router.put('/:id', authMiddleware, requireRole(['teacher', 'admin', 'super_admin']), (req, res) => {
  const { title, content, subject_id, due_date, attachments, status } = req.body;
  const user = db.queryOne('users', { id: req.user.id });
  const hw = db.queryOne('homework', { id: req.params.id });

  if (!hw) {
    return res.status(404).json(error('作业不存在'));
  }

  if (hw.teacher_id !== user.id && !['admin', 'super_admin'].includes(user.role)) {
    return res.status(403).json(error('您没有权限修改此作业'));
  }

  const updated = db.update('homework', req.params.id, {
    title, content, subject_id, due_date,
    attachments: attachments ? JSON.stringify(attachments) : undefined,
    status
  });

  broadcastUpdate({
    type: 'homework_updated',
    payload: updated
  });

  res.json(success(updated, '作业更新成功'));
});

router.delete('/:id', authMiddleware, requireRole(['teacher', 'admin', 'super_admin']), (req, res) => {
  const user = db.queryOne('users', { id: req.user.id });
  const hw = db.queryOne('homework', { id: req.params.id });

  if (!hw) {
    return res.status(404).json(error('作业不存在'));
  }

  if (hw.teacher_id !== user.id && !['admin', 'super_admin'].includes(user.role)) {
    return res.status(403).json(error('您没有权限删除此作业'));
  }

  db.remove('homework', req.params.id);

  broadcastUpdate({
    type: 'homework_deleted',
    payload: { id: req.params.id }
  });

  res.json(success(null, '作业删除成功'));
});

let wss = null;
function setWSS(wsServer) { wss = wsServer; }
function broadcastUpdate(data) {
  if (!wss) return;
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(msg);
  });
}

module.exports = { router, setWSS };
