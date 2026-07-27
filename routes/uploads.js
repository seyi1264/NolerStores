const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Ensure uploads folder exists
const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads', 'campaigns');
fs.mkdirSync(UPLOADS_ROOT, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_ROOT);
  },
  filename: function (req, file, cb) {
    const safe = Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, safe);
  }
});

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

// POST /api/admin/uploads - upload a campaign image (admin only)
router.post('/', requireAdmin, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const rel = `/uploads/campaigns/${req.file.filename}`;
  res.json({ url: rel });
});

module.exports = router;
