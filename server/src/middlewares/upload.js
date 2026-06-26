const multer = require('multer');
const path = require('path');

// Store files in system memory as Buffer objects
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const fileTypes = /jpeg|jpg|png|webp|gif|mp4|mov|avi|webm/;
  const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = fileTypes.test(file.mimetype);

  if (extname && mimetype) {
    cb(null, true);
  } else {
    cb(new Error('Only images and video files are allowed!'), false);
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit for video support
  fileFilter,
});

module.exports = upload;
