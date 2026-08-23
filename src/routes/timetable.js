const express = require('express');
const db = require('../database/init');
const { success, error } = require('../utils/helpers');
const { authMiddleware, optionalAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const WEEKDAYS = [
  { id: 1, name: '周一', short: '一' },
  { id: 2, name: '周二', short: '二' },
  { id: 3, name: '周三', short: '三' },
  { id: 4, name: '周四', short: '四' },
  { id: 5, name: '周五', short: '五' },
  { id: 6, name: '周六', short: '六' },
  { id: 7, name: '周日', short: '日' }
];

router.get('/time-slots', (req, res) => {
  const slots = db.query('time_slots').sort((a, b) => a.order_num - b.order_num);
  res.json(success({ slots, weekdays: WEEKDAYS }));
});

router.put('/time-slots', authMiddleware, requireRole(['admin', 'super_admin']), (req, res) => {
  const { slots } = req.body;
  if (!Array.isArray(slots)) {
    return res.status(400).json(error('参数格式错误'));
  }

  const existingSlots = db.query('time_slots');
  existingSlots.forEach(s => db.remove('time_slots', s.id));

  slots.forEach((slot, i) => {
    db.insert('time_slots', {
      name: slot.name,
      start_time: slot.start_time,
      end_time: slot.end_time,
      period_type: slot.period_type || 'class',
      order_num: i + 1
    });
  });

  const newSlots = db.query('time_slots').sort((a, b) => a.order_num - b.order_num);
  res.json(success(newSlots, '作息时间更新成功'));
});

router.get('/:classId', optionalAuth, (req, res) => {
  const classId = req.params.classId;
  const { week_type } = req.query;

  const cls = db.queryOne('classes', { id: classId });
  if (!cls) return res.status(404).json(error('班级不存在'));

  const slots = db.query('time_slots').sort((a, b) => a.order_num - b.order_num);
  let entries = db.query('timetable_entries', { class_id: classId });

  if (week_type) {
    entries = entries.filter(e => e.week_type === week_type || e.week_type === 'all');
  }

  const subjectMap = {};
  db.query('subjects').forEach(s => { subjectMap[s.id] = s; });

  const grid = {};
  slots.forEach(slot => {
    grid[slot.id] = {};
    WEEKDAYS.forEach(d => {
      const entry = entries.find(e => e.slot_id === slot.id && e.weekday === d.id);
      if (entry) {
        const subject = subjectMap[entry.subject_id];
        grid[slot.id][d.id] = {
          ...entry,
          subjectName: subject?.name || '',
          subjectCode: subject?.code || '',
          subjectColor: null
        };
      } else {
        grid[slot.id][d.id] = null;
      }
    });
  });

  res.json(success({
    classId,
    className: cls.name,
    slots,
    weekdays: WEEKDAYS,
    grid,
    subjects: db.query('subjects')
  }));
});

router.post('/:classId/entry', authMiddleware, requireRole(['teacher', 'admin', 'super_admin']), (req, res) => {
  const classId = req.params.classId;
  const { slot_id, weekday, subject_id, week_type = 'all', classroom = '', teacher_name = '' } = req.body;

  if (!slot_id || !weekday || !subject_id) {
    return res.status(400).json(error('请填写完整信息'));
  }

  const existing = db.query('timetable_entries', {
    class_id: classId, slot_id, weekday: parseInt(weekday), week_type
  })[0];

  if (existing) {
    const updated = db.update('timetable_entries', existing.id, {
      subject_id, classroom, teacher_name
    });
    return res.json(success(updated, '课程更新成功'));
  }

  const entry = db.insert('timetable_entries', {
    class_id: classId,
    slot_id,
    weekday: parseInt(weekday),
    subject_id,
    week_type,
    classroom,
    teacher_name
  });

  res.json(success(entry, '课程添加成功'));
});

router.delete('/:classId/entry/:entryId', authMiddleware, requireRole(['teacher', 'admin', 'super_admin']), (req, res) => {
  db.remove('timetable_entries', req.params.entryId);
  res.json(success(null, '课程删除成功'));
});

router.put('/:classId/batch', authMiddleware, requireRole(['admin', 'super_admin']), (req, res) => {
  const classId = req.params.classId;
  const { entries } = req.body;

  if (!Array.isArray(entries)) {
    return res.status(400).json(error('参数格式错误'));
  }

  const oldEntries = db.query('timetable_entries', { class_id: classId });
  oldEntries.forEach(e => db.remove('timetable_entries', e.id));

  entries.forEach(e => {
    if (e.subject_id) {
      db.insert('timetable_entries', {
        class_id: classId,
        slot_id: e.slot_id,
        weekday: parseInt(e.weekday),
        subject_id: e.subject_id,
        week_type: e.week_type || 'all',
        classroom: e.classroom || '',
        teacher_name: e.teacher_name || ''
      });
    }
  });

  res.json(success(null, '课表批量更新成功'));
});

router.get('/:classId/export/classisland', (req, res) => {
  const classId = req.params.classId;
  const cls = db.queryOne('classes', { id: classId });
  if (!cls) return res.status(404).json(error('班级不存在'));

  const slots = db.query('time_slots').sort((a, b) => a.order_num - b.order_num);
  const entries = db.query('timetable_entries', { class_id: classId });
  const subjects = db.query('subjects');
  const grade = db.queryOne('grades', { id: cls.grade_id });

  const ciSubjects = subjects.map(s => ({
    Name: s.name,
    Initial: s.name.charAt(0),
    SubjectCode: s.code,
    TeacherName: '',
    IsOutdoor: s.code === 'tiyu',
    ColorHex: getSubjectColorHex(s.name)
  }));

  const ciTimeLayouts = slots.map(s => ({
    StartTime: { Hours: parseInt(s.start_time.split(':')[0]), Minutes: parseInt(s.start_time.split(':')[1]), Seconds: 0 },
    EndTime: { Hours: parseInt(s.end_time.split(':')[0]), Minutes: parseInt(s.end_time.split(':')[1]), Seconds: 0 },
    IsClassClassifying: s.period_type === 'break',
    TimeType: s.period_type === 'lunch' ? 2 : (s.period_type === 'break' ? 1 : 0),
    Name: s.name
  }));

  const classLayout = [];
  const slotsByOrder = slots.filter(s => s.period_type === 'class').sort((a, b) => a.order_num - b.order_num);

  for (let day = 1; day <= 5; day++) {
    const dayClasses = [];
    slotsByOrder.forEach(slot => {
      const entry = entries.find(e => e.slot_id === slot.id && e.weekday === day);
      if (entry) {
        const subject = subjects.find(s => s.id === entry.subject_id);
        dayClasses.push({
          Subject: { Name: subject?.name || '', Initial: subject?.name?.charAt(0) || '' },
          Classroom: entry.classroom || '',
          TeacherName: entry.teacher_name || ''
        });
      } else {
        dayClasses.push(null);
      }
    });
    classLayout.push(dayClasses);
  }

  const ciProfile = {
    Version: 1,
    Id: classId,
    Name: `${cls.name}课程表`,
    SchoolName: '南通市崇川初级中学',
    TimeLayouts: ciTimeLayouts,
    Subjects: ciSubjects,
    ClassPlan: {
      Version: 1,
      Id: `plan-${classId}`,
      Name: `${cls.name}课表`,
      TimeLayoutId: 'default',
      IsActivated: true,
      Layouts: {
        DefaultLayout: classLayout
      },
      OverlayLayouts: [],
      EnableTempClassPlan: false,
      TempClassPlan: null,
      TimeRule: null
    }
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${cls.name}-ClassIsland课表.json"`);
  res.json(ciProfile);
});

function getSubjectColorHex(subjectName) {
  const colors = {
    '语文': '#E8463A', '数学': '#4B3FE3', '英语': '#22A5F7',
    '物理': '#1DC981', '化学': '#F87454', '生物': '#27D2BF',
    '道德与法治': '#EFAA17', '历史': '#8B5CF6', '地理': '#06B6D4',
    '体育': '#84CC16', '音乐': '#EC4899', '美术': '#F97316',
    '信息技术': '#6366F1'
  };
  return colors[subjectName] || '#64748B';
}

router.post('/import/classisland', authMiddleware, requireRole(['admin', 'super_admin']), (req, res) => {
  const { class_id, profile } = req.body;

  if (!class_id || !profile) {
    return res.status(400).json(error('请提供班级ID和课表数据'));
  }

  const cls = db.queryOne('classes', { id: class_id });
  if (!cls) return res.status(404).json(error('班级不存在'));

  res.json(success({ message: '导入功能开发中' }, 'ClassIsland课表导入成功'));
});

module.exports = router;
