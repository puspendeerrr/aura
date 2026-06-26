import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const { token, user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    if (!token || !user) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      return;
    }

    // Connect to WebSocket server with auth payload
    const newSocket = io('http://localhost:5000', {
      auth: { token },
    });

    newSocket.on('connect', () => {
      console.log('Connected to Aura WebSocket server');
    });

    // Handle incoming live notification banners
    newSocket.on('live_notification', (notif) => {
      setNotifications((prev) => [notif, ...prev]);
      
      // Auto-remove notification banner after 5 seconds
      setTimeout(() => {
        setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
      }, 5000);
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [token, user]);

  const dismissNotification = (id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <SocketContext.Provider value={{ socket, notifications, dismissNotification }}>
      {children}
      
      {/* Toast Notification Container */}
      <div style={toastContainerStyle}>
        {notifications.map((notif) => (
          <div key={notif.id} style={toastStyle} className="glass-panel animate-fade">
            <img 
              src={notif.sender?.avatar ? `http://localhost:5000${notif.sender.avatar}` : 'https://api.dicebear.com/7.x/identicon/svg?seed=aura'} 
              alt={notif.sender?.username} 
              style={toastAvatarStyle} 
            />
            <div style={toastContentStyle}>
              <strong>@{notif.sender?.username}</strong>
              <p style={toastTextStyle}>
                {notif.type === 'MESSAGE' ? `sent a message: "${notif.messageText}"` : ''}
                {notif.type === 'LIKE' ? 'liked your post' : ''}
                {notif.type === 'COMMENT' ? 'commented on your post' : ''}
                {notif.type === 'FOLLOW' ? 'started following you' : ''}
                {notif.type === 'FOLLOW_REQUEST' ? 'sent you a follow request' : ''}
                {notif.type === 'MENTION' ? 'mentioned you in a comment' : ''}
              </p>
            </div>
            <button 
              onClick={() => dismissNotification(notif.id)}
              style={toastCloseBtnStyle}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </SocketContext.Provider>
  );
};

// Styles for live toast overlays
const toastContainerStyle = {
  position: 'fixed',
  bottom: '24px',
  right: '24px',
  zIndex: 10000,
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  maxWidth: '350px',
  width: '100%',
};

const toastStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '12px 16px',
  borderRadius: '12px',
  background: 'rgba(18, 20, 28, 0.85)',
  border: '1px solid rgba(138, 43, 226, 0.4)',
  boxShadow: '0 4px 20px rgba(138, 43, 226, 0.25)',
  backdropFilter: 'blur(10px)',
  color: '#ffffff',
  position: 'relative',
};

const toastAvatarStyle = {
  width: '36px',
  height: '36px',
  borderRadius: '50%',
  objectFit: 'cover',
  border: '1px solid rgba(255, 255, 255, 0.2)',
};

const toastContentStyle = {
  flex: 1,
  fontSize: '14px',
};

const toastTextStyle = {
  margin: '2px 0 0 0',
  color: '#a0a5b5',
  fontSize: '12px',
};

const toastCloseBtnStyle = {
  background: 'transparent',
  border: 'none',
  color: '#a0a5b5',
  fontSize: '18px',
  cursor: 'pointer',
  padding: '0 4px',
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};
