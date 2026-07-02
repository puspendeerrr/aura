const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
  console.error('[CLOUDINARY WARNING] Cloudinary configuration is incomplete. Image and video uploads will fail.');
} else {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

/**
 * Uploads a file buffer directly to Cloudinary
 * @param {Buffer} fileBuffer - File content in memory buffer
 * @param {String} folder - Cloudinary folder name
 * @param {String} resourceType - "image" or "video"
 * @returns {Promise<Object>} Cloudinary result object
 */
const uploadStream = (fileBuffer, folder = 'aura', resourceType = 'image') => {
  return new Promise((resolve, reject) => {
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      return reject(new Error('Cloudinary credentials are not configured on the server. Please check your .env file.'));
    }

    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: resourceType },
      (error, result) => {
        if (error) {
          console.error('[CLOUDINARY] Upload error:', error);
          return reject(error);
        }
        resolve(result);
      }
    );

    stream.end(fileBuffer);
  });
};

module.exports = {
  uploadStream,
};
