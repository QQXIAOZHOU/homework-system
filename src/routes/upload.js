const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { success, error } = require('../utils/helpers');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|mp3|mp4|zip|rar)$/i;
    if (allowed.test(file.originalname)) cb(null, true);
    else cb(new Error('不支持的文件类型'));
  }
});

router.post('/', authMiddleware, requireRole(['teacher', 'admin', 'super_admin']), upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json(error('请选择文件'));
  
  res.json(success({
    url: `/uploads/${req.file.filename}`,
    filename: req.file.originalname,
    size: req.file.size,
    mimetype: req.file.mimetype
  }, '上传成功'));
});

router.post('/multiple', authMiddleware, requireRole(['teacher', 'admin', 'super_admin']), upload.array('files', 10), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json(error('请选择文件'));
  }
  
  const files = req.files.map(f => ({
    url: `/uploads/${f.filename}`,
    filename: f.originalname,
    size: f.size,
    mimetype: f.mimetype
  }));
  
  res.json(success(files, '上传成功'));
});

module.exports = router;
