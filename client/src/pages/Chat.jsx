import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { 
  Send, Image, Smile, ArrowLeft, MoreVertical, ShieldAlert, Check, CheckCheck, 
  Pin, Trash, Forward, Reply, Eye, EyeOff, Clock, Plus, Search, X, 
  ChevronRight, UserPlus, Users, VolumeX, Folder, Info, UserCheck, Edit3, Settings, AlertTriangle,
  Archive
} from 'lucide-react';

export default function Chat() {
  const { apiCall, user } = useAuth();
  const { socket } = useSocket();
  
  const [rooms, setRooms] = useState([]);
  const [activeRoom, setActiveRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  
  // Sidebar Search and Tabs
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('All'); // 'All' | 'Pinned' | 'Archived'

  // Modals & Panels
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [showDetailsPane, setShowDetailsPane] = useState(false);

  // Group Details Modal inputs
  const [groupName, setGroupName] = useState('');
  const [groupDesc, setGroupDesc] = useState('');
  const [groupSearchQuery, setGroupSearchQuery] = useState('');
  const [groupUsersResult, setGroupUsersResult] = useState([]);
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [suggestedUsers, setSuggestedUsers] = useState([]);

  // Forwarding / Replies / Disappearing / View Once
  const [forwardingMessage, setForwardingMessage] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [disappearingTimer, setDisappearingTimer] = useState(null); // in seconds
  const [viewOnceMode, setViewOnceMode] = useState(false);

  // File Uploads
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [filePreviews, setFilePreviews] = useState([]);

  // Room message search
  const [isSearchingMessages, setIsSearchingMessages] = useState(false);
  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  const [messageSearchResults, setMessageSearchResults] = useState([]);

  // Emoji reactions picker
  const [reactionActiveMessageId, setReactionActiveMessageId] = useState(null);

  // Typing Indicators
  const [isTyping, setIsTyping] = useState(false);
  const [typingUsers, setTypingUsers] = useState([]); // Array of { roomId, username }
  const typingTimeoutRef = useRef(null);

  // View-once modal
  const [viewOnceOpenMedia, setViewOnceOpenMedia] = useState(null);
  const [viewOnceOpenMessageId, setViewOnceOpenMessageId] = useState(null);

  // Local message expiration map
  const [expirations, setExpirations] = useState({});

  const messagesEndRef = useRef(null);
  const chatMediaInputRef = useRef(null);
  const emojiPickerRef = useRef(null);

  // Close emoji picker when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target)) {
        setReactionActiveMessageId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loadRooms = async () => {
    try {
      const data = await apiCall('/chat/rooms');
      setRooms(data.rooms);
      
      const params = new URLSearchParams(window.location.search);
      const autoRoomId = params.get('room');
      if (autoRoomId) {
        const found = data.rooms.find(r => r.id === autoRoomId);
        if (found) {
          setActiveRoom(found);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadMessages = async (roomId) => {
    try {
      const data = await apiCall(`/chat/rooms/${roomId}/messages`);
      setMessages(data.messages);
      
      // Seed self-destruct timers
      const now = new Date().getTime();
      const newExpirations = {};
      data.messages.forEach(msg => {
        if (msg.selfDestructTimer) {
          const createdAt = new Date(msg.createdAt).getTime();
          const elapsed = (now - createdAt) / 1000;
          const remaining = Math.max(0, Math.round(msg.selfDestructTimer - elapsed));
          if (remaining > 0) {
            newExpirations[msg.id] = remaining;
          }
        }
      });
      setExpirations(newExpirations);

      if (socket) {
        socket.emit('mark_read', { roomId });
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadRooms();
    fetchSuggestions();
  }, []);

  const fetchSuggestions = async () => {
    try {
      const data = await apiCall('/users/suggested');
      setSuggestedUsers(data.suggestions);
    } catch (e) {
      console.error(e);
    }
  };

  // User search for Group
  useEffect(() => {
    if (!groupSearchQuery.trim()) {
      setGroupUsersResult([]);
      return;
    }
    const delayDebounce = setTimeout(async () => {
      try {
        const data = await apiCall(`/posts/search/users?q=${groupSearchQuery}`);
        setGroupUsersResult(data.users);
      } catch (err) {
        console.error(err);
      }
    }, 400);
    return () => clearTimeout(delayDebounce);
  }, [groupSearchQuery]);

  // Periodic decrement of expiring messages
  useEffect(() => {
    const interval = setInterval(() => {
      setExpirations((prev) => {
        const next = { ...prev };
        let changed = false;
        Object.keys(next).forEach((id) => {
          if (next[id] > 0) {
            next[id] -= 1;
            changed = true;
          } else {
            delete next[id];
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Keyboard Screenshot shortcut detection listener
  useEffect(() => {
    const handleScreenshotShortcut = (e) => {
      if (
        e.key === 'PrintScreen' || 
        (e.ctrlKey && e.key === 'p') || 
        (e.metaKey && e.shiftKey && (e.key === '3' || e.key === '4' || e.key === '5'))
      ) {
        if (activeRoom && socket) {
          socket.emit('screenshot_taken', { roomId: activeRoom.id });
        }
      }
    };
    window.addEventListener('keydown', handleScreenshotShortcut);
    return () => window.removeEventListener('keydown', handleScreenshotShortcut);
  }, [activeRoom, socket]);

  // WebSocket listeners
  useEffect(() => {
    if (!socket) return;

    const handleReceiveMessage = (msg) => {
      if (activeRoom && msg.roomId === activeRoom.id) {
        // Exclude if deleted for me
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        scrollToBottom();

        // Seed timer if disappearing
        if (msg.selfDestructTimer) {
          setExpirations((prev) => ({ ...prev, [msg.id]: msg.selfDestructTimer }));
        }

        socket.emit('mark_read', { roomId: activeRoom.id });
      }
      loadRooms();
    };

    const handleMessagesRead = (data) => {
      if (activeRoom && data.roomId === activeRoom.id) {
        setMessages((prev) => prev.map(m => m.senderId !== user.id ? m : { ...m, status: 'READ' }));
      }
    };

    const handleReactionUpdate = (data) => {
      if (activeRoom) {
        setMessages((prev) => prev.map(m => {
          if (m.id === data.messageId) {
            const currentReactions = m.reactions || [];
            // Remove existing reaction by user if matching, then append
            const filtered = currentReactions.filter(r => r.userId !== data.msgReaction.userId);
            return {
              ...m,
              reactions: [...filtered, data.msgReaction]
            };
          }
          return m;
        }));
      }
    };

    const handleUserTyping = (data) => {
      if (activeRoom && data.roomId === activeRoom.id) {
        setTypingUsers((prev) => {
          if (prev.some(t => t === data.username)) return prev;
          return [...prev, data.username];
        });
      }
    };

    const handleUserStopTyping = (data) => {
      if (activeRoom && data.roomId === activeRoom.id) {
        setTypingUsers((prev) => prev.filter(t => t !== data.username));
      }
    };

    const handleScreenshotNotified = (data) => {
      if (activeRoom && data.roomId === activeRoom.id) {
        const sysMsg = {
          id: `screenshot-${Date.now()}`,
          isSystem: true,
          text: `@${data.username} took a screenshot! 📸`,
          createdAt: new Date().toISOString()
        };
        setMessages((prev) => [...prev, sysMsg]);
        scrollToBottom();
      }
    };

    const handleUserPresence = (data) => {
      // data: { userId, isOnline, lastSeen }
      setRooms((prev) => prev.map(room => {
        if (!room.isGroup && room.otherUser?.id === data.userId) {
          return {
            ...room,
            otherUser: {
              ...room.otherUser,
              isOnline: data.isOnline,
              lastSeen: data.lastSeen
            }
          };
        }
        return room;
      }));

      if (activeRoom && !activeRoom.isGroup && activeRoom.otherUser?.id === data.userId) {
        setActiveRoom(prev => ({
          ...prev,
          otherUser: {
            ...prev.otherUser,
            isOnline: data.isOnline,
            lastSeen: data.lastSeen
          }
        }));
      }
    };

    socket.on('receive_message', handleReceiveMessage);
    socket.on('messages_read', handleMessagesRead);
    socket.on('message_reaction_update', handleReactionUpdate);
    socket.on('user_typing', handleUserTyping);
    socket.on('user_stop_typing', handleUserStopTyping);
    socket.on('screenshot_notified', handleScreenshotNotified);
    socket.on('user_presence', handleUserPresence);

    return () => {
      socket.off('receive_message', handleReceiveMessage);
      socket.off('messages_read', handleMessagesRead);
      socket.off('message_reaction_update', handleReactionUpdate);
      socket.off('user_typing', handleUserTyping);
      socket.off('user_stop_typing', handleUserStopTyping);
      socket.off('screenshot_notified', handleScreenshotNotified);
      socket.off('user_presence', handleUserPresence);
    };
  }, [socket, activeRoom]);

  useEffect(() => {
    if (activeRoom) {
      loadMessages(activeRoom.id);
      setTypingUsers([]);
      setIsSearchingMessages(false);
      setMessageSearchResults([]);
      setMessageSearchQuery('');
      if (socket) {
        socket.emit('join_room', { roomId: activeRoom.id });
      }
    }
  }, [activeRoom]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSelectRoom = (room) => {
    setActiveRoom(room);
  };

  // Local search message logic
  const handleSearchMessages = async (e) => {
    e.preventDefault();
    if (!messageSearchQuery.trim() || !activeRoom) return;

    try {
      const data = await apiCall(`/chat/rooms/${activeRoom.id}/search?q=${messageSearchQuery}`);
      setMessageSearchResults(data.messages);
    } catch (err) {
      console.error(err);
    }
  };

  // Local typing indicators dispatch
  const handleInputChange = (e) => {
    setMessageText(e.target.value);

    if (socket && activeRoom) {
      if (!isTyping) {
        setIsTyping(true);
        socket.emit('typing', { roomId: activeRoom.id });
      }

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

      typingTimeoutRef.current = setTimeout(() => {
        setIsTyping(false);
        socket.emit('stop_typing', { roomId: activeRoom.id });
      }, 2500);
    }
  };

  // Send files and message
  const handleSendPayload = async (e) => {
    e.preventDefault();
    if (!messageText.trim() && selectedFiles.length === 0) return;
    if (!activeRoom || !socket) return;

    let mediaPayload = [];

    // If attachment files exist, upload them first via REST stream
    if (selectedFiles.length > 0) {
      setUploading(true);
      const formData = new FormData();
      selectedFiles.forEach(f => {
        formData.append('media', f);
      });
      try {
        const uploadRes = await apiCall(`/chat/rooms/${activeRoom.id}/upload-media`, {
          method: 'POST',
          body: formData
        });
        mediaPayload = uploadRes.media;
      } catch (err) {
        alert(err.message || 'File upload failed');
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    // Emit socket event
    socket.emit('send_message', {
      roomId: activeRoom.id,
      text: messageText,
      replyToId: replyingTo?.id || null,
      isForwarded: false,
      isViewOnce: viewOnceMode,
      selfDestructTimer: disappearingTimer,
      media: mediaPayload
    });

    // Reset states
    setMessageText('');
    setReplyingTo(null);
    setSelectedFiles([]);
    setFilePreviews([]);
    setViewOnceMode(false);
  };

  const handleSelectFiles = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setSelectedFiles((prev) => [...prev, ...files]);

    const newPreviews = files.map(file => {
      const url = URL.createObjectURL(file);
      let type = 'FILE';
      if (file.type.startsWith('image/')) type = 'IMAGE';
      else if (file.type.startsWith('video/')) type = 'VIDEO';
      else if (file.type.startsWith('audio/')) type = 'VOICE';
      return { url, type, name: file.name };
    });

    setFilePreviews((prev) => [...prev, ...newPreviews]);
  };

  const handleRemoveFilePreview = (index) => {
    URL.revokeObjectURL(filePreviews[index].url);
    setFilePreviews((prev) => prev.filter((_, idx) => idx !== index));
    setSelectedFiles((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSendReaction = (messageId, emoji) => {
    if (socket && activeRoom) {
      socket.emit('react_message', {
        messageId,
        reaction: emoji,
        roomId: activeRoom.id
      });
      setReactionActiveMessageId(null);
    }
  };

  const handleCreateGroupSubmit = async (e) => {
    e.preventDefault();
    if (!groupName.trim()) return;

    try {
      const res = await apiCall('/chat/groups/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: groupName,
          description: groupDesc,
          targetUserIds: selectedUserIds
        })
      });
      setShowGroupModal(false);
      setGroupName('');
      setGroupDesc('');
      setSelectedUserIds([]);
      loadRooms();
      // Auto select newly created group room
      const data = await apiCall('/chat/rooms');
      const newRoom = data.rooms.find(r => r.id === res.roomId);
      if (newRoom) setActiveRoom(newRoom);
    } catch (err) {
      alert(err.message || 'Failed to create group');
    }
  };

  const handleAddMemberSubmit = async (e) => {
    e.preventDefault();
    if (selectedUserIds.length === 0 || !activeRoom) return;

    try {
      await apiCall(`/chat/groups/${activeRoom.id}/add-members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: selectedUserIds })
      });
      setShowAddMemberModal(false);
      setSelectedUserIds([]);
      alert('Members added successfully');
      // Reload active room participants
      loadRooms();
      const roomsData = await apiCall('/chat/rooms');
      const updated = roomsData.rooms.find(r => r.id === activeRoom.id);
      if (updated) setActiveRoom(updated);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleRemoveMember = async (targetUserId) => {
    if (!activeRoom) return;
    if (!window.confirm('Remove this member from the group?')) return;

    try {
      await apiCall(`/chat/groups/${activeRoom.id}/remove-member`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId })
      });
      alert('Member removed');
      loadRooms();
      const roomsData = await apiCall('/chat/rooms');
      const updated = roomsData.rooms.find(r => r.id === activeRoom.id);
      if (updated) setActiveRoom(updated);
    } catch (err) {
      alert(err.message);
    }
  };

  const handlePromoteAdmin = async (targetUserId) => {
    if (!activeRoom) return;
    if (!window.confirm('Promote this member to group admin?')) return;

    try {
      await apiCall(`/chat/groups/${activeRoom.id}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId })
      });
      alert('Member promoted');
      loadRooms();
      const roomsData = await apiCall('/chat/rooms');
      const updated = roomsData.rooms.find(r => r.id === activeRoom.id);
      if (updated) setActiveRoom(updated);
    } catch (err) {
      alert(err.message);
    }
  };

  const handlePinRoomToggle = async (roomId) => {
    try {
      const data = await apiCall(`/chat/rooms/${roomId}/pin`, { method: 'POST' });
      setRooms(prev => prev.map(r => r.id === roomId ? { ...r, isPinned: data.isPinned } : r));
      if (activeRoom && activeRoom.id === roomId) {
        setActiveRoom(prev => ({ ...prev, isPinned: data.isPinned }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleArchiveRoomToggle = async (roomId) => {
    try {
      const data = await apiCall(`/chat/rooms/${roomId}/archive`, { method: 'POST' });
      setRooms(prev => prev.map(r => r.id === roomId ? { ...r, isArchived: data.isArchived } : r));
      if (activeRoom && activeRoom.id === roomId) {
        setActiveRoom(prev => ({ ...prev, isArchived: data.isArchived }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleMuteRoomToggle = async (roomId) => {
    try {
      const data = await apiCall(`/chat/rooms/${roomId}/mute`, { method: 'POST' });
      setRooms(prev => prev.map(r => r.id === roomId ? { ...r, isMuted: data.isMuted } : r));
      if (activeRoom && activeRoom.id === roomId) {
        setActiveRoom(prev => ({ ...prev, isMuted: data.isMuted }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleTogglePinMessage = async (messageId) => {
    try {
      const res = await apiCall(`/chat/messages/${messageId}/pin`, { method: 'POST' });
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, isPinned: res.message.isPinned } : m));
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteMessageMe = async (messageId) => {
    try {
      await apiCall(`/chat/messages/${messageId}/me`, { method: 'DELETE' });
      setMessages(prev => prev.filter(m => m.id !== messageId));
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteMessageEveryone = async (messageId) => {
    try {
      const res = await apiCall(`/chat/messages/${messageId}/everyone`, { method: 'DELETE' });
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, isDeletedForEveryone: true, text: 'This message was deleted', media: [], mediaUrl: null } : m));
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenViewOnce = (media, messageId) => {
    setViewOnceOpenMedia(media);
    setViewOnceOpenMessageId(messageId);
  };

  const handleCloseViewOnce = async () => {
    if (!viewOnceOpenMessageId) return;

    try {
      await apiCall(`/chat/messages/${viewOnceOpenMessageId}/view-once`, { method: 'POST' });
      // Remove it locally & update message
      setMessages(prev => prev.map(m => m.id === viewOnceOpenMessageId ? { ...m, isDeletedForEveryone: true, text: 'Opened view-once media', media: [], mediaUrl: null } : m));
    } catch (err) {
      console.error(err);
    }

    setViewOnceOpenMedia(null);
    setViewOnceOpenMessageId(null);
  };

  const handleTriggerForward = (msg) => {
    setForwardingMessage(msg);
    setShowForwardModal(true);
  };

  const handleForwardMessageToRoom = async (targetRoomId) => {
    if (!forwardingMessage || !socket) return;

    // Send payload forward via WebSocket
    socket.emit('send_message', {
      roomId: targetRoomId,
      text: forwardingMessage.text || '',
      isForwarded: true,
      media: forwardingMessage.media ? forwardingMessage.media.map(m => ({
        url: m.url,
        type: m.type,
        name: m.name,
        size: m.size
      })) : []
    });

    setShowForwardModal(false);
    setForwardingMessage(null);
    alert('Message forwarded!');
  };

  // Filter rooms by search input and Pinned/Archived tab selection
  const filteredRooms = rooms.filter(room => {
    const matchesSearch = room.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
      room.otherUser?.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      room.otherUser?.name?.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (!matchesSearch) return false;

    if (activeTab === 'Pinned') {
      return room.isPinned && !room.isArchived;
    } else if (activeTab === 'Archived') {
      return room.isArchived;
    } else {
      // 'All' tab
      return !room.isArchived;
    }
  });

  // Extract shared media list from room message history
  const activeRoomSharedMedia = messages.reduce((acc, msg) => {
    if (msg.media && msg.media.length > 0) {
      return [...acc, ...msg.media];
    }
    return acc;
  }, []);

  const activeOtherUser = activeRoom?.otherUser || null;

  return (
    <div className="max-w-6xl mx-auto h-[84vh] bg-[#12141c]/55 border border-purple-500/10 rounded-2xl overflow-hidden backdrop-blur-xl grid grid-cols-1 md:grid-cols-[290px_1fr] select-none animate-fade shadow-2xl relative">
      
      {/* Sidebar Section */}
      <div className={`border-r border-purple-500/10 flex flex-col h-full bg-[#0b0c10]/40 ${activeRoom ? 'hidden md:flex' : 'flex'}`}>
        
        {/* Sidebar Header & Create Group */}
        <div className="p-4 border-b border-purple-500/10 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-extrabold text-base tracking-wide bg-gradient-to-r from-purple-400 to-cyan-300 bg-clip-text text-transparent">Conversations</h3>
            <button 
              onClick={() => {
                setShowGroupModal(true);
                fetchSuggestions();
              }}
              className="p-1.5 bg-purple-500/10 hover:bg-purple-500/25 border border-purple-500/30 text-purple-400 rounded-lg transition"
              title="Create Group Chat"
            >
              <Users size={15} />
            </button>
          </div>

          {/* Search box */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-3 text-gray-500" />
            <input 
              type="text" 
              placeholder="Search chats..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-black/45 border border-purple-500/10 rounded-xl text-xs text-white outline-none focus:border-cyan-400 transition"
            />
          </div>
        </div>

        {/* Custom Tabs */}
        <div className="flex border-b border-purple-500/5 px-2 bg-black/10">
          {['All', 'Pinned', 'Archived'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 text-center text-xs font-semibold border-b-2 transition ${
                activeTab === tab 
                  ? 'text-cyan-400 border-cyan-400 bg-cyan-400/5' 
                  : 'text-gray-500 border-transparent hover:text-gray-300'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Sidebar Rooms list */}
        <div className="flex-1 overflow-y-auto divide-y divide-purple-500/5 custom-scrollbar">
          {filteredRooms.map((room) => {
            const lastMsg = room.lastMessage;
            const isRoomActive = activeRoom?.id === room.id;
            return (
              <div 
                key={room.id}
                className={`flex items-center gap-3 p-3.5 cursor-pointer transition relative group ${
                  isRoomActive ? 'bg-purple-600/10 border-l-4 border-cyan-400' : 'hover:bg-white/5'
                }`}
              >
                {/* Visual Avatar block */}
                <div onClick={() => handleSelectRoom(room)} className="flex-1 flex items-center gap-3 overflow-hidden">
                  <div className="relative">
                    <img 
                      src={room.avatar || 'https://api.dicebear.com/7.x/identicon/svg?seed=aura'} 
                      alt={room.name} 
                      className="w-10 h-10 rounded-full object-cover border border-purple-500/10" 
                    />
                    {!room.isGroup && room.otherUser?.isOnline && (
                      <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-[#12141c] rounded-full" />
                    )}
                  </div>

                  <div className="overflow-hidden flex-1">
                    <div className="flex justify-between items-center">
                      <span className="text-white text-xs font-bold block truncate max-w-[130px]">
                        {room.isGroup ? room.name : `@${room.otherUser?.username}`}
                      </span>
                      {lastMsg && (
                        <span className="text-[9px] text-gray-500">
                          {new Date(lastMsg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>

                    <p className="text-gray-400 text-[10px] truncate mt-0.5 max-w-[170px]">
                      {lastMsg ? (
                        <>
                          <span className="text-[10px] text-purple-400 mr-0.5">@{lastMsg.sender?.username}:</span>
                          {lastMsg.text || 'Shared attachment(s)'}
                        </>
                      ) : 'Open conversation'}
                    </p>
                  </div>
                </div>

                {/* Sidebar room states icons & unread badge */}
                <div className="flex flex-col items-end gap-1.5">
                  {room.unreadCount > 0 && (
                    <span className="bg-gradient-to-r from-purple-500 to-cyan-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full scale-90">
                      {room.unreadCount}
                    </span>
                  )}
                  <div className="flex gap-1 opacity-40 group-hover:opacity-100 transition duration-150">
                    <button onClick={() => handlePinRoomToggle(room.id)} className={`text-gray-400 hover:text-cyan-400 ${room.isPinned ? 'text-cyan-400' : ''}`}>
                      <Pin size={10} />
                    </button>
                    <button onClick={() => handleArchiveRoomToggle(room.id)} className={`text-gray-400 hover:text-purple-400 ${room.isArchived ? 'text-purple-400' : ''}`}>
                      <Archive size={10} />
                    </button>
                    <button onClick={() => handleMuteRoomToggle(room.id)} className={`text-gray-400 hover:text-yellow-400 ${room.isMuted ? 'text-yellow-400' : ''}`}>
                      <VolumeX size={10} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {filteredRooms.length === 0 && (
            <p className="text-center text-xs text-gray-500 py-12">No active rooms found</p>
          )}
        </div>
      </div>

      {/* Main Messages Pane */}
      <div className={`flex flex-col h-full bg-black/10 relative ${!activeRoom ? 'hidden md:flex items-center justify-center' : 'flex'}`}>
        
        {activeRoom ? (
          /* Active Chat Layout grid */
          <div className="flex-1 flex flex-col h-full min-w-0">
            
            {/* Header section */}
            <div className="p-4 border-b border-purple-500/10 flex items-center justify-between bg-[#0b0c10]/35 z-10">
              <div className="flex items-center gap-3">
                <button onClick={() => setActiveRoom(null)} className="md:hidden text-gray-400 hover:text-white mr-1">
                  <ArrowLeft size={19} />
                </button>
                <div className="relative">
                  <img 
                    src={activeRoom.avatar || 'https://api.dicebear.com/7.x/identicon/svg?seed=aura'} 
                    alt={activeRoom.name} 
                    className="w-10 h-10 rounded-full object-cover border border-purple-500/10" 
                  />
                  {!activeRoom.isGroup && activeOtherUser?.isOnline && (
                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border border-[#12141c] rounded-full" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    {activeRoom.isGroup ? (
                      <span className="text-white text-sm font-bold">{activeRoom.name}</span>
                    ) : (
                      <a href={`/profile/${activeOtherUser?.username}`} className="text-white text-sm font-bold hover:underline">
                        @{activeOtherUser?.username}
                      </a>
                    )}
                  </div>
                  <span className="text-[10px] text-gray-500 block">
                    {activeRoom.isGroup 
                      ? `${activeRoom.participants?.length || 0} participants` 
                      : activeOtherUser?.isOnline 
                        ? 'Active Now' 
                        : activeOtherUser?.lastSeen 
                          ? `Last seen: ${new Date(activeOtherUser.lastSeen).toLocaleDateString()} ${new Date(activeOtherUser.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                          : 'Offline'
                    }
                  </span>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {/* Search icon button */}
                <button 
                  onClick={() => setIsSearchingMessages(!isSearchingMessages)}
                  className={`p-2 rounded-xl transition ${isSearchingMessages ? 'bg-cyan-500/10 text-cyan-400' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                >
                  <Search size={16} />
                </button>
                
                {/* Details drawer button */}
                <button 
                  onClick={() => setShowDetailsPane(!showDetailsPane)}
                  className={`p-2 rounded-xl transition ${showDetailsPane ? 'bg-purple-500/10 text-purple-400' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                >
                  <Info size={16} />
                </button>
                
                {/* Chat options actions */}
                <div className="relative group/opt">
                  <button className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition">
                    <MoreVertical size={16} />
                  </button>
                  {/* Floating Action Menu dropdown */}
                  <div className="absolute right-0 top-9 bg-[#12141c] border border-purple-500/20 rounded-xl py-1.5 w-44 z-40 hidden group-hover/opt:block shadow-2xl animate-fade">
                    <button onClick={() => handlePinRoomToggle(activeRoom.id)} className="w-full text-left text-xs text-white hover:bg-white/5 px-4 py-2 flex items-center gap-2">
                      <Pin size={12} /> {activeRoom.isPinned ? 'Unpin Chat' : 'Pin Chat'}
                    </button>
                    <button onClick={() => handleArchiveRoomToggle(activeRoom.id)} className="w-full text-left text-xs text-white hover:bg-white/5 px-4 py-2 flex items-center gap-2">
                      <Archive size={12} /> {activeRoom.isArchived ? 'Unarchive Chat' : 'Archive Chat'}
                    </button>
                    <button onClick={() => handleMuteRoomToggle(activeRoom.id)} className="w-full text-left text-xs text-white hover:bg-white/5 px-4 py-2 flex items-center gap-2">
                      <VolumeX size={12} /> {activeRoom.isMuted ? 'Unmute Chat' : 'Mute Chat'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Sub-Header Message Search Box */}
            {isSearchingMessages && (
              <form onSubmit={handleSearchMessages} className="bg-[#12141c]/55 border-b border-purple-500/10 p-3 flex gap-2 animate-fade">
                <input 
                  type="text" 
                  placeholder="Search message history..."
                  value={messageSearchQuery}
                  onChange={(e) => setMessageSearchQuery(e.target.value)}
                  className="flex-1 py-1.5 px-3 bg-black/30 border border-purple-500/10 rounded-lg text-xs text-white outline-none focus:border-cyan-400"
                />
                <button type="submit" className="bg-gradient-to-r from-purple-600 to-cyan-500 px-4 text-xs font-semibold rounded-lg text-white">
                  Search
                </button>
                <button 
                  type="button" 
                  onClick={() => {
                    setIsSearchingMessages(false);
                    setMessageSearchResults([]);
                    setMessageSearchQuery('');
                  }}
                  className="p-1.5 text-gray-500 hover:text-white"
                >
                  <X size={15} />
                </button>
              </form>
            )}

            {/* Main Area flex */}
            <div className="flex-1 flex relative overflow-hidden min-h-0">
              
              {/* Message scroll list */}
              <div className="flex-1 flex flex-col min-w-0">
                <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-black/5">
                  
                  {/* If message results active */}
                  {messageSearchResults.length > 0 && (
                    <div className="bg-[#1f2833]/30 border border-cyan-500/25 p-3 rounded-xl mb-4 text-xs">
                      <span className="text-cyan-400 font-bold block mb-1">Search Results ({messageSearchResults.length})</span>
                      <div className="space-y-2">
                        {messageSearchResults.map((m) => (
                          <div 
                            key={m.id} 
                            onClick={() => {
                              // Highlight or scroll to message
                              const element = document.getElementById(`msg-${m.id}`);
                              element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              element?.classList.add('bg-purple-500/30');
                              setTimeout(() => element?.classList.remove('bg-purple-500/30'), 3000);
                              setMessageSearchResults([]);
                              setIsSearchingMessages(false);
                            }}
                            className="p-2 bg-black/30 rounded cursor-pointer hover:bg-white/5 border border-white/5"
                          >
                            <strong className="text-white">@{m.sender?.username}:</strong> {m.text}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Standard Messages list */}
                  {messages.map((msg) => {
                    if (msg.isSystem) {
                      return (
                        <div key={msg.id} className="flex justify-center text-center">
                          <span className="bg-[#1f2833]/35 text-[10px] text-gray-400 py-1 px-3.5 border border-purple-500/10 rounded-full italic">
                            {msg.text}
                          </span>
                        </div>
                      );
                    }

                    const isMe = msg.senderId === user.id;
                    const expirationRemaining = expirations[msg.id];

                    return (
                      <div 
                        id={`msg-${msg.id}`}
                        key={msg.id}
                        className={`flex items-end gap-2.5 transition duration-500 ${isMe ? 'justify-end' : 'justify-start'}`}
                      >
                        {!isMe && (
                          <img 
                            src={msg.sender?.avatar || 'https://api.dicebear.com/7.x/identicon/svg?seed=aura'} 
                            className="w-7.5 h-7.5 rounded-full object-cover border border-purple-500/10" 
                            alt={msg.sender?.username}
                          />
                        )}

                        <div className="relative group max-w-[70%]">
                          
                          {/* Parent Message Reply Block */}
                          {msg.replyTo && (
                            <div className="bg-black/30 border-l-2 border-cyan-400 p-1.5 px-2 rounded-t-xl text-[10px] text-gray-400 mb-[-4px] block max-w-full truncate">
                              <span className="text-cyan-400 font-bold block">@{msg.replyTo.sender?.username}</span>
                              {msg.replyTo.text || 'Attachment'}
                            </div>
                          )}

                          {/* Forwarded indicator */}
                          {msg.isForwarded && (
                            <span className="text-[9px] text-gray-500 italic block mb-0.5">Forwarded</span>
                          )}

                          {/* Message Body Container */}
                          <div 
                            className={`p-3 rounded-2xl text-sm leading-relaxed ${
                              isMe 
                                ? 'bg-gradient-to-tr from-purple-600 to-cyan-500 text-white rounded-br-none' 
                                : 'bg-[#1f2833]/65 text-white rounded-bl-none border border-purple-500/10 shadow-lg'
                            } ${msg.isPinned ? 'border border-yellow-500/30' : ''}`}
                          >
                            
                            {/* Pinned label */}
                            {msg.isPinned && (
                              <span className="text-[9px] text-yellow-400 font-semibold flex items-center gap-1 mb-1">
                                <Pin size={10} /> Pinned Message
                              </span>
                            )}

                            {/* View Once logic block */}
                            {msg.isViewOnce ? (
                              msg.isDeletedForEveryone ? (
                                <span className="text-xs text-gray-500 italic flex items-center gap-1.5">
                                  <EyeOff size={13} /> Opened view-once media
                                </span>
                              ) : (
                                isMe ? (
                                  <span className="text-xs text-gray-400 flex items-center gap-1.5">
                                    <Eye size={13} /> Sent view-once media
                                  </span>
                                ) : (
                                  <button 
                                    onClick={() => handleOpenViewOnce(msg.media[0] || { url: msg.mediaUrl, type: 'IMAGE' }, msg.id)}
                                    className="py-1.5 px-3 bg-purple-500/20 hover:bg-purple-500/40 border border-purple-500/30 text-purple-300 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition active:scale-95"
                                  >
                                    <Eye size={14} /> Open view-once media
                                  </button>
                                )
                              )
                            ) : (
                              /* Standard media attachments renderer */
                              <>
                                {msg.media && msg.media.length > 0 && (
                                  <div className={`grid gap-1 mb-2 ${msg.media.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                    {msg.media.map((item) => (
                                      <div key={item.id} className="relative group/media rounded-lg overflow-hidden border border-white/5 bg-black/20">
                                        {item.type === 'IMAGE' && (
                                          <img 
                                            src={item.url} 
                                            alt={item.name} 
                                            className="max-h-[220px] w-full object-cover cursor-pointer hover:scale-105 transition"
                                            onClick={() => window.open(item.url)}
                                          />
                                        )}
                                        {item.type === 'VIDEO' && (
                                          <video 
                                            src={item.url} 
                                            controls 
                                            className="max-h-[220px] w-full object-cover" 
                                          />
                                        )}
                                        {item.type === 'VOICE' && (
                                          <audio 
                                            src={item.url} 
                                            controls 
                                            className="w-[200px] max-w-full p-1 bg-black/35 rounded-lg"
                                          />
                                        )}
                                        {item.type === 'FILE' && (
                                          <a 
                                            href={item.url} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="p-3 bg-black/40 text-cyan-400 font-bold hover:underline flex items-center gap-2 text-xs"
                                          >
                                            <Folder size={16} />
                                            <span className="truncate max-w-[130px]">{item.name || 'View File'}</span>
                                          </a>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                                
                                <p className="whitespace-pre-wrap">{msg.text}</p>
                              </>
                            )}
                          </div>

                          {/* Message meta box */}
                          <div className="flex justify-between mt-1 text-[9px] text-gray-500 gap-2 items-center">
                            <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            
                            {/* Disappearing timer indicator */}
                            {expirationRemaining !== undefined && (
                              <span className="text-yellow-400/80 font-bold flex items-center gap-0.5">
                                <Clock size={8} /> {expirationRemaining}s
                              </span>
                            )}

                            {isMe && (
                              <span>
                                {msg.status === 'READ' ? <CheckCheck size={11} className="text-cyan-400" /> : <Check size={11} />}
                              </span>
                            )}
                          </div>

                          {/* Emoji reactions summary */}
                          {msg.reactions && msg.reactions.length > 0 && (
                            <div className="absolute -bottom-2 right-1.5 flex gap-0.5 bg-[#12141c] border border-purple-500/15 px-1 py-0.5 rounded-full text-[10px] z-10">
                              {msg.reactions.map((r) => (
                                <span key={r.id} title={`Reaction by @${r.user?.username}`}>{r.reaction}</span>
                              ))}
                            </div>
                          )}

                          {/* Action icons bar on hover */}
                          <div 
                            className="absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 flex gap-1 bg-[#12141c]/90 border border-purple-500/15 p-1 rounded-lg z-25 shadow-lg transition duration-150"
                            style={{ left: isMe ? 'auto' : '100%', right: isMe ? '100%' : 'auto', marginLeft: isMe ? 0 : '8px', marginRight: isMe ? '8px' : 0 }}
                          >
                            {/* React button */}
                            <button 
                              type="button"
                              onClick={() => setReactionActiveMessageId(reactionActiveMessageId === msg.id ? null : msg.id)}
                              className="text-gray-400 hover:text-white p-1"
                              title="React"
                            >
                              <Smile size={13} />
                            </button>
                            
                            {/* Reply button */}
                            <button 
                              type="button"
                              onClick={() => setReplyingTo(msg)}
                              className="text-gray-400 hover:text-white p-1"
                              title="Reply"
                            >
                              <Reply size={13} />
                            </button>

                            {/* Forward button */}
                            <button 
                              type="button"
                              onClick={() => handleTriggerForward(msg)}
                              className="text-gray-400 hover:text-white p-1"
                              title="Forward"
                            >
                              <Forward size={13} />
                            </button>

                            {/* Pin button */}
                            <button 
                              type="button"
                              onClick={() => handleTogglePinMessage(msg.id)}
                              className="text-gray-400 hover:text-yellow-400 p-1"
                              title="Pin message"
                            >
                              <Pin size={13} />
                            </button>

                            {/* Delete options */}
                            <div className="relative group/del">
                              <button className="text-gray-400 hover:text-red-400 p-1">
                                <Trash size={13} />
                              </button>
                              <div className="absolute top-6 left-0 bg-[#12141c] border border-purple-500/20 rounded-lg p-1 hidden group-hover/del:block w-28 z-40">
                                <button onClick={() => handleDeleteMessageMe(msg.id)} className="w-full text-left text-[9px] text-white hover:bg-white/5 p-1 block">Delete for me</button>
                                {isMe && (
                                  <button onClick={() => handleDeleteMessageEveryone(msg.id)} className="w-full text-left text-[9px] text-red-400 hover:bg-red-600/10 p-1 block border-t border-white/5">Delete for everyone</button>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Float Emoji Picker for message */}
                          {reactionActiveMessageId === msg.id && (
                            <div 
                              ref={emojiPickerRef}
                              className="absolute bottom-8 bg-[#12141c] border border-purple-500/25 p-1.5 rounded-full flex gap-1 z-35 shadow-2xl animate-fade"
                              style={{ right: isMe ? 0 : 'auto', left: isMe ? 'auto' : 0 }}
                            >
                              {['❤️', '👍', '😂', '🔥', '😮', '😢'].map(emoji => (
                                <button 
                                  key={emoji}
                                  type="button" 
                                  onClick={() => handleSendReaction(msg.id, emoji)}
                                  className="hover:scale-125 transition text-sm cursor-pointer"
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          )}

                        </div>
                      </div>
                    );
                  })}
                  
                  {/* Typing alert visual */}
                  {typingUsers.length > 0 && (
                    <div className="flex items-center gap-2 text-xs text-gray-500 italic ml-2">
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                      <span>{typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...</span>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>

                {/* Previews of files being uploaded */}
                {filePreviews.length > 0 && (
                  <div className="px-4 py-2 border-t border-purple-500/10 flex gap-3 overflow-x-auto bg-black/15">
                    {filePreviews.map((p, idx) => (
                      <div key={idx} className="relative min-w-[70px] h-[70px] rounded-lg overflow-hidden border border-purple-500/20 bg-black">
                        {p.type === 'IMAGE' && <img src={p.url} className="w-full h-full object-cover" />}
                        {p.type === 'VIDEO' && <video src={p.url} className="w-full h-full object-cover" />}
                        {p.type === 'VOICE' && <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400">Voice Note</div>}
                        {p.type === 'FILE' && <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400 truncate px-1">{p.name}</div>}
                        
                        <button 
                          type="button" 
                          onClick={() => handleRemoveFilePreview(idx)}
                          className="absolute top-1 right-1 bg-black/75 hover:bg-black text-red-500 p-0.5 rounded-full"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Reply Banner previews */}
                {replyingTo && (
                  <div className="px-4 py-2 bg-purple-900/15 border-t border-purple-500/20 flex justify-between items-center text-xs">
                    <div className="text-gray-400 truncate">
                      Replying to <strong className="text-cyan-400">@{replyingTo.sender?.username}</strong>: "{replyingTo.text || 'Attachment'}"
                    </div>
                    <button onClick={() => setReplyingTo(null)} className="text-gray-500 hover:text-white">
                      <X size={14} />
                    </button>
                  </div>
                )}

                {/* Input forms bar */}
                <form onSubmit={handleSendPayload} className="p-4 bg-[#0b0c10]/35 border-t border-purple-500/10 flex items-center gap-3">
                  {/* Select attachment */}
                  <button 
                    type="button"
                    onClick={() => chatMediaInputRef.current.click()}
                    className="text-gray-400 hover:text-white transition"
                    title="Share photos, video, audio, or files"
                  >
                    <Image size={18} />
                  </button>
                  
                  <input 
                    type="file" 
                    ref={chatMediaInputRef}
                    onChange={handleSelectFiles}
                    className="hidden"
                    multiple
                    accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
                  />

                  {/* View Once indicator */}
                  <button 
                    type="button"
                    onClick={() => setViewOnceMode(!viewOnceMode)}
                    className={`p-1.5 rounded transition ${viewOnceMode ? 'bg-cyan-500/15 text-cyan-400' : 'text-gray-500 hover:text-white'}`}
                    title="View Once mode"
                  >
                    {viewOnceMode ? <Eye size={16} /> : <EyeOff size={16} />}
                  </button>

                  {/* Disappearing messages timer dropdown */}
                  <div className="relative group/time">
                    <button 
                      type="button"
                      className={`p-1.5 rounded transition ${disappearingTimer ? 'bg-yellow-500/15 text-yellow-400' : 'text-gray-500 hover:text-white'}`}
                      title="Disappearing timer"
                    >
                      <Clock size={16} />
                    </button>
                    {/* Disappearing messages option selects dropdown */}
                    <div className="absolute bottom-8 left-0 bg-[#12141c] border border-purple-500/25 rounded-lg py-1.5 w-36 z-40 hidden group-hover/time:block shadow-2xl">
                      <span className="text-[10px] text-gray-500 block px-3 mb-1">Self-Destruct Timer</span>
                      {[
                        { label: 'Off', val: null },
                        { label: '30 seconds', val: 30 },
                        { label: '1 minute', val: 60 },
                        { label: '5 minutes', val: 300 },
                        { label: '1 hour', val: 3600 },
                        { label: '24 hours', val: 86400 }
                      ].map((t) => (
                        <button
                          key={t.label}
                          type="button"
                          onClick={() => setDisappearingTimer(t.val)}
                          className={`w-full text-left text-xs px-3 py-1.5 hover:bg-white/5 ${disappearingTimer === t.val ? 'text-cyan-400 font-bold' : 'text-white'}`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Text Input */}
                  <input 
                    type="text" 
                    placeholder="Type a message..." 
                    value={messageText} 
                    onChange={handleInputChange} 
                    className="flex-1 py-2 px-4 bg-black/45 border border-purple-500/10 rounded-xl text-white outline-none focus:border-cyan-400 text-xs transition"
                  />

                  {/* Send Button */}
                  <button 
                    type="submit" 
                    disabled={uploading || (!messageText.trim() && selectedFiles.length === 0)}
                    className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-cyan-500 flex items-center justify-center text-white cursor-pointer hover:scale-105 active:scale-95 disabled:opacity-50 transition shadow"
                  >
                    {uploading ? (
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Send size={15} />
                    )}
                  </button>
                </form>

              </div>

              {/* Chat details slideout panel */}
              {showDetailsPane && (
                <div className="w-[260px] border-l border-purple-500/10 bg-[#12141c]/95 h-full flex flex-col z-30 animate-fade custom-scrollbar overflow-y-auto">
                  <div className="p-4 border-b border-purple-500/10 flex justify-between items-center bg-[#0b0c10]/20">
                    <span className="text-white text-xs font-bold uppercase tracking-wider">Chat Details</span>
                    <button onClick={() => setShowDetailsPane(false)} className="text-gray-400 hover:text-white">
                      <X size={15} />
                    </button>
                  </div>

                  <div className="p-4 space-y-6">
                    {/* Room Meta */}
                    <div className="text-center space-y-2">
                      <img 
                        src={activeRoom.avatar || 'https://api.dicebear.com/7.x/identicon/svg?seed=aura'} 
                        className="w-16 h-16 rounded-full mx-auto object-cover border-2 border-purple-500/25 shadow-md"
                      />
                      <strong className="text-white text-sm block">
                        {activeRoom.isGroup ? activeRoom.name : `@${activeOtherUser?.username}`}
                      </strong>
                      {activeRoom.isGroup && activeRoom.description && (
                        <p className="text-gray-400 text-xs italic">{activeRoom.description}</p>
                      )}
                    </div>

                    {/* Group participants managers list */}
                    {activeRoom.isGroup && (
                      <div className="space-y-3">
                        <div className="flex justify-between items-center border-b border-white/5 pb-1">
                          <span className="text-white text-xs font-bold">Group Members</span>
                          {/* If admin, can add member */}
                          {activeRoom.role === 'ADMIN' && (
                            <button 
                              onClick={() => {
                                setShowAddMemberModal(true);
                                fetchSuggestions();
                              }}
                              className="text-cyan-400 hover:text-cyan-300 p-0.5"
                            >
                              <UserPlus size={14} />
                            </button>
                          )}
                        </div>

                        <div className="space-y-2">
                          {activeRoom.participants?.map((p) => (
                            <div key={p.id} className="flex items-center justify-between text-xs bg-black/20 p-2 rounded-lg border border-white/5 group/member">
                              <div className="flex items-center gap-2">
                                <img src={p.avatar || 'https://api.dicebear.com/7.x/identicon/svg?seed=aura'} className="w-6 h-6 rounded-full object-cover" />
                                <div className="truncate max-w-[80px]">
                                  <span className="text-white block font-semibold truncate">@{p.username}</span>
                                  <span className="text-[8px] text-gray-500 block uppercase">{p.role}</span>
                                </div>
                              </div>
                              
                              {/* Admin member actions */}
                              {activeRoom.role === 'ADMIN' && p.id !== user.id && (
                                <div className="flex gap-1 opacity-0 group-hover/member:opacity-100 transition">
                                  {p.role !== 'ADMIN' && (
                                    <button 
                                      onClick={() => handlePromoteAdmin(p.id)}
                                      className="text-green-500 hover:text-green-400 p-0.5 text-[9px]" 
                                      title="Make Admin"
                                    >
                                      <UserCheck size={12} />
                                    </button>
                                  )}
                                  <button 
                                    onClick={() => handleRemoveMember(p.id)}
                                    className="text-red-500 hover:text-red-400 p-0.5 text-[9px]" 
                                    title="Kick"
                                  >
                                    <X size={12} />
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Shared Media Files */}
                    <div className="space-y-3">
                      <div className="border-b border-white/5 pb-1">
                        <span className="text-white text-xs font-bold">Shared Media</span>
                      </div>
                      {activeRoomSharedMedia.length === 0 ? (
                        <p className="text-[10px] text-gray-500 italic text-center">No shared files in this chat</p>
                      ) : (
                        <div className="grid grid-cols-3 gap-1.5">
                          {activeRoomSharedMedia.map((m) => (
                            <div 
                              key={m.id} 
                              onClick={() => window.open(m.url)}
                              className="aspect-square bg-black/30 rounded border border-white/5 overflow-hidden cursor-pointer hover:border-cyan-400 transition"
                            >
                              {m.type === 'IMAGE' && <img src={m.url} className="w-full h-full object-cover" />}
                              {m.type === 'VIDEO' && <div className="w-full h-full flex items-center justify-center text-[9px] text-gray-400 bg-cyan-900/10">Video</div>}
                              {m.type === 'VOICE' && <div className="w-full h-full flex items-center justify-center text-[9px] text-gray-400 bg-purple-900/10">Voice</div>}
                              {m.type === 'FILE' && <div className="w-full h-full flex items-center justify-center text-[9px] text-gray-400 bg-gray-900/40">File</div>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              )}

            </div>
          </div>
        ) : (
          /* Empty Active Chat placeholder */
          <div className="flex flex-col items-center justify-center gap-2 select-none h-full text-center p-6 animate-fade">
            <span className="text-purple-400 text-6xl">💬</span>
            <h4 className="text-white font-extrabold text-lg mt-2 bg-gradient-to-r from-purple-400 to-cyan-300 bg-clip-text text-transparent">No Conversation Open</h4>
            <p className="text-gray-400 text-xs max-w-xs leading-relaxed">
              Select an active room from the sidebar, or initiate chat via user profile details.
            </p>
          </div>
        )}
      </div>

      {/* MODAL: Create Group Chat */}
      {showGroupModal && (
        <div className="fixed inset-0 bg-black/60 flex justify-center items-center z-[2500]">
          <div className="w-full max-w-md bg-[#12141c] border border-purple-500/25 p-6 rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center border-b border-purple-500/10 pb-3.5 mb-4">
              <h3 className="text-white text-base font-bold">New Group Chat</h3>
              <button 
                onClick={() => {
                  setShowGroupModal(false);
                  setGroupName('');
                  setGroupDesc('');
                  setSelectedUserIds([]);
                }} 
                className="text-gray-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateGroupSubmit} className="space-y-4 flex-1 flex flex-col min-h-0">
              <input 
                type="text" 
                placeholder="Group Name *"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className="w-full py-2 px-4 bg-black/35 border border-purple-500/15 rounded-xl text-xs text-white outline-none focus:border-cyan-400"
                required
              />

              <input 
                type="text" 
                placeholder="Description"
                value={groupDesc}
                onChange={(e) => setGroupDesc(e.target.value)}
                className="w-full py-2 px-4 bg-black/35 border border-purple-500/15 rounded-xl text-xs text-white outline-none focus:border-cyan-400"
              />

              {/* Select members list */}
              <div className="space-y-2 flex-1 flex flex-col min-h-0">
                <span className="text-[11px] text-gray-400 font-semibold">Select Members:</span>
                
                {/* Search members field */}
                <input 
                  type="text" 
                  placeholder="Search creators..." 
                  value={groupSearchQuery}
                  onChange={(e) => setGroupSearchQuery(e.target.value)}
                  className="w-full py-1.5 px-3 bg-black/45 border border-purple-500/10 rounded-lg text-xs text-white outline-none focus:border-cyan-400"
                />

                <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                  {/* If searching */}
                  {groupUsersResult.length > 0 ? (
                    groupUsersResult.map(u => (
                      <label key={u.id} className="flex items-center justify-between p-2 hover:bg-white/5 rounded-lg cursor-pointer">
                        <div className="flex items-center gap-2">
                          <img src={u.avatar || 'https://api.dicebear.com/7.x/identicon/svg?seed=aura'} className="w-8 h-8 rounded-full object-cover" />
                          <span className="text-xs text-white">@{u.username}</span>
                        </div>
                        <input 
                          type="checkbox" 
                          checked={selectedUserIds.includes(u.id)}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedUserIds(prev => [...prev, u.id]);
                            else setSelectedUserIds(prev => prev.filter(id => id !== u.id));
                          }}
                          className="w-4 h-4 rounded accent-cyan-400"
                        />
                      </label>
                    ))
                  ) : (
                    /* Show suggested */
                    suggestedUsers.map(u => (
                      <label key={u.id} className="flex items-center justify-between p-2 hover:bg-white/5 rounded-lg cursor-pointer">
                        <div className="flex items-center gap-2">
                          <img src={u.avatar || 'https://api.dicebear.com/7.x/identicon/svg?seed=aura'} className="w-8 h-8 rounded-full object-cover" />
                          <span className="text-xs text-white">@{u.username}</span>
                        </div>
                        <input 
                          type="checkbox" 
                          checked={selectedUserIds.includes(u.id)}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedUserIds(prev => [...prev, u.id]);
                            else setSelectedUserIds(prev => prev.filter(id => id !== u.id));
                          }}
                          className="w-4 h-4 rounded accent-cyan-400"
                        />
                      </label>
                    ))
                  )}
                </div>
              </div>

              <button 
                type="submit" 
                className="w-full py-2.5 bg-gradient-to-tr from-purple-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 text-white font-semibold rounded-xl text-xs shadow-md transition active:scale-95 cursor-pointer"
              >
                Create Group
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Add Member */}
      {showAddMemberModal && (
        <div className="fixed inset-0 bg-black/60 flex justify-center items-center z-[2500]">
          <div className="w-full max-w-sm bg-[#12141c] border border-purple-500/25 p-5 rounded-2xl shadow-2xl flex flex-col max-h-[80vh]">
            <div className="flex justify-between items-center border-b border-purple-500/10 pb-3 mb-4">
              <h3 className="text-white text-base font-bold">Add Group Members</h3>
              <button 
                onClick={() => {
                  setShowAddMemberModal(false);
                  setSelectedUserIds([]);
                }} 
                className="text-gray-400 hover:text-white"
              >
                <X size={17} />
              </button>
            </div>

            <form onSubmit={handleAddMemberSubmit} className="space-y-4 flex-1 flex flex-col min-h-0">
              <input 
                type="text" 
                placeholder="Search creators..." 
                value={groupSearchQuery}
                onChange={(e) => setGroupSearchQuery(e.target.value)}
                className="w-full py-1.5 px-3 bg-black/45 border border-purple-500/10 rounded-lg text-xs text-white outline-none focus:border-cyan-400"
              />

              <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
                {groupUsersResult.length > 0 ? (
                  groupUsersResult.map(u => (
                    <label key={u.id} className="flex items-center justify-between p-2 hover:bg-white/5 rounded-lg cursor-pointer">
                      <div className="flex items-center gap-2">
                        <img src={u.avatar || 'https://api.dicebear.com/7.x/identicon/svg?seed=aura'} className="w-8 h-8 rounded-full object-cover" />
                        <span className="text-xs text-white">@{u.username}</span>
                      </div>
                      <input 
                        type="checkbox" 
                        checked={selectedUserIds.includes(u.id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedUserIds(prev => [...prev, u.id]);
                          else setSelectedUserIds(prev => prev.filter(id => id !== u.id));
                        }}
                        className="w-4 h-4 rounded accent-cyan-400"
                      />
                    </label>
                  ))
                ) : (
                  suggestedUsers.map(u => (
                    <label key={u.id} className="flex items-center justify-between p-2 hover:bg-white/5 rounded-lg cursor-pointer">
                      <div className="flex items-center gap-2">
                        <img src={u.avatar || 'https://api.dicebear.com/7.x/identicon/svg?seed=aura'} className="w-8 h-8 rounded-full object-cover" />
                        <span className="text-xs text-white">@{u.username}</span>
                      </div>
                      <input 
                        type="checkbox" 
                        checked={selectedUserIds.includes(u.id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedUserIds(prev => [...prev, u.id]);
                          else setSelectedUserIds(prev => prev.filter(id => id !== u.id));
                        }}
                        className="w-4 h-4 rounded accent-cyan-400"
                      />
                    </label>
                  ))
                )}
              </div>

              <button 
                type="submit" 
                className="w-full py-2 bg-gradient-to-tr from-purple-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 text-white font-semibold rounded-xl text-xs shadow-md transition active:scale-95 cursor-pointer"
              >
                Add Selected
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Forward Message */}
      {showForwardModal && (
        <div className="fixed inset-0 bg-black/60 flex justify-center items-center z-[2500]">
          <div className="w-full max-w-sm bg-[#12141c] border border-purple-500/25 p-5 rounded-2xl shadow-2xl flex flex-col max-h-[70vh]">
            <div className="flex justify-between items-center border-b border-purple-500/10 pb-3 mb-4">
              <h3 className="text-white text-sm font-bold">Forward Message</h3>
              <button 
                onClick={() => {
                  setShowForwardModal(false);
                  setForwardingMessage(null);
                }} 
                className="text-gray-400 hover:text-white"
              >
                <X size={17} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              <div className="p-2.5 bg-black/35 rounded-lg text-xs text-gray-400 mb-3 border border-white/5">
                Forwarding: "{forwardingMessage?.text || 'Attachment'}"
              </div>
              
              <span className="text-[10px] text-gray-500 block mb-1">Select conversation to forward to:</span>

              {rooms.map(room => (
                <div 
                  key={room.id}
                  onClick={() => handleForwardMessageToRoom(room.id)}
                  className="flex items-center justify-between p-2 hover:bg-white/5 rounded-lg cursor-pointer border border-white/5 transition"
                >
                  <div className="flex items-center gap-2">
                    <img src={room.avatar || 'https://api.dicebear.com/7.x/identicon/svg?seed=aura'} className="w-8 h-8 rounded-full object-cover" />
                    <span className="text-xs text-white font-semibold">{room.isGroup ? room.name : `@${room.otherUser?.username}`}</span>
                  </div>
                  <ChevronRight size={13} className="text-gray-500" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* FULLSCREEN OVERLAY MODAL: View Once media viewer */}
      {viewOnceOpenMedia && (
        <div className="fixed inset-0 bg-black/98 flex flex-col justify-center items-center z-[3000]">
          <button 
            onClick={handleCloseViewOnce} 
            className="absolute top-5 right-5 text-gray-400 hover:text-white transition flex items-center gap-1 text-sm font-bold bg-white/5 px-3 py-1.5 rounded-lg border border-white/10 shadow"
          >
            <X size={18} /> Close and Destroy
          </button>

          <div className="relative max-w-full max-h-[75vh] w-auto h-auto flex items-center justify-center p-4">
            {viewOnceOpenMedia.type === 'IMAGE' ? (
              <img 
                src={viewOnceOpenMedia.url} 
                className="max-w-full max-h-[75vh] object-contain shadow-2xl rounded-lg border border-purple-500/10" 
                alt="View once media" 
              />
            ) : (
              <video 
                src={viewOnceOpenMedia.url} 
                controls 
                autoPlay 
                className="max-w-full max-h-[75vh] object-contain shadow-2xl rounded-lg border border-purple-500/10" 
              />
            )}
          </div>
          
          <div className="mt-4 flex items-center gap-2 bg-red-950/20 border border-red-500/20 px-4 py-2 rounded-xl text-xs text-red-300">
            <AlertTriangle size={15} />
            This media is view-once. It will be permanently deleted from the database and Cloudinary when closed.
          </div>
        </div>
      )}

    </div>
  );
}
