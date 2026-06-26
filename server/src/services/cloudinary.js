const cloudinary = require('cloudinary').v2;

// Configure Cloudinary if credentials are provided
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
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
    // If Cloudinary is not configured, fall back to mock image URLs for local development
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      console.log(`\n[CLOUDINARY MOCK] Credentials missing. Automatically mocking file upload for folder: ${folder}`);
      
      const mockImages = [
        'https://images.unsplash.com/photo-1502082553048-f009c37129b9?w=800',
        'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=800',
        'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=800',
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800',
        'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=800',
        'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=800'
      ];
      
      const mockVideos = [
        'https://assets.mixkit.co/videos/preview/mixkit-tree-with-yellow-flowers-48733-large.mp4',
        'https://assets.mixkit.co/videos/preview/mixkit-stars-in-space-background-1611-large.mp4'
      ];

      const selectedUrl = resourceType === 'video' 
        ? mockVideos[Math.floor(Math.random() * mockVideos.length)]
        : mockImages[Math.floor(Math.random() * mockImages.length)];

      // Simulate a small delay for upload network latency
      setTimeout(() => {
        resolve({
          secure_url: selectedUrl,
          public_id: `mock_${Date.now()}`,
          resource_type: resourceType,
        });
      }, 500);
      return;
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
