const express = require('express');
const { uploadPhoto, listPhotos, deletePhoto } = require('../controllers/photoController');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

const router = express.Router();

router.use(protect);
router.get('/', listPhotos);
router.post('/', upload.single('photo'), uploadPhoto);
router.delete('/:id', deletePhoto);

module.exports = router;
