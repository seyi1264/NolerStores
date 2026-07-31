const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const upload = multer({ dest: uploadsDir });

router.post('/', requireAdmin, upload.single('image'), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No image was uploaded.' });
    }

    const ext = path.extname(file.originalname) || '.jpg';
    const finalName = `${Date.now()}-${file.filename}${ext}`;
    const finalPath = path.join(uploadsDir, finalName);
    fs.renameSync(file.path, finalPath);

    const baseUrl = process.env.API_BASE_URL || `${req.protocol}://${req.get('host')}`;
    res.json({ url: `${baseUrl}/uploads/${finalName}` });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
