const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

function generateId() {
  return uuidv4();
}

const SUBJECT_DEFAULTS = {
  '语文': { initial: '语', color: '#E53935' },
  '数学': { initial: '数', color: '#1E88E5' },
  '英语': { initial: '英', color: '#43A047' },
  '物理': { initial: '物', color: '#8E24AA' },
  '化学': { initial: '化', color: '#00897B' },
  '生物': { initial: '生', color: '#7CB342' },
  '政治': { initial: '政', color: '#F4511E' },
  '历史': { initial: '史', color: '#6D4C41' },
  '地理': { initial: '地', color: '#00ACC1' },
  '体育': { initial: '体', color: '#FF7043', isOutdoor: true },
  '音乐': { initial: '音', color: '#EC407A' },
  '美术': { initial: '美', color: '#AB47BC' },
  '信息': { initial: '信', color: '#26A69A' },
  '班会': { initial: '班', color: '#5C6BC0' },
  '自习': { initial: '自', color: '#78909C' },
  '阅读': { initial: '阅', color: '#EF6C00' },
  '劳动': { initial: '劳', color: '#9CCC65', isOutdoor: true }
};

function createSubject(name, teacherName = '') {
  const defaults = SUBJECT_DEFAULTS[name] || { initial: name.charAt(0), color: '#5C6BC0' };
  return {
    Name: name,
    Initial: defaults.initial,
    TeacherName: teacherName,
    IsOutDoor: defaults.isOutdoor || false,
    AttachedObjects: {
      "58e5b69a-764a-472b-bcf7-003b6a8c7fdf": {
        IsAttachSettingsEnabled: false,
        ShowExtraInfoOnTimePoint: true,
        ExtraInfoType: 0,
        IsCountdownEnabled: true,
        CountdownSeconds: 60,
        IsActive: false
      },
      "08f0d9c3-c770-4093-a3d0-02f3d90c24bc": {
        IsClassOnNotificationEnabled: true,
        IsClassOnPreparingNotificationEnabled: true,
        IsClassOffNotificationEnabled: true,
        ClassPreparingDeltaTime: 60,
        ClassOnPreparingText: "准备上课，请回到座位并保持安静，做好上课准备。",
        IsAttachSettingsEnabled: false,
        IsActive: false
      }
    },
    IsActive: false,
    _color: defaults.color
  };
}

function createTimePoint(startTime, endTime, type = 0, subjectId = null) {
  const baseDate = '2023-08-20';
  return {
    StartSecond: `${baseDate}T${startTime}+08:00`,
    EndSecond: `${baseDate}T${endTime}+08:00`,
    TimeType: type,
    IsHideDefault: type === 0 ? false : true,
    DefaultClassId: type === 0 ? subjectId : "9875b24c-470d-4195-8a6a-73925ea4808b",
    AttachedObjects: {
      "08f0d9c3-c770-4093-a3d0-02f3d90c24bc": {
        IsClassOnNotificationEnabled: true,
        IsClassOnPreparingNotificationEnabled: true,
        IsClassOffNotificationEnabled: true,
        ClassPreparingDeltaTime: 60,
        ClassOnPreparingText: "准备上课，请回到座位并保持安静，做好上课准备。",
        IsAttachSettingsEnabled: false,
        IsActive: false
      },
      "7625de96-38aa-4b71-b478-3f156dd9458d": {
        AlertShowMode: 2,
        ForecastShowMode: 1,
        IsAttachSettingsEnabled: true,
        IsActive: false
      },
      "58e5b69a-764a-472b-bcf7-003b6a8c7fdf": {
        IsAttachSettingsEnabled: false,
        ShowExtraInfoOnTimePoint: true,
        ExtraInfoType: 0,
        IsCountdownEnabled: true,
        CountdownSeconds: 60,
        IsActive: false
      }
    },
    IsActive: false
  };
}

router.get('/slots', (req, res) => {
  try {
    const db = req.app.get('db');
    const slots = db.query('time_slots', { is_active: true }).sort((a, b) => a.order_num - b.order_num);
    res.json({
      success: true,
      message: '操作成功',
      data: slots.map(s => ({
        ...s,
        startTime: s.start_time,
        endTime: s.end_time,
        periodType: s.period_type,
        orderNum: s.order_num
      }))
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.post('/slots', (req, res) => {
  try {
    const db = req.app.get('db');
    const { name, startTime, endTime, periodType = 'class', orderNum } = req.body;
    if (!name || !startTime || !endTime) {
      return res.status(400).json({ success: false, message: '请填写完整信息' });
    }
    const maxOrder = Math.max(0, ...db.query('time_slots').map(s => s.order_num || 0));
    const slot = db.insert('time_slots', {
      id: generateId(),
      name,
      start_time: startTime,
      end_time: endTime,
      period_type: periodType,
      order_num: orderNum || maxOrder + 1,
      is_active: true,
      created_at: new Date().toISOString()
    });
    res.json({ success: true, message: '创建成功', data: slot });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.put('/slots/:id', (req, res) => {
  try {
    const db = req.app.get('db');
    const { name, startTime, endTime, periodType, orderNum } = req.body;
    const update = {};
    if (name) update.name = name;
    if (startTime) update.start_time = startTime;
    if (endTime) update.end_time = endTime;
    if (periodType) update.period_type = periodType;
    if (orderNum) update.order_num = orderNum;
    db.update('time_slots', { id: req.params.id }, update);
    res.json({ success: true, message: '更新成功' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.delete('/slots/:id', (req, res) => {
  try {
    const db = req.app.get('db');
    db.delete('time_slots', { id: req.params.id });
    db.delete('timetable_entries', { time_slot_id: req.params.id });
    res.json({ success: true, message: '删除成功' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.get('/list', (req, res) => {
  try {
    const db = req.app.get('db');
    const { classId } = req.query;
    let timetables = db.query('timetables');
    if (classId) {
      timetables = timetables.filter(t => t.class_id === classId);
    }
    timetables.forEach(t => {
      const grade = db.queryOne('grades', { id: t.grade_id });
      const cls = db.queryOne('classes', { id: t.class_id });
      t.gradeName = grade?.name || '';
      t.className = cls?.name || '';
      t.entries = db.query('timetable_entries', { timetable_id: t.id });
    });
    res.json({ success: true, message: '操作成功', data: timetables });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.get('/class/:classId', (req, res) => {
  try {
    const db = req.app.get('db');
    const classId = req.params.classId;
    let timetable = db.queryOne('timetables', { class_id: classId, is_active: true });
    if (!timetable) {
      return res.json({
        success: true,
        message: '暂无课表',
        data: { timetable: null, entries: [], slots: [] }
      });
    }
    const slots = db.query('time_slots', { is_active: true }).sort((a, b) => a.order_num - b.order_num);
    const entries = db.query('timetable_entries', { timetable_id: timetable.id });
    res.json({
      success: true,
      message: '操作成功',
      data: {
        timetable: { ...timetable, gradeName: db.queryOne('grades', { id: timetable.grade_id })?.name, className: db.queryOne('classes', { id: classId })?.name },
        entries: entries.map(e => ({
          ...e,
          subjectName: e.subject_name,
          timeSlotId: e.time_slot_id,
          weekDay: e.week_day,
          weekType: e.week_type
        })),
        slots: slots.map(s => ({
          ...s,
          startTime: s.start_time,
          endTime: s.end_time,
          periodType: s.period_type,
          orderNum: s.order_num
        }))
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.post('/save', (req, res) => {
  try {
    const db = req.app.get('db');
    const { classId, gradeId, name, entries } = req.body;
    if (!classId || !gradeId) {
      return res.status(400).json({ success: false, message: '请选择班级' });
    }
    let timetable = db.queryOne('timetables', { class_id: classId });
    if (timetable) {
      db.update('timetables', { id: timetable.id }, {
        name: name || '默认课表',
        updated_at: new Date().toISOString()
      });
      db.delete('timetable_entries', { timetable_id: timetable.id });
    } else {
      timetable = db.insert('timetables', {
        id: generateId(),
        grade_id: gradeId,
        class_id: classId,
        name: name || '默认课表',
        week_type: 'all',
        is_active: true,
        created_at: new Date().toISOString()
      });
    }
    if (entries && entries.length > 0) {
      entries.forEach(e => {
        if (e.subjectId || e.subjectName) {
          db.insert('timetable_entries', {
            id: generateId(),
            timetable_id: timetable.id,
            time_slot_id: e.timeSlotId,
            subject_id: e.subjectId || null,
            subject_name: e.subjectName || '',
            teacher_name: e.teacherName || '',
            week_day: e.weekDay,
            week_type: e.weekType || 'all',
            created_at: new Date().toISOString()
          });
        }
      });
    }
    res.json({ success: true, message: '保存成功', data: timetable });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.get('/export/classisland/:classId', (req, res) => {
  try {
    const db = req.app.get('db');
    const classId = req.params.classId;
    const cls = db.queryOne('classes', { id: classId });
    const grade = db.queryOne('grades', { id: cls?.grade_id });
    if (!cls) {
      return res.status(404).json({ success: false, message: '班级不存在' });
    }
    const timetable = db.queryOne('timetables', { class_id: classId, is_active: true });
    const slots = db.query('time_slots', { is_active: true }).sort((a, b) => a.order_num - b.order_num);
    const entries = timetable ? db.query('timetable_entries', { timetable_id: timetable.id }) : [];
    const subjects = db.query('subjects', { is_active: true });
    const subjectMap = {};
    const subjectIdMap = {};
    subjects.forEach(s => {
      const id = generateId();
      const subj = createSubject(s.name, '');
      subjectMap[id] = subj;
      subjectIdMap[s.id] = id;
    });
    const usedSubjectNames = new Set();
    entries.forEach(e => {
      if (e.subject_name && !Object.values(subjectMap).some(s => s.Name === e.subject_name)) {
        usedSubjectNames.add(e.subject_name);
      }
    });
    usedSubjectNames.forEach(name => {
      const id = generateId();
      subjectMap[id] = createSubject(name, '');
    });
    const breakSubjectId = "9875b24c-470d-4195-8a6a-73925ea4808b";
    subjectMap[breakSubjectId] = {
      Name: "课间休息",
      Initial: "休",
      TeacherName: "",
      IsOutDoor: false,
      AttachedObjects: {},
      IsActive: false,
      _color: '#90A4AE'
    };
    const timeLayoutId = generateId();
    const layouts = [];
    slots.forEach(slot => {
      let type = 0;
      if (slot.period_type === 'break') type = 2;
      else if (slot.period_type === 'lunch') type = 1;
      layouts.push(createTimePoint(slot.start_time, slot.end_time, type, breakSubjectId));
    });
    const timeLayouts = {
      [timeLayoutId]: {
        Name: `${grade?.name || ''}${cls.name}作息时间表`,
        Layouts: layouts,
        AttachedObjects: {},
        IsActive: false
      }
    };
    const classPlans = {};
    const weekDays = [0, 1, 2, 3, 4, 5, 6];
    const weekDayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    weekDays.forEach(wd => {
      const planId = generateId();
      const classSlotEntries = slots.filter(s => s.period_type === 'class');
      const classes = [];
      classSlotEntries.forEach(slot => {
        const entry = entries.find(e => e.time_slot_id === slot.id && e.week_day === wd);
        let subjectId = breakSubjectId;
        if (entry) {
          if (entry.subject_id && subjectIdMap[entry.subject_id]) {
            subjectId = subjectIdMap[entry.subject_id];
          } else {
            const found = Object.entries(subjectMap).find(([id, s]) => s.Name === entry.subject_name);
            if (found) subjectId = found[0];
          }
        }
        classes.push({ SubjectId: subjectId, IsActive: false });
      });
      classPlans[planId] = {
        TimeLayoutId: timeLayoutId,
        TimeRule: { WeekDay: wd, WeekCountDiv: 0, IsActive: false },
        Classes: classes,
        Name: weekDayNames[wd],
        IsOverlay: false,
        OverlaySourceId: null,
        OverlaySetupTime: new Date().toISOString(),
        IsEnabled: wd >= 1 && wd <= 5,
        AttachedObjects: {},
        IsActive: false
      };
    });
    const archive = {
      Name: `${grade?.name || ''}${cls.name}课表`,
      TimeLayouts: timeLayouts,
      ClassPlans: classPlans,
      Subjects: subjectMap,
      IsEnabled: true
    };
    const manifest = {
      ServerKind: 0,
      OrganizationName: "南通市崇川初级中学",
      ClassPlanSource: {
        Value: `classplans-${classId}.json`,
        Version: 1
      },
      TimeLayoutSource: {
        Value: `timelayouts-${classId}.json`,
        Version: 1
      },
      SubjectsSource: {
        Value: `subjects-${classId}.json`,
        Version: 1
      }
    };
    const exportData = {
      archive,
      manifest,
      subjects: { Name: "", TimeLayouts: {}, ClassPlans: {}, Subjects: subjectMap },
      timeLayouts: { Name: "", TimeLayouts: timeLayouts, ClassPlans: {}, Subjects: {} },
      classPlans: { Name: "", TimeLayouts: {}, ClassPlans: classPlans, Subjects: {} }
    };
    res.setHeader('Content-Disposition', `attachment; filename="classisland-${classId}.json"`);
    res.setHeader('Content-Type', 'application/json');
    res.json(exportData);
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.get('/export/manifest/:classId', (req, res) => {
  try {
    const db = req.app.get('db');
    const classId = req.params.classId;
    const cls = db.queryOne('classes', { id: classId });
    const grade = db.queryOne('grades', { id: cls?.grade_id });
    const manifest = {
      ServerKind: 0,
      OrganizationName: "南通市崇川初级中学",
      ClassPlanSource: {
        Value: `/api/timetable/export/classplans/${classId}`,
        Version: Date.now()
      },
      TimeLayoutSource: {
        Value: `/api/timetable/export/timelayouts/${classId}`,
        Version: Date.now()
      },
      SubjectsSource: {
        Value: `/api/timetable/export/subjects/${classId}`,
        Version: Date.now()
      }
    };
    res.json(manifest);
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
