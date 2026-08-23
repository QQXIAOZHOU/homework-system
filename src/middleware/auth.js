const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../database/init');

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  
  if (!token) {
    return res.status(401).json({ success: false, message: '未登录，请先登录' });
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET);
    const user = db.queryOne('users', { id: decoded.userId });
    
    if (!user || user.status !== 'active') {
      return res.status(401).json({ success: false, message: '用户不存在或已被禁用' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: '登录已过期，请重新登录' });
  }
}

function optionalAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  
  if (token) {
    try {
      const decoded = jwt.verify(token, config.JWT_SECRET);
      const user = db.queryOne('users', { id: decoded.userId });
      if (user && user.status === 'active') {
        req.user = user;
      }
    } catch (error) {}
  }
  next();
}

function requireRole(roles) {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: '未登录' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: '权限不足' });
    }
    next();
  };
}

function canAccessClass(user, classId) {
  if (!user) return true;
  if (['super_admin', 'admin'].includes(user.role)) return true;
  if (user.role === 'teacher') return true;
  if (['student', 'parent'].includes(user.role)) {
    return user.class_id === classId;
  }
  return false;
}

module.exports = {
  authMiddleware,
  optionalAuth,
  requireRole,
  canAccessClass
};
