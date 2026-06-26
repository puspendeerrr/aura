import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  Grid, UserCheck, Lock, Edit3, Settings, ShieldAlert, X, Upload, CheckCircle, MessageSquare 
} from 'lucide-react';

export default function Profile() {
  const { username } = useParams();
  const navigate = useNavigate();
  const { user: currentUser, apiCall, updateUser: updateLocalUser } = useAuth();
  
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [followRequests, setFollowRequests] = useState([]);

  // Follow lists and mutual followers
  const [mutualFollowers, setMutualFollowers] = useState([]);
  const [usersListModalOpen, setUsersListModalOpen] = useState(false);
  const [usersListTitle, setUsersListTitle] = useState('');
  const [usersList, setUsersList] = useState([]);
  const [usersListLoading, setUsersListLoading] = useState(false);

  // Edit Profile modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editIsPrivate, setEditIsPrivate] = useState(false);
  const [selectedAvatarFile, setSelectedAvatarFile] = useState(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  const fileInputRef = useRef(null);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const data = await apiCall(`/users/profile/${username}`);
      setProfile(data.profile);
      
      // Initialize edit fields
      if (data.profile.isMe) {
        setEditName(data.profile.name || '');
        setEditBio(data.profile.bio || '');
        setEditIsPrivate(data.profile.isPrivate || false);
      } else {
        // Fetch mutual followers list
        try {
          const mutualData = await apiCall(`/users/profile/${username}/mutual`);
          setMutualFollowers(mutualData.mutuals || []);
        } catch (e) {
          console.error(e);
        }
      }
    } catch (err) {
      console.error(err);
      alert('Failed to load profile. They may have blocked you.');
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const fetchFollowRequests = async () => {
    try {
      if (profile?.isMe && profile?.isPrivate) {
        const data = await apiCall('/users/follow-requests');
        setFollowRequests(data.requests);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [username]);

  useEffect(() => {
    if (profile?.isMe) {
      fetchFollowRequests();
    }
  }, [profile]);

  const handleFollowToggle = async () => {
    if (!profile) return;
    try {
      const data = await apiCall(`/users/follow/${profile.id}`, { method: 'POST' });
      setProfile(prev => ({
        ...prev,
        isFollowing: data.status === 'ACCEPTED',
        isPending: data.status === 'PENDING',
        followersCount: data.status === 'ACCEPTED' ? prev.followersCount + 1 : data.status === 'UNFOLLOWED' ? prev.followersCount - 1 : prev.followersCount
      }));
    } catch (err) {
      console.error(err);
    }
  };

  const handleBlockUser = async () => {
    if (!profile) return;
    if (!window.confirm(`Block @${profile.username} permanently?`)) return;

    try {
      await apiCall(`/admin/reports`, {
        method: 'POST',
        body: JSON.stringify({ reportedUserId: profile.id, reason: 'BLOCKED' }),
      });
      alert('User reported & blocked.');
      navigate('/');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleStartChat = async () => {
    if (!profile) return;
    try {
      const data = await apiCall('/chat/rooms/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: profile.id }),
      });
      navigate(`/chat?room=${data.roomId}`);
    } catch (err) {
      alert(err.message || 'Failed to start conversation');
    }
  };

  const handleAvatarFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setSelectedAvatarFile(file);
    setAvatarPreviewUrl(URL.createObjectURL(file));
  };

  const handleEditProfileSubmit = async (e) => {
    e.preventDefault();
    setEditLoading(true);

    const formData = new FormData();
    formData.append('name', editName);
    formData.append('bio', editBio);
    formData.append('isPrivate', editIsPrivate.toString());
    
    if (selectedAvatarFile) {
      formData.append('avatar', selectedAvatarFile);
    }

    try {
      const data = await apiCall('/users/profile', {
        method: 'PUT',
        body: formData,
      });
      
      // Update local context profile
      updateLocalUser({
        name: data.user.name,
        bio: data.user.bio,
        isPrivate: data.user.isPrivate,
        avatar: data.user.avatar,
      });

      // Update state profile
      setProfile(prev => ({
        ...prev,
        name: data.user.name,
        bio: data.user.bio,
        isPrivate: data.user.isPrivate,
        avatar: data.user.avatar,
      }));

      setIsEditModalOpen(false);
      alert('Profile updated successfully!');
    } catch (err) {
      alert(err.message || 'Failed to update profile');
    } finally {
      setEditLoading(false);
    }
  };

  const handleAcceptRequest = async (followerId) => {
    try {
      await apiCall(`/users/follow-requests/${followerId}`, {
        method: 'POST',
        body: JSON.stringify({ action: 'APPROVE' }),
      });
      setFollowRequests(prev => prev.filter(r => r.follower.id !== followerId));
      fetchProfile();
    } catch (err) {
      console.error(err);
    }
  };

  const handleRejectRequest = async (followerId) => {
    try {
      await apiCall(`/users/follow-requests/${followerId}`, {
        method: 'POST',
        body: JSON.stringify({ action: 'REJECT' }),
      });
      setFollowRequests(prev => prev.filter(r => r.follower.id !== followerId));
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenUsersList = async (type) => {
    if (!profile.canSeeContent) {
      alert('This profile is private. Follow to view followers/following.');
      return;
    }
    setUsersListTitle(type === 'followers' ? 'Followers' : 'Following');
    setUsersListModalOpen(true);
    setUsersListLoading(true);
    setUsersList([]);
    try {
      const data = await apiCall(`/users/profile/${username}/${type}`);
      setUsersList(type === 'followers' ? data.followers : data.following);
    } catch (err) {
      console.error(err);
      alert('Failed to load user list');
    } finally {
      setUsersListLoading(false);
    }
  };

  if (loading || !profile) {
    return <div className="text-center py-20 text-gray-500">Loading Profile...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-10 pb-16 animate-fade">
      
      {/* Profile Header Box */}
      <div className="bg-[#1f2833]/40 border border-purple-500/15 p-8 rounded-2xl backdrop-blur-md flex flex-col md:flex-row items-center md:items-start gap-8 select-none">
        
        {/* Avatar Ring */}
        <div className="w-28 h-28 rounded-full bg-gradient-to-tr from-purple-600 to-cyan-400 p-[3px] flex items-center justify-center shadow-lg">
          <img 
            src={profile.avatar || 'https://api.dicebear.com/7.x/identicon/svg?seed=aura'} 
            alt={profile.username} 
            className="w-full h-full rounded-full object-cover border-4 border-[#0b0c10]" 
          />
        </div>

        {/* Profile Info Details */}
        <div className="flex-1 space-y-4 text-center md:text-left">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <h2 className="text-2xl font-bold text-white flex items-center gap-1.5">
              @{profile.username}
              {profile.verified && <CheckCircle size={18} className="text-cyan-400" />}
            </h2>
            
            {profile.isMe ? (
              <button 
                onClick={() => setIsEditModalOpen(true)}
                className="py-1.5 px-4 bg-purple-600/20 hover:bg-purple-600/40 border border-purple-500/30 hover:border-purple-500/50 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              >
                <Edit3 size={13} />
                Edit Profile
              </button>
            ) : (
              <div className="flex gap-2">
                <button 
                  onClick={handleFollowToggle}
                  className={`py-1.5 px-5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                    profile.isFollowing 
                      ? 'bg-purple-600/20 text-white border border-purple-500/30'
                      : profile.isPending
                        ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                        : 'bg-gradient-to-r from-purple-600 to-cyan-500 text-white'
                  }`}
                >
                  {profile.isFollowing ? 'Following' : profile.isPending ? 'Pending' : 'Follow'}
                </button>

                {/* Direct Message button */}
                <button 
                  onClick={handleStartChat}
                  className="py-1.5 px-4 bg-purple-600/20 hover:bg-purple-600/40 border border-purple-500/30 hover:border-purple-500/50 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <MessageSquare size={13} />
                  Message
                </button>

                <button 
                  onClick={handleBlockUser}
                  className="p-2 bg-red-600/10 hover:bg-red-600/30 border border-red-500/20 text-red-400 rounded-xl transition cursor-pointer"
                >
                  <ShieldAlert size={14} />
                </button>
              </div>
            )}
          </div>

          {/* Counts */}
          <div className="flex gap-6 justify-center md:justify-start text-sm select-none">
            <span><strong className="text-white">{profile.postsCount}</strong> posts</span>
            <button 
              onClick={() => handleOpenUsersList('followers')} 
              className="hover:underline text-gray-300 hover:text-white"
            >
              <strong className="text-white">{profile.followersCount}</strong> followers
            </button>
            <button 
              onClick={() => handleOpenUsersList('following')} 
              className="hover:underline text-gray-300 hover:text-white"
            >
              <strong className="text-white">{profile.followingCount}</strong> following
            </button>
          </div>

          {/* Bio info */}
          <div className="space-y-1">
            <strong className="text-white block text-sm">{profile.name}</strong>
            <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{profile.bio || 'No bio yet.'}</p>
          </div>

          {/* Mutual Followers indicator row */}
          {!profile.isMe && mutualFollowers.length > 0 && (
            <div className="text-xs text-gray-400 mt-2 flex items-center gap-1.5 select-none">
              <span>Followed by </span>
              <div className="flex -space-x-1.5">
                {mutualFollowers.slice(0, 3).map((u) => (
                  <img 
                    key={u.id}
                    src={u.avatar || 'https://api.dicebear.com/7.x/identicon/svg?seed=aura'} 
                    className="w-5 h-5 rounded-full border border-[#0b0c10] object-cover"
                    title={`@${u.username}`}
                  />
                ))}
              </div>
              <span className="ml-1 text-[11px]">
                {mutualFollowers.slice(0, 2).map(u => `@${u.username}`).join(', ')}
                {mutualFollowers.length > 2 ? ` and ${mutualFollowers.length - 2} others` : ''}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Follow Requests pane (Private accounts only) */}
      {profile.isMe && profile.isPrivate && followRequests.length > 0 && (
        <div className="bg-[#1f2833]/30 border border-yellow-500/20 p-5 rounded-2xl backdrop-blur-md space-y-4 animate-fade">
          <h4 className="text-sm font-semibold text-yellow-400">Follow Requests ({followRequests.length})</h4>
          <div className="space-y-3">
            {followRequests.map(req => (
              <div key={req.follower.id} className="flex items-center justify-between bg-black/20 p-3 rounded-xl">
                <div className="flex items-center gap-2">
                  <img src={req.follower.avatar || 'https://api.dicebear.com/7.x/identicon/svg?seed=aura'} className="w-8 h-8 rounded-full object-cover" />
                  <span className="text-white text-xs font-semibold">@{req.follower.username}</span>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleAcceptRequest(req.follower.id)}
                    className="py-1 px-3 bg-green-600 hover:bg-green-500 text-white rounded text-[11px] font-bold"
                  >
                    Accept
                  </button>
                  <button 
                    onClick={() => handleRejectRequest(req.follower.id)}
                    className="py-1 px-3 bg-red-600 hover:bg-red-500 text-white rounded text-[11px] font-bold"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Posts Section */}
      <div className="space-y-6">
        <h3 className="text-white font-bold text-lg flex items-center gap-2 border-b border-purple-500/10 pb-3">
          <Grid size={18} />
          Posts
        </h3>

        {profile.canSeeContent ? (
          <div className="grid grid-cols-3 gap-3">
            {profile.posts.map(post => {
              const mainMedia = post.media && post.media[0] ? post.media[0].url : 'https://images.unsplash.com/photo-1502082553048-f009c37129b9?w=600';
              const isVideo = post.media && post.media[0] && post.media[0].type === 'VIDEO';

              return (
                <a 
                  key={post.id} 
                  href={`/posts/${post.id}`}
                  className="relative aspect-square bg-black border border-purple-500/5 hover:border-purple-500/20 rounded-xl overflow-hidden group shadow transition"
                >
                  {isVideo ? (
                    <video src={mainMedia} className="w-full h-full object-cover" muted />
                  ) : (
                    <img src={mainMedia} alt="Profile post" className="w-full h-full object-cover" />
                  )}
                  {/* Hover stats overlays */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-4 transition duration-200">
                    <span className="text-white text-xs font-bold flex items-center gap-1">
                      Likes ({post._count.likes})
                    </span>
                  </div>
                </a>
              );
            })}
          </div>
        ) : (
          /* Private Profile Locked Overlay */
          <div className="bg-[#1f2833]/20 border border-purple-500/10 p-16 text-center rounded-2xl flex flex-col items-center justify-center gap-3 select-none animate-fade">
            <Lock size={36} className="text-purple-400" />
            <h4 className="text-white font-semibold text-lg">This Account is Private</h4>
            <p className="text-gray-400 text-sm max-w-xs">
              Follow @{profile.username} to view their posts, stories, and reels.
            </p>
          </div>
        )}

        {profile.canSeeContent && profile.posts.length === 0 && (
          <p className="text-center text-gray-500 py-12">No posts uploaded yet.</p>
        )}
      </div>

      {/* Edit Profile Modal Drawer */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex justify-center items-center z-[1800]" onClick={() => setIsEditModalOpen(false)}>
          <div 
            className="w-full max-w-lg bg-[#12141c] border border-purple-500/25 p-6 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center border-b border-purple-500/10 pb-4 mb-5">
              <h3 className="text-white text-lg font-bold">Edit Profile Settings</h3>
              <button onClick={() => setIsEditModalOpen(false)} className="text-gray-400 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleEditProfileSubmit} className="space-y-5">
              
              {/* Profile Avatar selection */}
              <div className="flex flex-col items-center gap-3.5">
                <div className="relative w-20 h-20 rounded-full overflow-hidden border border-purple-500/20 group cursor-pointer" onClick={() => fileInputRef.current.click()}>
                  <img 
                    src={avatarPreviewUrl || profile.avatar || 'https://api.dicebear.com/7.x/identicon/svg?seed=aura'} 
                    alt="Preview" 
                    className="w-full h-full object-cover" 
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition duration-200">
                    <Upload size={18} />
                  </div>
                </div>
                <button 
                  type="button" 
                  onClick={() => fileInputRef.current.click()}
                  className="text-xs text-cyan-400 hover:underline"
                >
                  Change Profile Picture
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleAvatarFileChange} 
                  className="hidden" 
                  accept="image/*"
                />
              </div>

              {/* Name input */}
              <div className="space-y-1.5">
                <label className="text-xs text-gray-400 font-semibold block">Full Name</label>
                <input 
                  type="text" 
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full py-2.5 px-4 bg-black/30 border border-purple-500/15 rounded-xl text-white outline-none focus:border-cyan-400 text-sm"
                  required
                />
              </div>

              {/* Bio input */}
              <div className="space-y-1.5">
                <label className="text-xs text-gray-400 font-semibold block">Biography</label>
                <textarea 
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  className="w-full h-24 p-3 bg-black/30 border border-purple-500/15 rounded-xl text-white outline-none focus:border-cyan-400 text-sm resize-none"
                />
              </div>

              {/* Public Private toggle */}
              <div className="flex items-center justify-between p-3.5 bg-black/25 rounded-xl border border-purple-500/5">
                <div>
                  <strong className="text-white text-sm block">Private Account</strong>
                  <span className="text-[11px] text-gray-500">Only approved followers can see your posts.</span>
                </div>
                <input 
                  type="checkbox" 
                  checked={editIsPrivate}
                  onChange={(e) => setEditIsPrivate(e.target.checked)}
                  className="w-4 h-4 rounded accent-purple-500"
                />
              </div>

              {/* Save triggers */}
              <button 
                type="submit" 
                disabled={editLoading}
                className="w-full py-3 bg-gradient-to-r from-purple-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 text-white font-semibold rounded-xl text-sm shadow-md transition transform active:scale-95 disabled:opacity-50 select-none cursor-pointer"
              >
                {editLoading ? 'Saving changes to Cloudinary...' : 'Save Settings'}
              </button>

            </form>
          </div>
        </div>
      )}

      {/* MODAL: Followers / Following list view */}
      {usersListModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex justify-center items-center z-[1800]" onClick={() => setUsersListModalOpen(false)}>
          <div 
            className="w-full max-w-sm bg-[#12141c] border border-purple-500/25 p-5 rounded-2xl shadow-2xl flex flex-col max-h-[75vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center border-b border-purple-500/10 pb-3 mb-4">
              <h3 className="text-white text-base font-bold">{usersListTitle}</h3>
              <button onClick={() => setUsersListModalOpen(false)} className="text-gray-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 custom-scrollbar">
              {usersListLoading ? (
                <div className="text-center py-10 text-xs text-gray-500">Loading list...</div>
              ) : usersList.length === 0 ? (
                <div className="text-center py-10 text-xs text-gray-500">No users found</div>
              ) : (
                usersList.map((u) => (
                  <div 
                    key={u.id}
                    onClick={() => {
                      setUsersListModalOpen(false);
                      navigate(`/profile/${u.username}`);
                    }}
                    className="flex items-center gap-3 p-2 hover:bg-white/5 rounded-xl cursor-pointer border border-white/5 transition"
                  >
                    <img 
                      src={u.avatar || 'https://api.dicebear.com/7.x/identicon/svg?seed=aura'} 
                      alt={u.username} 
                      className="w-9 h-9 rounded-full object-cover" 
                    />
                    <div className="flex-1 overflow-hidden">
                      <strong className="text-white text-xs block truncate">@{u.username}</strong>
                      <span className="text-gray-400 text-[10px] block truncate">{u.name}</span>
                    </div>
                    <ChevronRight size={13} className="text-gray-500" />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
