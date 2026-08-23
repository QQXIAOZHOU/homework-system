const express = require('express');
const db = require('../database/init');
const { success, error } = require('../utils/helpers');
const { authMiddleware, optionalAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function formatNotice(n) {
  const author = db.queryOne('users', { id: n.author_id });
  const cls = n.class_id ? db.queryOne('classes', { id: n.class_id }) : null;
  const grade = cls ? db.queryOne('grades', { id: cls.grade_id }) : null;
  
  let type = 'notice';
  if (n.type) {
    type = n.type;
  } else if (n.is_important) {
    type = 'announcement';
  }
  
  return {
    ...n,
    type,
    authorName: author?.real_name || '管理员',
    author_name: author?.real_name || '管理员',
    className: cls?.name || null,
    class_name: cls?.name || null,
    gradeName: grade?.name || null,
    grade_name: grade?.name || null,
    classId: n.class_id,
    class_id: n.class_id,
    gradeId: cls?.grade_id || null,
    grade_id: cls?.grade_id || null,
    is_important: !!n.is_important || n.type === 'urgent' || n.type === 'announcement',
    views: n.views || 0
  };
}

router.get('/', optionalAuth, (req, res) => {
  let class_id = req.query.class_id || req.query.classId;
  let grade_id = req.query.grade_id || req.query.gradeId;
  let page = parseInt(req.query.page) || 1;
  let pageSize = parseInt(req.query.pageSize) || 20;
  let important = req.query.important;
  
  let notices = db.query('notices').filter(n => n.status === 'published');
  
  if (class_id) {
    const cls = db.queryOne('classes', { id: class_id });
    const gradeClassIds = cls ? db.query('classes', { grade_id: cls.grade_id }).map(c => c.id) : [];
    notices = notices.filter(n => 
      n.scope === 'school' || n.scope === 'all' ||
      class_id === n.class_id || 
      (n.scope === 'grade' && gradeClassIds.includes(n.class_id))
    );
  } else if (grade_id) {
    const classIds = db.query('classes', { grade_id }).map(c => c.id);
    notices = notices.filter(n => 
      n.scope === 'school' || n.scope === 'all' ||
      (n.scope === 'grade' && classIds.includes(n.class_id))
    );
  }
  
  if (important === 'true') notices = notices.filter(n => n.is_important === 1 || n.is_important === true || n.type === 'urgent' || n.type === 'announcement');
  
  notices.sort((a, b) => {
    const aImp = a.is_important || a.type === 'urgent' || a.type === 'announcement';
    const bImp = b.is_important || b.type === 'urgent' || b.type === 'announcement';
    if (aImp && !bImp) return -1;
    if (!aImp && bImp) return 1;
    if (a.type === 'urgent' && b.type !== 'urgent') return -1;
    if (b.type === 'urgent' && a.type !== 'urgent') return 1;
    return new Date(b.created_at) - new Date(a.created_at);
  });
  
  const total = notices.length;
  const start = (page - 1) * pageSize;
  const pagedNotices = notices.slice(start, start + parseInt(pageSize)).map(formatNotice);
  
  res.json(success({ 
    list: pagedNotices,
    notices: pagedNotices, 
    total, 
    page: parseInt(page), 
    pageSize: parseInt(pageSize) 
  }));
});

router.get('/:id', optionalAuth, (req, res) => {
  const notice = db.queryOne('notices', { id: req.params.id });
  if (!notice) {
    return res.status(404).json(error('公告不存在'));
  }

  db.update('notices', req.params.id, { views: (notice.views || 0) + 1 });
  res.json(success(formatNotice({ ...notice, views: (notice.views || 0) + 1 })));
});

router.post('/', authMiddleware, requireRole(['teacher', 'admin', 'super_admin']), (req, res) => {
  const { 
    title, content, 
    scope = 'class', 
    class_id, classId,
    grade_id, gradeId,
    is_important, isAllGrades, isAllClasses,
    type
  } = req.body;
  const user = db.queryOne('users', { id: req.user.id });

  if (!title || !content) {
    return res.status(400).json(error('请填写标题和内容'));
  }

  let finalScope = scope;
  if (scope === 'all' || isAllGrades) finalScope = 'school';
  else if (scope === 'grade') finalScope = 'grade';
  else if (scope === 'class') finalScope = 'class';

  let targetClassId = null;
  let targetGradeId = grade_id || gradeId || null;
  
  if (finalScope === 'class') {
    targetClassId = class_id || classId || user.class_id;
    if (!targetClassId) {
      return res.status(400).json(error('请选择发布班级'));
    }
    const cls = db.queryOne('classes', { id: targetClassId });
    if (cls) targetGradeId = cls.grade_id;
  }

  const finalIsImportant = is_important || type === 'urgent' || type === 'announcement' ? 1 : 0;

  const notice = db.insert('notices', {
    title,
    content,
    scope: finalScope,
    class_id: targetClassId,
    grade_id: targetGradeId,
    author_id: user.id,
    type: type || (finalIsImportant ? 'announcement' : 'notice'),
    is_important: finalIsImportant,
    views: 0,
    status: 'published'
  });

  broadcastNotice({
    type: 'notice_created',
    payload: formatNotice(notice)
  });

  res.json(success(formatNotice(notice), '公告发布成功'));
});

router.put('/:id', authMiddleware, requireRole(['teacher', 'admin', 'super_admin']), (req, res) => {
  const { 
    title, content, scope, 
    class_id, classId,
    grade_id, gradeId,
    is_important, status, type 
  } = req.body;
  const user = db.queryOne('users', { id: req.user.id });
  const notice = db.queryOne('notices', { id: req.params.id });

  if (!notice) {
    return res.status(404).json(error('公告不存在'));
  }

  if (notice.author_id !== user.id && !['admin', 'super_admin'].includes(user.role)) {
    return res.status(403).json(error('您没有权限修改此公告'));
  }

  const updates = {};
  if (title !== undefined) updates.title = title;
  if (content !== undefined) updates.content = content;
  if (scope !== undefined) updates.scope = scope;
  if (class_id !== undefined || classId !== undefined) updates.class_id = class_id || classId || null;
  if (grade_id !== undefined || gradeId !== undefined) updates.grade_id = grade_id || gradeId || null;
  if (is_important !== undefined || type !== undefined) {
    updates.is_important = is_important || type === 'urgent' || type === 'announcement' ? 1 : 0;
    if (type) updates.type = type;
  }
  if (status !== undefined) updates.status = status;

  const updated = db.update('notices', req.params.id, updates);
  res.json(success(formatNotice(updated), '公告更新成功'));
});

router.delete('/:id', authMiddleware, requireRole(['teacher', 'admin', 'super_admin']), (req, res) => {
  const user = db.queryOne('users', { id: req.user.id });
  const notice = db.queryOne('notices', { id: req.params.id });

  if (!notice) {
    return res.status(404).json(error('公告不存在'));
  }

  if (notice.author_id !== user.id && !['admin', 'super_admin'].includes(user.role)) {
    return res.status(403).json(error('您没有权限删除此公告'));
  }

  db.remove('notices', req.params.id);
  res.json(success(null, '公告删除成功'));
});

let wss = null;
function setWSS(wsServer) { wss = wsServer; }
function broadcastNotice(data) {
  if (!wss) return;
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(msg);
  });
}

module.exports = { router, setWSS };
