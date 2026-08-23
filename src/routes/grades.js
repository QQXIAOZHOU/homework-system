const express = require('express');
const db = require('../database/init');
const { success, error } = require('../utils/helpers');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', (req, res) => {
  const grades = db.query('grades').sort((a, b) => a.order_num - b.order_num);
  res.json(success(grades));
});

router.get('/:id/classes', (req, res) => {
  const classes = db.query('classes', { grade_id: req.params.id }).sort((a, b) => a.class_num - b.class_num);
  res.json(success(classes));
});

router.get('/classes/all', (req, res) => {
  const grades = db.query('grades').sort((a, b) => a.order_num - b.order_num);
  const classes = db.query('classes');
  
  const result = grades.map(g => ({
    ...g,
    classes: classes.filter(c => c.grade_id === g.id).sort((a, b) => a.class_num - b.class_num)
  }));
  
  res.json(success(result));
});

router.get('/subjects', (req, res) => {
  const subjects = db.query('subjects');
  res.json(success(subjects));
});

router.post('/', authMiddleware, requireRole(['admin', 'super_admin']), (req, res) => {
  const { name, level } = req.body;
  if (!name || !level) {
    return res.status(400).json(error('请填写完整信息'));
  }

  const existing = db.queryOne('grades', { level });
  if (existing) {
    return res.status(400).json(error('该年级已存在'));
  }

  const maxOrder = Math.max(...db.query('grades').map(g => g.order_num), 0);
  const grade = db.insert('grades', { name, level: parseInt(level), order_num: maxOrder + 1 });
  res.json(success(grade, '年级创建成功'));
});

router.post('/:id/classes', authMiddleware, requireRole(['admin', 'super_admin']), (req, res) => {
  const { name, class_num } = req.body;
  if (!name || !class_num) {
    return res.status(400).json(error('请填写完整信息'));
  }

  const grade = db.queryOne('grades', { id: req.params.id });
  if (!grade) {
    return res.status(404).json(error('年级不存在'));
  }

  const existing = db.queryOne('classes', { grade_id: req.params.id, class_num: parseInt(class_num) });
  if (existing) {
    return res.status(400).json(error('该班级已存在'));
  }

  const cls = db.insert('classes', {
    grade_id: req.params.id,
    name,
    class_num: parseInt(class_num)
  });
  res.json(success(cls, '班级创建成功'));
});

router.put('/classes/:id', authMiddleware, requireRole(['admin', 'super_admin']), (req, res) => {
  const { name, class_num } = req.body;
  const cls = db.queryOne('classes', { id: req.params.id });
  if (!cls) {
    return res.status(404).json(error('班级不存在'));
  }

  const updated = db.update('classes', req.params.id, { name, class_num: parseInt(class_num) });
  res.json(success(updated, '班级更新成功'));
});

router.delete('/classes/:id', authMiddleware, requireRole(['super_admin']), (req, res) => {
  const cls = db.queryOne('classes', { id: req.params.id });
  if (!cls) {
    return res.status(404).json(error('班级不存在'));
  }

  const userCount = db.count('users', { class_id: req.params.id });
  if (userCount > 0) {
    return res.status(400).json(error('该班级下还有用户，无法删除'));
  }

  const hwCount = db.count('homework', { class_id: req.params.id });
  if (hwCount > 0) {
    return res.status(400).json(error('该班级下还有作业记录，无法删除'));
  }

  db.remove('classes', req.params.id);
  res.json(success(null, '班级删除成功'));
});

module.exports = router;
