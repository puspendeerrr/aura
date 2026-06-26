import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Shield, Users, FileText, AlertOctagon, Trash, Check, UserMinus, UserCheck } from 'lucide-react';

export default function AdminDashboard() {
  const { apiCall } = useAuth();
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalPosts: 0,
    totalComments: 0,
    pendingReports: 0,
  });
  const [reports, setReports] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Status handlers
  const [activeTab, setActiveTab] = useState('reports'); // 'reports' or 'users'

  const loadData = async () => {
    try {
      setLoading(true);
      const statsData = await apiCall('/admin/dashboard');
      setStats(statsData.stats);

      const reportsData = await apiCall('/admin/reports');
      setReports(reportsData.reports);

      const usersData = await apiCall('/admin/users');
      setUsers(usersData.users);
    } catch (err) {
      console.error('Failed to load admin dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleResolveReport = async (reportId, action) => {
    try {
      // action is 'KEEP' or 'DELETE'
      await apiCall(`/admin/reports/${reportId}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      alert(`Report resolved: Content ${action === 'DELETE' ? 'deleted' : 'kept'}.`);
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleToggleUserBan = async (userId, currentBanStatus) => {
    const action = currentBanStatus ? 'reinstate' : 'suspend';
    const reason = !currentBanStatus ? window.prompt('Specify a reason for suspension:') : '';
    
    if (!currentBanStatus && reason === null) return; // cancel click

    try {
      await apiCall(`/admin/users/${userId}/ban`, {
        method: 'POST',
        body: JSON.stringify({ 
          ban: !currentBanStatus, 
          reason: reason || 'Violation of Community Terms' 
        }),
      });
      alert(`User account successfully ${currentBanStatus ? 'reinstated' : 'suspended'}.`);
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading) {
    return <div className="text-center py-20 text-gray-500">Loading Moderation Dashboard...</div>;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-16 animate-fade select-none">
      
      {/* Page Title */}
      <h2 className="text-2xl font-bold text-white flex items-center gap-2 border-l-4 border-purple-500 pl-3.5">
        <Shield className="text-purple-400" />
        Admin Control Room
      </h2>

      {/* Analytics Counter Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatsCard icon={<Users size={22} className="text-purple-400" />} title="Total Users" value={stats.totalUsers} />
        <StatsCard icon={<FileText size={22} className="text-cyan-400" />} title="Total Posts" value={stats.totalPosts} />
        <StatsCard icon={<FileText size={22} className="text-green-400" />} title="Comments" value={stats.totalComments} />
        <StatsCard icon={<AlertOctagon size={22} className="text-yellow-400" />} title="Pending Reports" value={stats.pendingReports} />
      </div>

      {/* Navigation tabs */}
      <div className="flex bg-[#12141c]/50 p-1.5 rounded-xl border border-purple-500/10 w-fit">
        <button 
          onClick={() => setActiveTab('reports')}
          className={`py-2 px-5 rounded-lg text-xs font-semibold flex items-center gap-2 transition ${
            activeTab === 'reports' ? 'bg-gradient-to-r from-purple-600 to-cyan-500 text-white' : 'text-gray-400 hover:text-white'
          }`}
        >
          <AlertOctagon size={14} />
          Report Moderation ({reports.length})
        </button>
        <button 
          onClick={() => setActiveTab('users')}
          className={`py-2 px-5 rounded-lg text-xs font-semibold flex items-center gap-2 transition ${
            activeTab === 'users' ? 'bg-gradient-to-r from-purple-600 to-cyan-500 text-white' : 'text-gray-400 hover:text-white'
          }`}
        >
          <Users size={14} />
          User Management ({users.length})
        </button>
      </div>

      {/* Reports moderations tab */}
      {activeTab === 'reports' && (
        <div className="bg-[#1f2833]/30 border border-purple-500/10 p-6 rounded-2xl backdrop-blur-md space-y-4">
          <h3 className="text-white text-base font-semibold border-b border-purple-500/10 pb-3 mb-4">Pending Content Flagged Reports</h3>
          
          <div className="space-y-4">
            {reports.map((rep) => (
              <div key={rep.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-black/25 rounded-xl border border-purple-500/5 hover:border-purple-500/15 transition gap-4">
                <div className="flex gap-4">
                  {rep.mediaThumbnail ? (
                    <img src={rep.mediaThumbnail} className="w-14 h-14 rounded-lg object-cover border border-purple-500/10" />
                  ) : (
                    <div className="w-14 h-14 rounded-lg bg-black/40 flex items-center justify-center text-xs text-gray-500">Post</div>
                  )}
                  <div>
                    <span className="text-yellow-400 text-xs font-bold uppercase tracking-wider block">Flagged: {rep.reason}</span>
                    <span className="text-gray-300 text-sm block mt-1">
                      Reporter: <strong className="text-white">@{rep.reporter?.username}</strong>
                    </span>
                    <span className="text-[11px] text-gray-500 block">
                      Submitted on {new Date(rep.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button 
                    onClick={() => handleResolveReport(rep.id, 'KEEP')}
                    className="py-1.5 px-3 bg-green-600/10 hover:bg-green-600/25 border border-green-500/20 text-green-400 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Check size={14} />
                    Keep Content
                  </button>
                  <button 
                    onClick={() => handleResolveReport(rep.id, 'DELETE')}
                    className="py-1.5 px-3 bg-red-600/10 hover:bg-red-600/25 border border-red-500/20 text-red-400 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Trash size={14} />
                    Delete Post
                  </button>
                </div>
              </div>
            ))}
            {reports.length === 0 && (
              <p className="text-center text-gray-500 py-10">No pending content reports. Aura is safe!</p>
            )}
          </div>
        </div>
      )}

      {/* User Management tab */}
      {activeTab === 'users' && (
        <div className="bg-[#1f2833]/30 border border-purple-500/10 p-6 rounded-2xl backdrop-blur-md space-y-4">
          <h3 className="text-white text-base font-semibold border-b border-purple-500/10 pb-3 mb-4">Aura Platform User Database</h3>
          
          <div className="space-y-4">
            {users.map((usr) => (
              <div key={usr.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-black/25 rounded-xl border border-purple-500/5 hover:border-purple-500/15 transition gap-4">
                <div>
                  <strong className="text-white text-sm block">@{usr.username} {usr.username === 'admin' && '(Root Admin)'}</strong>
                  <span className="text-xs text-gray-400 block">{usr.name} — {usr.email}</span>
                  {usr.isBanned && (
                    <span className="text-red-400 text-[10px] font-bold block uppercase mt-1">
                      Status: Suspended (${usr.banReason})
                    </span>
                  )}
                </div>

                {usr.username !== 'admin' && (
                  <button 
                    onClick={() => handleToggleUserBan(usr.id, usr.isBanned)}
                    className={`py-1.5 px-4 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                      usr.isBanned 
                        ? 'bg-green-600/10 hover:bg-green-600/25 border border-green-500/20 text-green-400' 
                        : 'bg-red-600/10 hover:bg-red-600/25 border border-red-500/20 text-red-400'
                    }`}
                  >
                    {usr.isBanned ? (
                      <>
                        <UserCheck size={14} />
                        Reactivate User
                      </>
                    ) : (
                      <>
                        <UserMinus size={14} />
                        Suspend User
                      </>
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

// Sub components for cards statistics display
function StatsCard({ icon, title, value }) {
  return (
    <div className="p-5 bg-[#1f2833]/40 border border-purple-500/15 rounded-2xl flex items-center gap-4 backdrop-blur-md shadow-md">
      <div className="p-3 bg-black/35 rounded-xl border border-purple-500/5">{icon}</div>
      <div>
        <span className="text-gray-400 text-xs font-medium block uppercase tracking-wider">{title}</span>
        <strong className="text-white text-xl block mt-0.5">{value}</strong>
      </div>
    </div>
  );
}
