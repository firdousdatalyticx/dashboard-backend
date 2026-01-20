const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure storage for video uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(process.cwd(), 'public', 'videos');

        // Create directory if it doesn't exist
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // Generate unique filename
        const uniqueSuffix = Date.now() + '_' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, uniqueSuffix + ext);
    }
});

// File filter for videos
const fileFilter = (req, file, cb) => {
    // Accept video files only
    if (!file.originalname.match(/\.(mp4|avi|mov|wmv|flv|mkv|webm|mpg|mpeg|m4v)$/i)) {
        return cb(new Error('Only video files are allowed!'), false);
    }
    cb(null, true);
};

// Create multer instance for video uploads
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 100 * 1024 * 1024 // 100MB limit for videos
    }
});

module.exports = { upload };