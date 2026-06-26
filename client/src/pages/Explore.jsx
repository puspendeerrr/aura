import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Search, Grid, User, Heart, MessageCircle, UserPlus, Check } from 'lucide-react';

export default function Explore() {
  const { apiCall } = useAuth();
  const [explorePosts, setExplorePosts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState('users'); // 'users' or 'posts'
  const [searchResults, setSearchResults] = useState([]);
  const [suggestedCreators, setSuggestedCreators] = useState([]);
  const [loading, setLoading] = useState(true);

  // Load active trending explore grid
  const fetchExploreContent = async () => {
    try {
      const data = await apiCall('/posts/explore?limit=12');
      setExplorePosts(data.posts);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSuggestedCreators = async () => {
    try {
      const data = await apiCall('/users/suggested');
      setSuggestedCreators(data.suggestions);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchExploreContent();
    fetchSuggestedCreators();
  }, []);

  // Handle live searches
  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      if (searchQuery.trim() !== '') {
        handleSearch();
      } else {
        setSearchResults([]);
      }
    }, 400);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery, searchType]);

  const handleSearch = async () => {
    try {
      if (searchType === 'users') {
        const data = await apiCall(`/posts/search/users?q=${searchQuery}`);
        setSearchResults(data.users);
      } else {
        const data = await apiCall(`/posts/search/posts?q=${searchQuery}`);
        setSearchResults(data.posts);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleFollowUser = async (userId) => {
    try {
      await apiCall(`/users/follow/${userId}`, { method: 'POST' });
      fetchSuggestedCreators();
      fetchExploreContent();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-16">
      
      {/* Search Input Box */}
      <div className="w-full max-w-xl mx-auto bg-[#1f2833]/40 border border-purple-500/15 p-4 rounded-2xl backdrop-blur-md space-y-3">
        <div className="relative flex items-center">
          <Search size={18} className="absolute left-4 text-gray-400" />
          <input 
            type="text" 
            placeholder={`Search ${searchType === 'users' ? 'users by name or username...' : 'posts by keywords...'}`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full py-2.5 pl-12 pr-4 bg-black/30 border border-purple-500/10 rounded-xl text-white outline-none focus:border-cyan-400 text-sm transition"
          />
        </div>

        {/* Search Type Tabs */}
        <div className="flex gap-2">
          <button 
            onClick={() => { setSearchType('users'); setSearchQuery(''); setSearchResults([]); }}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition select-none ${
              searchType === 'users' ? 'bg-gradient-to-r from-purple-600 to-cyan-500 text-white' : 'text-gray-400 hover:bg-white/5'
            }`}
          >
            <User size={14} />
            Search Users
          </button>
          <button 
            onClick={() => { setSearchType('posts'); setSearchQuery(''); setSearchResults([]); }}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition select-none ${
              searchType === 'posts' ? 'bg-gradient-to-r from-purple-600 to-cyan-500 text-white' : 'text-gray-400 hover:bg-white/5'
            }`}
          >
            <Grid size={14} />
            Search Posts
          </button>
        </div>
      </div>

      {/* Search Results Display */}
      {searchQuery.trim() !== '' && (
        <div className="bg-[#1f2833]/20 border border-purple-500/10 p-6 rounded-2xl backdrop-blur-md animate-fade">
          <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-4">Search Results</h3>
          
          {searchType === 'users' ? (
            /* Users results grid */
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {searchResults.map((usr) => (
                <div key={usr.id} className="flex items-center justify-between p-3.5 bg-black/25 rounded-xl border border-purple-500/5 hover:border-purple-500/20 transition">
                  <div className="flex items-center gap-3">
                    <img 
                      src={usr.avatar || 'https://api.dicebear.com/7.x/identicon/svg?seed=aura'} 
                      alt={usr.username} 
                      className="w-10 h-10 rounded-full object-cover" 
                    />
                    <div>
                      <a href={`/profile/${usr.username}`} className="text-white text-sm font-semibold hover:underline">@{usr.username}</a>
                      <p className="text-gray-400 text-xs">{usr.name}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleFollowUser(usr.id)}
                    className="p-2 bg-gradient-to-r from-purple-600 to-cyan-500 rounded-lg text-white hover:scale-105 active:scale-95 transition"
                  >
                    <UserPlus size={14} />
                  </button>
                </div>
              ))}
              {searchResults.length === 0 && (
                <p className="text-sm text-gray-500 col-span-full text-center py-4">No matching users found.</p>
              )}
            </div>
          ) : (
            /* Posts results grid */
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {searchResults.map((post) => (
                <ExploreGridCard key={post.id} post={post} />
              ))}
              {searchResults.length === 0 && (
                <p className="text-sm text-gray-500 col-span-full text-center py-4">No matching posts found.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Suggested Creators & Explore Grid Split */}
      {searchQuery.trim() === '' && (
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-8">
          
          {/* Creator Sidebar Widget */}
          <div className="flex flex-col gap-4 p-5 bg-[#1f2833]/30 border border-purple-500/10 rounded-2xl h-fit">
            <h4 className="text-xs font-bold text-gray-400 tracking-wider uppercase mb-2">Suggested Creators</h4>
            <div className="space-y-4">
              {suggestedCreators.map(cre => (
                <div key={cre.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <img 
                      src={cre.avatar || 'https://api.dicebear.com/7.x/identicon/svg?seed=aura'} 
                      alt={cre.username} 
                      className="w-8 h-8 rounded-full object-cover" 
                    />
                    <div className="overflow-hidden max-w-[100px]">
                      <a href={`/profile/${cre.username}`} className="text-white text-xs font-semibold truncate hover:underline block">@{cre.username}</a>
                      <span className="text-[9px] text-gray-500 block truncate">{cre.name}</span>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleFollowUser(cre.id)}
                    className="p-1.5 bg-gradient-to-r from-purple-600 to-cyan-500 rounded-lg text-white hover:scale-105 transition"
                  >
                    <UserPlus size={12} />
                  </button>
                </div>
              ))}
              {suggestedCreators.length === 0 && (
                <p className="text-xs text-gray-500 text-center py-2">No recommendations</p>
              )}
            </div>
          </div>

          {/* Explore posts feed */}
          <div className="space-y-4">
            <h3 className="text-white font-bold text-lg border-l-4 border-purple-500 pl-3.5">Trending Content</h3>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {explorePosts.map((post) => (
                <ExploreGridCard key={post.id} post={post} />
              ))}
            </div>

            {explorePosts.length === 0 && !loading && (
              <p className="text-center text-gray-500 text-sm py-12">No trending posts found. Be the first to upload!</p>
            )}
          </div>

        </div>
      )}

    </div>
  );
}

// Sub grid card with overlay details
function ExploreGridCard({ post }) {
  const mediaUrl = post.media && post.media[0] ? post.media[0].url : 'https://images.unsplash.com/photo-1502082553048-f009c37129b9?w=600';
  const isVideo = post.media && post.media[0] && post.media[0].type === 'VIDEO';

  return (
    <a 
      href={`/posts/${post.id}`} 
      className="relative aspect-square rounded-xl overflow-hidden group border border-purple-500/5 bg-black hover:border-purple-500/20 shadow-md transition-all duration-300 transform hover:scale-[1.02]"
    >
      {/* Background Media */}
      {isVideo ? (
        <video src={mediaUrl} className="w-full h-full object-cover" muted />
      ) : (
        <img src={mediaUrl} alt="Explore content grid" className="w-full h-full object-cover" />
      )}

      {/* Hover Panel */}
      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-5 transition-all duration-300 z-10">
        <div className="flex items-center gap-1.5 text-white">
          <Heart size={16} fill="currentColor" />
          <span className="text-sm font-semibold">{post._count?.likes || 0}</span>
        </div>
        <div className="flex items-center gap-1.5 text-white">
          <MessageCircle size={16} fill="currentColor" />
          <span className="text-sm font-semibold">{post._count?.comments || 0}</span>
        </div>
      </div>
    </a>
  );
}
