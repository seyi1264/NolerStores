const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Ensure uploads folder exists
const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads', 'campaigns');
fs.mkdirSync(UPLOADS_ROOT, { recursive: true });

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']);

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_ROOT);
  },
  filename: function (req, file, cb) {
    const extension = path.extname(file.originalname) || '.jpg';
    cb(null, `${uuidv4()}${extension}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error('Only JPG, PNG, WEBP, GIF, and SVG image files are allowed.'));
    }
    cb(null, true);
  }
});

function handleUploadError(err, res) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Image is too large. Please upload a file smaller than 10MB.' });
    }
    return res.status(400).json({ error: err.message || 'Upload failed.' });
  }
  if (err) {
    return res.status(400).json({ error: err.message || 'Invalid image file.' });
  }
  return null;
}

// POST /api/admin/uploads - upload a campaign image (admin only)
router.post('/', requireAdmin, (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      const handled = handleUploadError(err, res);
      if (handled) return handled;
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Please choose an image file to upload.' });
    }
    const base = process.env.API_BASE || `${req.protocol}://${req.get('host')}`;
    const rel = `/uploads/campaigns/${req.file.filename}`;
    const url = base + rel;
    return res.json({ url });
  });
});

module.exports = router;
