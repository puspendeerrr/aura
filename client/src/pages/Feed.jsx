import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { 
  Heart, MessageCircle, Bookmark, Send, Plus, 
  ChevronLeft, ChevronRight, X, AlertTriangle, Trash, MoreHorizontal, Edit3
} from 'lucide-react';

export default function Feed() {
  const { apiCall, user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [stories, setStories] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Pagination
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  // Story player modal
  const [activeStoryGroup, setActiveStoryGroup] = useState(null);
  const [activeStoryIndex, setActiveStoryIndex] = useState(0);
  const [storyViewers, setStoryViewers] = useState([]);
  const storyTimer = useRef(null);

  // Comment Drawer
  const [activePostComments, setActivePostComments] = useState(null);
  const [newCommentText, setNewCommentText] = useState('');

  // Report Modal
  const [reportingPostId, setReportingPostId] = useState(null);
  const [reportReason, setReportReason] = useState('');

  // Edit Post Modal
  const [editingPostId, setEditingPostId] = useState(null);
  const [editingCaption, setEditingCaption] = useState('');

  // Story Upload ref
  const storyInputRef = useRef(null);

  const fetchData = async (reset = false) => {
    try {
      const currentOffset = reset ? 0 : offset;
      const postsData = await apiCall(`/posts/feed?limit=6&offset=${currentOffset}`);
      
      if (reset) {
        setPosts(postsData.posts);
        setOffset(6);
        setHasMore(postsData.posts.length === 6);
      } else {
        setPosts((prev) => [...prev, ...postsData.posts]);
        setOffset((prev) => prev + 6);
        if (postsData.posts.length < 6) {
          setHasMore(false);
        }
      }
    } catch (err) {
      console.error('Error fetching feed posts:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStories = async () => {
    try {
      const storiesData = await apiCall('/stories/feed');
      setStories(storiesData.stories);
    } catch (err) {
      console.error('Error loading stories:', err);
    }
  };

  const fetchSuggestions = async () => {
    try {
      const data = await apiCall('/users/suggested');
      setSuggestions(data.suggestions);
    } catch (err) {
      console.error('Error suggestions:', err);
    }
  };

  useEffect(() => {
    fetchStories();
    fetchSuggestions();
    fetchData(true);
  }, []);

  // Story timer autoplay logic
  useEffect(() => {
    if (activeStoryGroup) {
      if (storyTimer.current) clearTimeout(storyTimer.current);

      const currentGroupStories = activeStoryGroup.stories;
      const currentStory = currentGroupStories[activeStoryIndex];

      // Mark as read/viewed
      if (currentStory && !currentStory.isViewed && activeStoryGroup.user.id !== user.id) {
        apiCall(`/stories/${currentStory.id}/view`, { method: 'POST' })
          .then(() => {
            setStories(prev => prev.map(grp => {
              if (grp.user.id === activeStoryGroup.user.id) {
                return {
                  ...grp,
                  stories: grp.stories.map(st => st.id === currentStory.id ? { ...st, isViewed: true } : st)
                };
              }
              return grp;
            }));
          }).catch(err => console.error(err));
      }

      // Load viewers list if own story
      if (activeStoryGroup.user.id === user.id && currentStory) {
        apiCall(`/stories/${currentStory.id}/viewers`)
          .then(data => setStoryViewers(data.viewers))
          .catch(err => console.error(err));
      } else {
        setStoryViewers([]);
      }

      // 5 second timer to auto advance
      storyTimer.current = setTimeout(() => {
        handleStoryNext();
      }, 5000);
    }

    return () => {
      if (storyTimer.current) clearTimeout(storyTimer.current);
    };
  }, [activeStoryGroup, activeStoryIndex]);

  const handleStoryNext = () => {
    if (!activeStoryGroup) return;
    const maxIndex = activeStoryGroup.stories.length - 1;
    if (activeStoryIndex < maxIndex) {
      setActiveStoryIndex(prev => prev + 1);
    } else {
      const groupIdx = stories.findIndex(g => g.user.id === activeStoryGroup.user.id);
      if (groupIdx !== -1 && groupIdx < stories.length - 1) {
        setActiveStoryGroup(stories[groupIdx + 1]);
        setActiveStoryIndex(0);
      } else {
        closeStoryViewer();
      }
    }
  };

  const handleStoryPrev = () => {
    if (!activeStoryGroup) return;
    if (activeStoryIndex > 0) {
      setActiveStoryIndex(prev => prev - 1);
    } else {
      const groupIdx = stories.findIndex(g => g.user.id === activeStoryGroup.user.id);
      if (groupIdx > 0) {
        const prevGroup = stories[groupIdx - 1];
        setActiveStoryGroup(prevGroup);
        setActiveStoryIndex(prevGroup.stories.length - 1);
      } else {
        setActiveStoryIndex(0);
      }
    }
  };

  const closeStoryViewer = () => {
    setActiveStoryGroup(null);
    setActiveStoryIndex(0);
    setStoryViewers([]);
    if (storyTimer.current) clearTimeout(storyTimer.current);
  };

  const handleStoryUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('media', file);

    try {
      await apiCall('/stories', {
        method: 'POST',
        body: formData,
      });
      alert('Story uploaded to Cloudinary successfully!');
      fetchStories();
    } catch (err) {
      alert(err.message || 'Failed to upload story');
    }
  };

  const toggleLike = async (postId) => {
    try {
      const data = await apiCall(`/posts/${postId}/like`, { method: 'POST' });
      setPosts(prev => prev.map(p => {
        if (p.id === postId) {
          return {
            ...p,
            isLiked: data.isLiked,
            _count: {
              ...p._count,
              likes: data.isLiked ? p._count.likes + 1 : p._count.likes - 1
            }
          };
        }
        return p;
      }));
    } catch (err) {
      console.error(err);
    }
  };

  const toggleSave = async (postId) => {
    try {
      const data = await apiCall(`/posts/${postId}/save`, { method: 'POST' });
      setPosts(prev => prev.map(p => {
        if (p.id === postId) {
          return { ...p, isSaved: data.isSaved };
        }
        return p;
      }));
    } catch (err) {
      console.error(err);
    }
  };

  const openComments = async (post) => {
    try {
      const data = await apiCall(`/posts/${post.id}`);
      setActivePostComments(data.post);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newCommentText.trim() || !activePostComments) return;

    try {
      const data = await apiCall(`/posts/${activePostComments.id}/comment`, {
        method: 'POST',
        body: JSON.stringify({ text: newCommentText }),
      });
      
      setActivePostComments(prev => ({
        ...prev,
        comments: [...prev.comments, data.comment],
        _count: { ...prev._count, comments: prev._count.comments + 1 }
      }));

      setPosts(prev => prev.map(p => {
        if (p.id === activePostComments.id) {
          return {
            ...p,
            _count: { ...p._count, comments: p._count.comments + 1 }
          };
        }
        return p;
      }));

      setNewCommentText('');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeletePost = async (postId) => {
    if (!window.confirm('Delete this post permanently?')) return;

    try {
      await apiCall(`/posts/${postId}`, { method: 'DELETE' });
      setPosts(prev => prev.filter(p => p.id !== postId));
    } catch (err) {
      alert(err.message || 'Failed to delete');
    }
  };

  const handleEditPostSubmit = async (e) => {
    e.preventDefault();
    if (!editingCaption.trim()) return;

    try {
      const data = await apiCall(`/posts/${editingPostId}`, {
        method: 'PUT',
        body: JSON.stringify({ caption: editingCaption })
      });
      setPosts(prev => prev.map(p => p.id === editingPostId ? { ...p, caption: data.post.caption } : p));
      setEditingPostId(null);
      setEditingCaption('');
      alert('Post caption updated successfully!');
    } catch (err) {
      alert(err.message || 'Failed to update post');
    }
  };

  const handleReportPost = async (e) => {
    e.preventDefault();
    if (!reportReason) return;

    try {
      await apiCall('/admin/reports', {
        method: 'POST',
        body: JSON.stringify({ postId: reportingPostId, reason: reportReason }),
      });
      alert('Report submitted for moderation. Thank you.');
      setReportingPostId(null);
      setReportReason('');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleFollowSuggestion = async (userId) => {
    try {
      await apiCall(`/users/follow/${userId}`, { method: 'POST' });
      fetchSuggestions();
      fetchData(true);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-8 max-w-5xl mx-auto pb-16">
      
      {/* Left feed column */}
      <div className="flex flex-col gap-6 w-full max-w-[600px] mx-auto">
        
        {/* Story Scroll Bar */}
        <div className="flex gap-4 overflow-x-auto p-4 bg-[#1f2833]/40 backdrop-blur-md border border-purple-500/10 rounded-2xl">
          {/* Upload Story */}
          <div 
            onClick={() => storyInputRef.current.click()}
            className="flex flex-col items-center cursor-pointer min-w-[70px] select-none"
          >
            <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-purple-600 to-cyan-400 flex items-center justify-center border-2 border-dashed border-cyan-400 mb-1.5 transition hover:scale-105">
              <Plus size={22} className="text-white" />
            </div>
            <span className="text-[11px] text-gray-400">Add Story</span>
            <input 
              type="file" 
              ref={storyInputRef} 
              onChange={handleStoryUpload} 
              className="hidden"
              accept="image/*"
            />
          </div>

          {/* Active Stories */}
          {stories.map((group) => {
            const hasUnviewed = group.hasUnviewed;
            return (
              <div 
                key={group.user.id} 
                onClick={() => {
                  setActiveStoryGroup(group);
                  setActiveStoryIndex(0);
                }}
                className="flex flex-col items-center cursor-pointer min-w-[70px] select-none"
              >
                <div 
                  className={`w-14 h-14 rounded-full p-[2px] mb-1.5 flex items-center justify-center transition hover:scale-105 ${
                    hasUnviewed ? 'bg-gradient-to-tr from-purple-600 to-cyan-400' : 'border border-gray-600'
                  }`}
                >
                  <img 
                    src={group.user.avatar || 'https://api.dicebear.com/7.x/identicon/svg?seed=aura'} 
                    alt={group.user.username} 
                    className="w-full h-full rounded-full object-cover border-2 border-[#0b0c10]" 
                  />
                </div>
                <span className="text-[11px] text-gray-400 truncate max-w-[70px]">
                  {group.user.id === user.id ? 'Your Story' : `@${group.user.username}`}
                </span>
              </div>
            );
          })}
        </div>

        {/* Feed Posts */}
        <div className="flex flex-col gap-6">
          {posts.map((post) => (
            <PostCard 
              key={post.id} 
              post={post} 
              onLike={toggleLike} 
              onSave={toggleSave} 
              onOpenComments={openComments}
              onDelete={handleDeletePost}
              onEdit={(id, caption) => {
                setEditingPostId(id);
                setEditingCaption(caption || '');
              }}
              onReport={setReportingPostId}
              currentUserId={user.id}
            />
          ))}

          {posts.length === 0 && !loading && (
            <div className="bg-[#1f2833]/30 border border-purple-500/10 rounded-2xl p-10 text-center">
              <h3 className="text-white font-semibold text-lg">Your Feed is Empty</h3>
              <p className="text-gray-400 text-sm mt-2">
                Follow other creators or discover trending content in the Explore page!
              </p>
            </div>
          )}

          {hasMore && posts.length > 0 && (
            <button 
              onClick={() => fetchData()} 
              className="w-full py-3 rounded-xl bg-[#1f2833]/50 border border-purple-500/15 hover:border-purple-500/35 text-white font-medium transition active:scale-[0.98]"
            >
              Load More Content
            </button>
          )}
        </div>
      </div>

      {/* Suggested Panel (Desktop Sidebar) */}
      <div className="hidden md:flex flex-col h-fit p-6 bg-[#1f2833]/30 border border-purple-500/10 rounded-2xl sticky top-8 select-none">
        <div className="flex items-center gap-3 border-b border-purple-500/10 pb-4 mb-5">
          <img 
            src={user.avatar || 'https://api.dicebear.com/7.x/identicon/svg?seed=aura'} 
            alt={user.username} 
            className="w-12 h-12 rounded-full object-cover border border-purple-500/20" 
          />
          <div>
            <strong className="text-white text-sm block">@{user.username}</strong>
            <span className="text-gray-400 text-xs">{user.name || 'Aura Member'}</span>
          </div>
        </div>

        <h4 className="text-xs font-semibold text-gray-400 mb-4 tracking-wider uppercase">Suggested Creators</h4>
        <div className="space-y-4">
          {suggestions.map((sug) => (
            <div key={sug.id} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <img 
                  src={sug.avatar || 'https://api.dicebear.com/7.x/identicon/svg?seed=aura'} 
                  alt={sug.username} 
                  className="w-9 h-9 rounded-full object-cover" 
                />
                <div>
                  <strong className="text-white text-xs block">@{sug.username}</strong>
                  <span className="text-[10px] text-gray-500">Popular Creator</span>
                </div>
              </div>
              <button 
                onClick={() => handleFollowSuggestion(sug.id)} 
                className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold transition"
              >
                Follow
              </button>
            </div>
          ))}
          {suggestions.length === 0 && (
            <p className="text-xs text-gray-500 text-center">No recommendations available</p>
          )}
        </div>
      </div>

      {/* Story Player Modal */}
      {activeStoryGroup && (
        <div className="fixed inset-0 bg-black/95 flex justify-center items-center z-[2000]">
          <button onClick={closeStoryViewer} className="absolute top-5 right-5 text-gray-400 hover:text-white transition">
            <X size={28} />
          </button>

          <div className="relative w-full max-w-[420px] h-[80vh] bg-black rounded-2xl overflow-hidden flex flex-col justify-center border border-purple-500/10">
            {/* Timelines progress */}
            <div className="absolute top-3 inset-x-3 flex gap-1 z-10">
              {activeStoryGroup.stories.map((st, i) => (
                <div key={st.id} className="flex-1 h-[3px] bg-white/30 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-white transition-all duration-5000 ease-linear"
                    style={{
                      width: i < activeStoryIndex ? '100%' : i === activeStoryIndex ? '100%' : '0%',
                      transitionDuration: i === activeStoryIndex ? '5s' : '0s'
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Header */}
            <div className="absolute top-6 left-3 flex items-center gap-2.5 z-10">
              <img 
                src={activeStoryGroup.user.avatar || 'https://api.dicebear.com/7.x/identicon/svg?seed=aura'} 
                alt="Story avatar" 
                className="w-8 h-8 rounded-full border border-white/40 object-cover" 
              />
              <span className="text-white text-xs font-semibold">@{activeStoryGroup.user.username}</span>
            </div>

            {/* Navigation arrows */}
            <button onClick={handleStoryPrev} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/70 hover:text-white z-10">
              <ChevronLeft size={28} />
            </button>
            <button onClick={handleStoryNext} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/70 hover:text-white z-10">
              <ChevronRight size={28} />
            </button>

            {/* Content Image */}
            <img 
              src={activeStoryGroup.stories[activeStoryIndex]?.media} 
              alt="Story Media" 
              className="w-full h-full object-contain"
            />

            {/* Viewers bar for creators */}
            {activeStoryGroup.user.id === user.id && (
              <div className="absolute bottom-0 inset-x-0 bg-black/80 p-3 max-h-[160px] text-white z-15 border-t border-white/5">
                <span className="text-xs text-gray-400 block mb-2">Seen by {storyViewers.length}</span>
                <div className="overflow-y-auto max-h-[100px] space-y-2">
                  {storyViewers.map(v => (
                    <div key={v.id} className="flex items-center gap-2">
                      <img src={v.avatar || 'https://api.dicebear.com/7.x/identicon/svg?seed=aura'} className="w-6 h-6 rounded-full object-cover" />
                      <span className="text-xs">@{v.username}</span>
                    </div>
                  ))}
                  {storyViewers.length === 0 && <span className="text-[10px] text-gray-500">No views yet</span>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Comment Drawer Overlay */}
      {activePostComments && (
        <div className="fixed inset-0 bg-black/60 flex justify-center items-center z-[1500]" onClick={() => setActivePostComments(null)}>
          <div 
            className="w-full max-w-[480px] h-[80vh] max-h-[600px] bg-[#12141c] border border-purple-500/20 shadow-2xl rounded-2xl p-6 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center border-b border-purple-500/10 pb-4 mb-4">
              <h3 className="text-white font-bold text-lg">Comments</h3>
              <button onClick={() => setActivePostComments(null)} className="text-gray-400 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {activePostComments.comments.map((comment) => (
                <div key={comment.id} className="flex items-start gap-3">
                  <img 
                    src={comment.user.avatar || 'https://api.dicebear.com/7.x/identicon/svg?seed=aura'} 
                    alt={comment.user.username} 
                    className="w-8 h-8 rounded-full object-cover" 
                  />
                  <div>
                    <span className="text-white text-xs font-bold block">@{comment.user.username}</span>
                    <p className="text-gray-300 text-sm mt-0.5">{comment.text}</p>
                  </div>
                </div>
              ))}
              {activePostComments.comments.length === 0 && (
                <p className="text-center text-gray-500 text-sm mt-12">No comments yet. Be the first to share your thoughts!</p>
              )}
            </div>

            <form onSubmit={handleAddComment} className="flex gap-2 border-t border-purple-500/10 pt-4 mt-4">
              <input 
                type="text" 
                placeholder="Add a comment... (use @username)" 
                value={newCommentText} 
                onChange={(e) => setNewCommentText(e.target.value)} 
                className="flex-1 py-2.5 px-4 bg-black/30 border border-purple-500/15 rounded-xl text-white outline-none focus:border-cyan-400"
                required
              />
              <button type="submit" className="w-11 h-11 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 flex items-center justify-center text-white cursor-pointer hover:scale-105 active:scale-95 transition">
                <Send size={16} />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Post Modal */}
      {editingPostId && (
        <div className="fixed inset-0 bg-black/60 flex justify-center items-center z-[1500]">
          <div className="w-full max-w-md bg-[#12141c] border border-purple-500/20 p-6 rounded-2xl shadow-2xl animate-fade">
            <div className="flex items-center gap-2 mb-4">
              <Edit3 className="text-purple-400" size={24} />
              <h3 className="text-white text-lg font-semibold">Edit Post Caption</h3>
            </div>
            
            <form onSubmit={handleEditPostSubmit} className="space-y-4">
              <textarea 
                placeholder="Write a caption..." 
                value={editingCaption} 
                onChange={(e) => setEditingCaption(e.target.value)} 
                className="w-full h-28 p-3 bg-black/30 border border-purple-500/15 rounded-xl text-white outline-none focus:border-cyan-400 resize-none text-sm"
                required
              />
              
              <div className="flex justify-end gap-3">
                <button 
                  type="button" 
                  onClick={() => {
                    setEditingPostId(null);
                    setEditingCaption('');
                  }} 
                  className="text-gray-400 hover:text-white text-sm"
                >
                  Cancel
                </button>
                <button type="submit" className="py-2 px-4 bg-gradient-to-r from-purple-600 to-cyan-500 text-white rounded-xl text-sm font-semibold transition transform active:scale-95">
                  Update Post
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Report Modal */}
      {reportingPostId && (
        <div className="fixed inset-0 bg-black/60 flex justify-center items-center z-[1500]">
          <div className="w-full max-w-md bg-[#12141c] border border-purple-500/20 p-6 rounded-2xl shadow-2xl">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="text-yellow-500" size={24} />
              <h3 className="text-white text-lg font-semibold">Report Content</h3>
            </div>
            
            <form onSubmit={handleReportPost} className="space-y-4">
              <label className="text-sm text-gray-400 block">Provide a brief reason for reporting this content:</label>
              <textarea 
                placeholder="e.g., copyright, spam, harassment, inappropriate media..." 
                value={reportReason} 
                onChange={(e) => setReportReason(e.target.value)} 
                className="w-full h-24 p-3 bg-black/30 border border-purple-500/15 rounded-xl text-white outline-none focus:border-cyan-400 resize-none text-sm"
                required
              />
              
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setReportingPostId(null)} className="text-gray-400 hover:text-white text-sm">
                  Cancel
                </button>
                <button type="submit" className="py-2 px-4 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-semibold transition transform active:scale-95">
                  Submit Report
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

// Sub-card components for posts
function PostCard({ post, onLike, onSave, onOpenComments, onDelete, onEdit, onReport, currentUserId }) {
  const mediaList = post.media || [];
  const [mediaIdx, setMediaIdx] = useState(0);

  const handleNextMedia = (e) => {
    e.stopPropagation();
    if (mediaIdx < mediaList.length - 1) {
      setMediaIdx(prev => prev + 1);
    }
  };

  const handlePrevMedia = (e) => {
    e.stopPropagation();
    if (mediaIdx > 0) {
      setMediaIdx(prev => prev - 1);
    }
  };

  return (
    <div className="w-full bg-[#1f2833]/30 border border-purple-500/10 rounded-2xl overflow-hidden shadow-lg animate-fade">
      
      {/* Post Header */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <img 
            src={post.user.avatar || 'https://api.dicebear.com/7.x/identicon/svg?seed=aura'} 
            alt={post.user.username} 
            className="w-9 h-9 rounded-full object-cover border border-purple-500/10" 
          />
          <div>
            <strong className="text-white text-sm block">@{post.user.username}</strong>
            <span className="text-[10px] text-gray-500">{new Date(post.createdAt).toLocaleDateString()}</span>
          </div>
        </div>

        {post.user.id === currentUserId ? (
          <div className="flex gap-2">
            <button onClick={() => onEdit(post.id, post.caption)} className="text-purple-400 hover:text-purple-300 transition">
              <Edit3 size={18} />
            </button>
            <button onClick={() => onDelete(post.id)} className="text-red-500 hover:text-red-400 transition">
              <Trash size={18} />
            </button>
          </div>
        ) : (
          <button onClick={() => onReport(post.id)} className="text-gray-500 hover:text-yellow-500 transition">
            <AlertTriangle size={18} />
          </button>
        )}
      </div>

      {/* Post Media Display */}
      <div className="relative w-full aspect-square bg-black">
        {mediaList.length > 0 ? (
          mediaList[mediaIdx]?.type === 'VIDEO' ? (
            <video 
              src={mediaList[mediaIdx]?.url} 
              controls 
              className="w-full h-full object-contain"
            />
          ) : (
            <img 
              src={mediaList[mediaIdx]?.url} 
              alt="Post Content" 
              className="w-full h-full object-contain" 
            />
          )
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs">No media files</div>
        )}

        {/* Navigation for carousel */}
        {mediaList.length > 1 && (
          <>
            {mediaIdx > 0 && (
              <button onClick={handlePrevMedia} className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center cursor-pointer hover:bg-black/80">
                <ChevronLeft size={20} />
              </button>
            )}
            {mediaIdx < mediaList.length - 1 && (
              <button onClick={handleNextMedia} className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center cursor-pointer hover:bg-black/80">
                <ChevronRight size={20} />
              </button>
            )}
            
            <div className="absolute bottom-3 inset-x-0 flex justify-center gap-1.5 pointer-events-none">
              {mediaList.map((_, i) => (
                <div 
                  key={i} 
                  className={`w-1.5 h-1.5 rounded-full ${i === mediaIdx ? 'bg-cyan-400' : 'bg-white/40'}`} 
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Action panel buttons */}
      <div className="flex justify-between items-center px-4 py-3">
        <div className="flex gap-4">
          <button onClick={() => onLike(post.id)} className={`transition hover:scale-110 ${post.isLiked ? 'text-red-500' : 'text-gray-300'}`}>
            <Heart size={22} fill={post.isLiked ? 'currentColor' : 'none'} />
          </button>
          <button onClick={() => onOpenComments(post)} className="text-gray-300 hover:text-white transition hover:scale-110">
            <MessageCircle size={22} />
          </button>
          <button 
            onClick={() => {
              const link = `${window.location.origin}/posts/${post.id}`;
              navigator.clipboard.writeText(link);
              alert('Post link copied to clipboard! Share it with your friends.');
            }}
            className="text-gray-300 hover:text-cyan-400 transition hover:scale-110"
            title="Share Post"
          >
            <Send size={20} className="rotate-[-30deg]" />
          </button>
        </div>

        <button onClick={() => onSave(post.id)} className={`transition hover:scale-110 ${post.isSaved ? 'text-cyan-400' : 'text-gray-300'}`}>
          <Bookmark size={22} fill={post.isSaved ? 'currentColor' : 'none'} />
        </button>
      </div>

      {/* Content description details */}
      <div className="px-4 pb-4">
        <strong className="text-white text-sm block">{post._count?.likes || 0} likes</strong>
        <p className="text-gray-200 text-sm mt-1.5">
          <strong className="text-white mr-1.5">@{post.user.username}</strong>
          {post.caption}
        </p>

        {post._count?.comments > 0 && (
          <button onClick={() => onOpenComments(post)} className="text-xs text-gray-500 hover:text-gray-400 cursor-pointer block mt-2">
            View all {post._count.comments} comments
          </button>
        )}
      </div>
    </div>
  );
}
