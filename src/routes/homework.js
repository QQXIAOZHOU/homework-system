const express = require('express');
const db = require('../database/init');
const { success, error } = require('../utils/helpers');
const { authMiddleware, optionalAuth, requireRole, canAccessClass } = require('../middleware/auth');

const router = express.Router();

function formatHomework(h) {
  const subject = db.queryOne('subjects', { id: h.subject_id });
  const teacher = db.queryOne('users', { id: h.teacher_id });
  const cls = db.queryOne('classes', { id: h.class_id });
  const grade = cls ? db.queryOne('grades', { id: cls.grade_id }) : null;
  
  let links = [];
  let attachments = [];
  try {
    links = h.links ? JSON.parse(h.links) : [];
  } catch (e) { links = []; }
  try {
    attachments = h.attachments ? JSON.parse(h.attachments) : [];
  } catch (e) { attachments = []; }
  
  return {
    ...h,
    links,
    attachments,
    subject_id: h.subject_id,
    subject_name: subject?.name || '未知科目',
    subjectName: subject?.name || '未知科目',
    teacher_id: h.teacher_id,
    teacher_name: teacher?.real_name || '未知教师',
    teacherName: teacher?.real_name || '未知教师',
    class_id: h.class_id,
    class_name: cls?.name || '未知班级',
    className: cls?.name || '未知班级',
    grade_id: cls?.grade_id || null,
    gradeId: cls?.grade_id || null,
    grade_name: grade?.name || null,
    gradeName: grade?.name || null,
    deadline: h.due_date || h.deadline || null,
    view_count: h.view_count || 0,
    viewCount: h.view_count || 0,
    created_at: h.created_at
  };
}

router.get('/', optionalAuth, (req, res) => {
  let class_id = req.query.class_id || req.query.classId;
  let grade_id = req.query.grade_id || req.query.gradeId;
  let subject_id = req.query.subject_id || req.query.subjectId;
  let date = req.query.date;
  let page = parseInt(req.query.page) || 1;
  let pageSize = parseInt(req.query.pageSize) || 20;
  
  let homework = db.query('homework');
  if (req.user && !['admin', 'super_admin', 'teacher'].includes(req.user.role)) {
    homework = homework.filter(h => h.status === 'published');
  } else if (!req.user) {
    homework = homework.filter(h => h.status === 'published');
  }
  
  if (class_id) {
    homework = homework.filter(h => h.class_id === class_id);
  } else if (grade_id) {
    const classIds = db.query('classes', { grade_id }).map(c => c.id);
    homework = homework.filter(h => classIds.includes(h.class_id));
  }
  
  if (subject_id) homework = homework.filter(h => h.subject_id === subject_id);
  if (date) homework = homework.filter(h => (h.due_date || h.created_at || '').startsWith(date));
  
  homework.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  
  const total = homework.length;
  const start = (page - 1) * pageSize;
  const pagedHw = homework.slice(start, start + pageSize).map(formatHomework);
  
  res.json(success({ 
    list: pagedHw, 
    homework: pagedHw,
    total, 
    page, 
    pageSize 
  }));
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
  
  const result = homework.map(formatHomework);
  
  res.json(success(result));
});

router.get('/:id', optionalAuth, (req, res) => {
  const hw = db.queryOne('homework', { id: req.params.id });
  if (!hw) {
    return res.status(404).json(error('作业不存在'));
  }

  db.update('homework', req.params.id, { view_count: (hw.view_count || 0) + 1 });
  
  res.json(success(formatHomework({ ...hw, view_count: (hw.view_count || 0) + 1 })));
});

router.post('/', authMiddleware, requireRole(['teacher', 'admin', 'super_admin']), (req, res) => {
  const { 
    title, content, 
    class_id, classId, 
    subject_id, subjectId, subjectName,
    due_date, deadline,
    links, attachments,
    status
  } = req.body;
  const user = db.queryOne('users', { id: req.user.id });

  const finalClassId = class_id || classId;
  if (!title || !content || !finalClassId) {
    return res.status(400).json(error('请填写完整信息（标题、内容、班级）'));
  }

  const cls = db.queryOne('classes', { id: finalClassId });
  if (!cls) {
    return res.status(400).json(error('班级不存在'));
  }

  if (!canAccessClass(user, finalClassId) && !['admin', 'super_admin'].includes(user.role)) {
    return res.status(403).json(error('您没有权限在该班级发布作业'));
  }

  let finalSubjectId = subject_id || subjectId;
  if (!finalSubjectId && subjectName) {
    const subject = db.queryOne('subjects', { name: subjectName });
    finalSubjectId = subject?.id || null;
  }
  if (!finalSubjectId && user.subject_id) {
    finalSubjectId = user.subject_id;
  }

  const homework = db.insert('homework', {
    title,
    content,
    class_id: finalClassId,
    grade_id: cls.grade_id,
    subject_id: finalSubjectId || null,
    teacher_id: user.id,
    due_date: due_date || deadline || null,
    links: links ? JSON.stringify(links) : null,
    attachments: attachments ? JSON.stringify(attachments) : null,
    view_count: 0,
    status: status || 'published'
  });

  broadcastUpdate({
    type: 'homework_created',
    payload: formatHomework(homework)
  });

  res.json(success(formatHomework(homework), '作业发布成功'));
});

router.put('/:id', authMiddleware, requireRole(['teacher', 'admin', 'super_admin']), (req, res) => {
  const { 
    title, content, 
    subject_id, subjectId,
    due_date, deadline,
    links, attachments, 
    status 
  } = req.body;
  const user = db.queryOne('users', { id: req.user.id });
  const hw = db.queryOne('homework', { id: req.params.id });

  if (!hw) {
    return res.status(404).json(error('作业不存在'));
  }

  if (hw.teacher_id !== user.id && !['admin', 'super_admin'].includes(user.role)) {
    return res.status(403).json(error('您没有权限修改此作业'));
  }

  const updates = {};
  if (title !== undefined) updates.title = title;
  if (content !== undefined) updates.content = content;
  if (subject_id !== undefined || subjectId !== undefined) updates.subject_id = subject_id || subjectId;
  if (due_date !== undefined || deadline !== undefined) updates.due_date = due_date || deadline;
  if (links !== undefined) updates.links = JSON.stringify(links || []);
  if (attachments !== undefined) updates.attachments = JSON.stringify(attachments || []);
  if (status !== undefined) updates.status = status;

  const updated = db.update('homework', req.params.id, updates);

  broadcastUpdate({
    type: 'homework_updated',
    payload: formatHomework(updated)
  });

  res.json(success(formatHomework(updated), '作业更新成功'));
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
