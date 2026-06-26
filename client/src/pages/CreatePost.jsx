import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Image, Video, Plus, ChevronLeft, ChevronRight, X, Film, Upload } from 'lucide-react';

export default function CreatePost() {
  const { apiCall } = useAuth();
  const navigate = useNavigate();
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [previewUrls, setPreviewUrls] = useState([]);
  const [activePreviewIdx, setActivePreviewIdx] = useState(0);
  const [caption, setCaption] = useState('');
  const [loading, setLoading] = useState(false);
  
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setSelectedFiles((prev) => [...prev, ...files]);
    
    // Create object URLs for previews
    const urls = files.map(file => ({
      url: URL.createObjectURL(file),
      type: file.type.startsWith('video') ? 'VIDEO' : 'IMAGE'
    }));
    setPreviewUrls((prev) => [...prev, ...urls]);
  };

  const handleRemoveFile = (indexToRemove) => {
    setSelectedFiles((prev) => prev.filter((_, idx) => idx !== indexToRemove));
    
    // Revoke object URL to prevent leaks
    URL.revokeObjectURL(previewUrls[indexToRemove].url);
    setPreviewUrls((prev) => prev.filter((_, idx) => idx !== indexToRemove));

    if (activePreviewIdx >= previewUrls.length - 1 && activePreviewIdx > 0) {
      setActivePreviewIdx(prev => prev - 1);
    }
  };

  const handleNextPreview = () => {
    if (activePreviewIdx < previewUrls.length - 1) {
      setActivePreviewIdx(prev => prev + 1);
    }
  };

  const handlePrevPreview = () => {
    if (activePreviewIdx > 0) {
      setActivePreviewIdx(prev => prev - 1);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (selectedFiles.length === 0) return;

    setLoading(true);
    const formData = new FormData();
    formData.append('caption', caption);

    selectedFiles.forEach((file) => {
      formData.append('media', file); // Multer array handler
    });

    try {
      await apiCall('/posts', {
        method: 'POST',
        body: formData,
      });
      alert('Post published successfully!');
      
      // Clean up object URLs
      previewUrls.forEach(item => URL.revokeObjectURL(item.url));

      navigate('/'); // back to feed
    } catch (err) {
      alert(err.message || 'Failed to upload post to Cloudinary');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto pb-16 animate-fade">
      <h2 className="text-2xl font-bold mb-6 text-white border-l-4 border-purple-500 pl-3.5">Create New Post</h2>

      <div className="bg-[#1f2833]/40 border border-purple-500/15 p-6 rounded-2xl backdrop-blur-md shadow-2xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* Uploader Box */}
          {previewUrls.length === 0 ? (
            <div 
              onClick={() => fileInputRef.current.click()}
              className="w-full aspect-[4/3] max-h-[350px] border-2 border-dashed border-purple-500/20 hover:border-purple-500/40 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:bg-white/5 transition"
            >
              <Upload size={40} className="text-purple-400 mb-3" />
              <strong className="text-white text-sm">Select Images or Videos</strong>
              <p className="text-xs text-gray-500 mt-1">Supports multi-file carousels</p>
            </div>
          ) : (
            /* Selected Files Carousel Preview */
            <div className="relative w-full aspect-square max-h-[400px] bg-black rounded-2xl overflow-hidden border border-purple-500/20">
              
              {previewUrls[activePreviewIdx]?.type === 'VIDEO' ? (
                <video 
                  src={previewUrls[activePreviewIdx]?.url} 
                  controls 
                  className="w-full h-full object-contain"
                />
              ) : (
                <img 
                  src={previewUrls[activePreviewIdx]?.url} 
                  alt="Post preview" 
                  className="w-full h-full object-contain" 
                />
              )}

              {/* Delete item button */}
              <button 
                type="button"
                onClick={() => handleRemoveFile(activePreviewIdx)}
                className="absolute top-3 right-3 p-1.5 bg-black/60 hover:bg-black text-red-400 rounded-full hover:scale-105 transition z-10"
              >
                <X size={18} />
              </button>

              {/* Slide Navs */}
              {previewUrls.length > 1 && (
                <>
                  {activePreviewIdx > 0 && (
                    <button 
                      type="button"
                      onClick={handlePrevPreview}
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center cursor-pointer hover:bg-black/85"
                    >
                      <ChevronLeft size={18} />
                    </button>
                  )}
                  {activePreviewIdx < previewUrls.length - 1 && (
                    <button 
                      type="button"
                      onClick={handleNextPreview}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center cursor-pointer hover:bg-black/85"
                    >
                      <ChevronRight size={18} />
                    </button>
                  )}
                </>
              )}

              {/* Add more files item overlay */}
              <button 
                type="button"
                onClick={() => fileInputRef.current.click()}
                className="absolute bottom-3 left-3 px-3 py-1.5 bg-black/60 hover:bg-black text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition"
              >
                <Plus size={14} /> Add More
              </button>

              {/* Index counter */}
              <div className="absolute bottom-3 right-3 px-2 py-1 bg-black/60 text-white text-xs rounded">
                {activePreviewIdx + 1} / {previewUrls.length}
              </div>
            </div>
          )}

          {/* Hidden File Input */}
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange}
            multiple 
            accept="image/*,video/*"
            className="hidden"
          />

          {/* Caption field */}
          <div className="space-y-2">
            <label className="text-sm text-gray-400 font-semibold block">Caption</label>
            <textarea 
              placeholder="Write a caption... (use #hashtags and @mentions)" 
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="w-full h-28 p-3 bg-black/30 border border-purple-500/15 rounded-xl text-white outline-none focus:border-cyan-400 text-sm resize-none"
            />
          </div>

          {/* Action Trigger Buttons */}
          <button 
            type="submit" 
            disabled={loading || selectedFiles.length === 0}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 text-white font-semibold shadow-lg transition transform active:scale-95 disabled:opacity-50 select-none cursor-pointer"
          >
            {loading ? 'Publishing to Cloudinary...' : 'Publish Post'}
          </button>

        </form>
      </div>

    </div>
  );
}
