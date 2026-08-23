const express = require('express');
const db = require('../database/init');
const { success, error } = require('../utils/helpers');
const { authMiddleware, optionalAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', optionalAuth, (req, res) => {
  const { class_id, grade_id, page = 1, pageSize = 20, important } = req.query;
  
  let notices = db.query('notices');
  
  if (class_id) {
    notices = notices.filter(n => n.class_id === class_id || n.scope === 'school' || n.scope === 'grade');
    const classIds = db.query('classes', { grade_id: db.queryOne('classes', { id: class_id })?.grade_id }).map(c => c.id);
    notices = notices.filter(n => n.scope === 'school' || class_id === n.class_id || (n.scope === 'grade' && classIds.includes(n.class_id)));
  } else if (grade_id) {
    const classIds = db.query('classes', { grade_id }).map(c => c.id);
    notices = notices.filter(n => n.scope === 'school' || (n.scope === 'grade' && classIds.includes(n.class_id)));
  }
  
  if (important === 'true') notices = notices.filter(n => n.is_important === 1 || n.is_important === true);
  
  notices.sort((a, b) => {
    if (a.is_important && !b.is_important) return -1;
    if (!a.is_important && b.is_important) return 1;
    return new Date(b.created_at) - new Date(a.created_at);
  });
  
  const total = notices.length;
  const start = (page - 1) * pageSize;
  const pagedNotices = notices.slice(start, start + parseInt(pageSize)).map(n => {
    const author = db.queryOne('users', { id: n.author_id });
    const cls = n.class_id ? db.queryOne('classes', { id: n.class_id }) : null;
    return {
      ...n,
      authorName: author?.real_name || '管理员',
      className: cls?.name || null,
      is_important: !!n.is_important
    };
  });
  
  res.json(success({ notices: pagedNotices, total, page: parseInt(page), pageSize: parseInt(pageSize) }));
});

router.get('/:id', optionalAuth, (req, res) => {
  const notice = db.queryOne('notices', { id: req.params.id });
  if (!notice) {
    return res.status(404).json(error('公告不存在'));
  }

  const author = db.queryOne('users', { id: notice.author_id });
  const cls = notice.class_id ? db.queryOne('classes', { id: notice.class_id }) : null;

  db.update('notices', req.params.id, { views: (notice.views || 0) + 1 });

  res.json(success({
    ...notice,
    authorName: author?.real_name || '管理员',
    className: cls?.name || null,
    is_important: !!notice.is_important
  }));
});

router.post('/', authMiddleware, requireRole(['teacher', 'admin', 'super_admin']), (req, res) => {
  const { title, content, scope = 'class', class_id, is_important } = req.body;
  const user = db.queryOne('users', { id: req.user.id });

  if (!title || !content) {
    return res.status(400).json(error('请填写标题和内容'));
  }

  let targetClassId = null;
  if (scope === 'class') {
    targetClassId = class_id || user.class_id;
    if (!targetClassId) {
      return res.status(400).json(error('请选择发布班级'));
    }
  }

  const notice = db.insert('notices', {
    title,
    content,
    scope,
    class_id: targetClassId,
    author_id: user.id,
    is_important: is_important ? 1 : 0,
    views: 0,
    status: 'published'
  });

  broadcastNotice({
    type: 'notice_created',
    payload: notice
  });

  res.json(success(notice, '公告发布成功'));
});

router.put('/:id', authMiddleware, requireRole(['teacher', 'admin', 'super_admin']), (req, res) => {
  const { title, content, scope, class_id, is_important, status } = req.body;
  const user = db.queryOne('users', { id: req.user.id });
  const notice = db.queryOne('notices', { id: req.params.id });

  if (!notice) {
    return res.status(404).json(error('公告不存在'));
  }

  if (notice.author_id !== user.id && !['admin', 'super_admin'].includes(user.role)) {
    return res.status(403).json(error('您没有权限修改此公告'));
  }

  const updated = db.update('notices', req.params.id, { title, content, scope, class_id, is_important: is_important ? 1 : 0, status });
  res.json(success(updated, '公告更新成功'));
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
