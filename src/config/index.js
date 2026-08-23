const path = require('path');

module.exports = {
  PORT: process.env.PORT || 5000,
  JWT_SECRET: process.env.JWT_SECRET || 'ntcc-homework-platform-secret-key-2024',
  JWT_EXPIRES_IN: '7d',
  DB_PATH: path.join(__dirname, '../../data/school.db'),
  UPLOAD_DIR: path.join(__dirname, '../../uploads'),
  DATA_DIR: path.join(__dirname, '../../data'),
  SCHOOL_NAME: '南通市崇川初级中学',
  GRADES: [
    { id: 1, name: '初一', fullName: '初中一年级' },
    { id: 2, name: '初二', fullName: '初中二年级' },
    { id: 3, name: '初三', fullName: '初中三年级' }
  ],
  ROLES: {
    SUPER_ADMIN: 'super_admin',
    ADMIN: 'admin',
    TEACHER: 'teacher',
    STUDENT: 'student',
    PARENT: 'parent'
  },
  ROLE_NAMES: {
    super_admin: '超级管理员',
    admin: '教务管理员',
    teacher: '教师',
    student: '学生',
    parent: '家长'
  }
};
