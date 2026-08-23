const express = require('express');
const db = require('../database/init');
const { success, error } = require('../utils/helpers');
const { authMiddleware, optionalAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.post('/visit', optionalAuth, (req, res) => {
  const { path, device_type } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip;
  
  db.insert('visit_stats', {
    user_id: req.user?.id || null,
    path: path || '/',
    ip: ip ? ip.split(',')[0].trim() : null,
    user_agent: req.headers['user-agent'] || null,
    device_type: device_type || 'desktop',
    referer: req.headers['referer'] || null
  });
  
  res.json(success(null, '记录成功'));
});

router.get('/overview', authMiddleware, requireRole(['admin', 'super_admin', 'teacher']), (req, res) => {
  const visits = db.query('visit_stats');
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  
  const todayVisits = visits.filter(v => v.created_at >= todayStart).length;
  const weekVisits = visits.filter(v => v.created_at >= weekAgo).length;
  
  const deviceStats = {};
  visits.forEach(v => {
    const dev = v.device_type || 'desktop';
    deviceStats[dev] = (deviceStats[dev] || 0) + 1;
  });
  
  const recentVisits = visits
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 50);
  
  const homeworkCount = db.count('homework');
  const userCount = db.count('users', { status: 'active' });
  const teacherCount = db.count('users', { role: 'teacher', status: 'active' });
  const studentCount = db.count('users', { role: 'student', status: 'active' });
  const noticeCount = db.count('notices');
  const classCount = db.count('classes');
  
  const grades = db.query('grades');
  const classes = db.query('classes');
  const homework = db.query('homework');
  const users = db.query('users');
  
  const gradeStats = grades.map(g => {
    const gradeClasses = classes.filter(c => c.grade_id === g.id);
    const classIds = gradeClasses.map(c => c.id);
    const gradeStudents = users.filter(u => u.grade_id === g.id && u.role === 'student' && u.status === 'active');
    const gradeTeachers = users.filter(u => u.grade_id === g.id && u.role === 'teacher' && u.status === 'active');
    const gradeHomework = homework.filter(h => classIds.includes(h.class_id));
    
    return {
      id: g.id,
      name: g.name,
      full_name: g.name,
      fullName: g.name,
      class_count: gradeClasses.length,
      classCount: gradeClasses.length,
      student_count: gradeStudents.length,
      studentCount: gradeStudents.length,
      teacher_count: gradeTeachers.length,
      teacherCount: gradeTeachers.length,
      homework_count: gradeHomework.length,
      homeworkCount: gradeHomework.length
    };
  });

  const homeworkByGrade = {};
  grades.forEach(g => {
    const classIds = classes.filter(c => c.grade_id === g.id).map(c => c.id);
    homeworkByGrade[g.name] = homework.filter(h => classIds.includes(h.class_id)).length;
  });
  
  const homeworkBySubject = {};
  const subjects = db.query('subjects');
  subjects.forEach(s => {
    homeworkBySubject[s.name] = db.count('homework', { subject_id: s.id });
  });
  
  res.json(success({
    visits: {
      totalVisits: visits.length,
      todayVisits,
      weekVisits,
      deviceStats: Object.entries(deviceStats).map(([device_type, count]) => ({ device_type, deviceType: device_type, count }))
    },
    recentVisits,
    overview: {
      totalUsers: userCount,
      total_users: userCount,
      teacherCount: teacherCount,
      teacher_count: teacherCount,
      studentCount: studentCount,
      student_count: studentCount,
      homeworkCount: homeworkCount,
      homework_count: homeworkCount,
      noticeCount: noticeCount,
      notice_count: noticeCount,
      classCount: classCount,
      class_count: classCount
    },
    summary: {
      userCount, teacherCount, studentCount,
      homeworkCount, noticeCount, classCount,
      homeworkByGrade, homeworkBySubject
    },
    gradeStats,
    grade_stats: gradeStats
  }));
});

router.get('/class/:id', authMiddleware, requireRole(['admin', 'super_admin', 'teacher']), (req, res) => {
  const classId = req.params.id;
  const homework = db.query('homework', { class_id: classId });
  const students = db.query('users', { class_id: classId, role: 'student', status: 'active' });
  const notices = db.query('notices').filter(n => n.class_id === classId || n.scope === 'school');
  
  const subjectStats = {};
  homework.forEach(h => {
    const subj = db.queryOne('subjects', { id: h.subject_id });
    const name = subj?.name || '未知';
    if (!subjectStats[name]) subjectStats[name] = 0;
    subjectStats[name]++;
  });
  
  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    last7Days.push({
      date: dateStr,
      count: homework.filter(h => (h.created_at || '').startsWith(dateStr)).length
    });
  }
  
  const cls = db.queryOne('classes', { id: classId });
  res.json(success({
    className: cls?.name,
    class_name: cls?.name,
    studentCount: students.length,
    student_count: students.length,
    homeworkCount: homework.length,
    homework_count: homework.length,
    noticeCount: notices.length,
    notice_count: notices.length,
    subjectStats,
    last7Days
  }));
});

module.exports = router;
