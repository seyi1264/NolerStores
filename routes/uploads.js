const express = require('express');
const router = express.Router();

router.use((req, res) => {
  res.status(404).json({ error: 'Uploads are not configured in this deployment.' });
});

module.exports = router;
