'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, Settings, Plus, MoreHorizontal, 
  Sparkles, AlignLeft, Calendar, Briefcase
} from 'lucide-react';
import { getStoredSessions, ChatSession, getRelativeDateString } from './historyManager';
import { createClient } from '@/utils/supabase/client';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  activeChatId?: string | null;
  onSelectChat: (id: string | null) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose, activeChatId, onSelectChat }) => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [userProfile, setUserProfile] = useState({ name: 'User', initial: 'U' });

  // Fetch User and Load Sessions
  useEffect(() => {
    // Load sessions on mount and when sidebar opens
    if (isOpen) {
      setSessions(getStoredSessions());
    }
    
    const handleUpdate = () => {
      setSessions(getStoredSessions());
    };
    
    window.addEventListener('sessionsUpdated', handleUpdate);
    // Initial load just in case
    setSessions(getStoredSessions());
    
    return () => window.removeEventListener('sessionsUpdated', handleUpdate);
  }, [isOpen]);

  useEffect(() => {
    // Fetch dynamic user info from Supabase
    const fetchUser = async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (data?.user) {
        const fullName = data.user.user_metadata?.name;
        const emailName = data.user.email?.split('@')[0];
        const displayName = fullName?.split(' ')[0] || emailName || 'User';
        
        setUserProfile({
          name: displayName,
          initial: displayName.charAt(0).toUpperCase()
        });
      }
    };
    fetchUser();
  }, [isOpen]);

  // Filter sessions based on search query
  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions;
    return sessions.filter(chat => 
      chat.title.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [sessions, searchQuery]);

  // Group filtered sessions dynamically
  const todayChats = filteredSessions.filter((chat) => getRelativeDateString(chat.date) === 'today');
  const yesterdayChats = filteredSessions.filter((chat) => getRelativeDateString(chat.date) === 'yesterday');
  const olderChats = filteredSessions.filter((chat) => !['today', 'yesterday'].includes(getRelativeDateString(chat.date)));

  // Helper to render soft icons based on chat type
  const renderIcon = (type: string, isActive: boolean) => {
    const colorClass = isActive ? 'text-amber-500' : 'text-zinc-500 group-hover:text-amber-400/70';
    switch (type) {
      case 'calendar': return <Calendar size={16} strokeWidth={1.5} className={`shrink-0 transition-colors ${colorClass}`} />;
      case 'briefcase': return <Briefcase size={16} strokeWidth={1.5} className={`shrink-0 transition-colors ${colorClass}`} />;
      default: return <AlignLeft size={16} strokeWidth={1.5} className={`shrink-0 transition-colors ${colorClass}`} />;
    }
  };

  const handleNewRequest = () => {
    onSelectChat(null);
    if (window.innerWidth < 768) onClose(); // Auto-close on mobile when selecting new
  };

  const handleSelectChat = (id: string) => {
    onSelectChat(id);
    if (window.innerWidth < 768) onClose(); // Auto-close on mobile
  };

  return (
    <>
      {/* Mobile Backdrop with fade */}
      <div 
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden transition-opacity duration-500 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Sidebar Container - Executive Glassmorphism */}
      <div 
        className={`fixed top-0 left-0 z-50 h-full w-[280px] lg:w-[320px] bg-black/40 backdrop-blur-2xl border-r border-white/[0.04] flex flex-col transition-transform duration-500 cubic-bezier(0.16, 1, 0.3, 1) md:translate-x-0 md:static ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header Area */}
        <div className="p-5 flex flex-col gap-6">
          
          {/* Logo & Assistant Identity */}
          <div className="flex items-center gap-3 px-1">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-amber-500/20 to-amber-900/20 border border-amber-500/20 shadow-[0_4px_20px_rgba(245,158,11,0.1)]">
              <Sparkles size={20} className="text-amber-500" strokeWidth={1.5} />
            </div>
            <div className="flex flex-col">
              <span className="font-medium text-lg tracking-widest text-zinc-100">
                JARVIS
              </span>
              <span className="text-[10px] text-amber-500/80 uppercase tracking-widest font-medium">
                Concierge Active
              </span>
            </div>
          </div>

          {/* Executive New Request Button */}
          <button 
            onClick={handleNewRequest}
            className="group flex items-center justify-between w-full bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 transition-all duration-300 py-3.5 px-5 rounded-[1.25rem] shadow-sm"
          >
            <span className="text-amber-500 text-[15px] font-medium tracking-wide">New Request</span>
            <div className="p-1 rounded-full bg-amber-500/20 text-amber-500 group-hover:rotate-90 transition-transform duration-300">
              <Plus size={16} strokeWidth={2.5} />
            </div>
          </button>

          {/* Seamless Search */}
          <div className="relative group">
            <Search 
              className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors duration-300 ${
                isSearchFocused || searchQuery ? 'text-amber-500' : 'text-zinc-500'
              }`} 
              size={16} 
              strokeWidth={1.5}
            />
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search past requests..." 
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
              className="w-full bg-white/[0.03] border border-white/[0.05] rounded-2xl py-3 pl-11 pr-4 text-[14px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/30 focus:bg-white/[0.05] transition-all font-light"
            />
          </div>
        </div>

        {/* Chat History List */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-8 jarvis-scrollbar">
          
          {/* Empty State for Search */}
          {filteredSessions.length === 0 && searchQuery && (
            <div className="text-center mt-10 px-4 animate-in fade-in">
              <p className="text-zinc-500 text-sm font-light">No requests found matching</p>
              <p className="text-zinc-300 text-sm font-medium mt-1 truncate">"{searchQuery}"</p>
            </div>
          )}

          {todayChats.length > 0 && (
            <div>
              <h3 className="text-[10px] font-medium text-zinc-500 mb-3 px-4 uppercase tracking-widest">
                Today
              </h3>
              <div className="flex flex-col gap-1">
                {todayChats.map((chat) => (
                  <HistoryItem 
                    key={chat.id} 
                    chat={chat} 
                    isActive={chat.id === activeChatId} 
                    icon={renderIcon(chat.icon, chat.id === activeChatId)} 
                    onClick={() => handleSelectChat(chat.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {yesterdayChats.length > 0 && (
            <div>
              <h3 className="text-[10px] font-medium text-zinc-500 mb-3 px-4 uppercase tracking-widest">
                Yesterday
              </h3>
              <div className="flex flex-col gap-1">
                {yesterdayChats.map((chat) => (
                  <HistoryItem 
                    key={chat.id} 
                    chat={chat} 
                    isActive={chat.id === activeChatId}
                    icon={renderIcon(chat.icon, chat.id === activeChatId)} 
                    onClick={() => handleSelectChat(chat.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {olderChats.length > 0 && (
            <div>
              <h3 className="text-[10px] font-medium text-zinc-500 mb-3 px-4 uppercase tracking-widest">
                Older
              </h3>
              <div className="flex flex-col gap-1">
                {olderChats.map((chat) => (
                  <HistoryItem 
                    key={chat.id} 
                    chat={chat} 
                    isActive={chat.id === activeChatId}
                    icon={renderIcon(chat.icon, chat.id === activeChatId)} 
                    onClick={() => handleSelectChat(chat.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer / Profile Settings */}
        <div className="p-5 border-t border-white/[0.04] bg-gradient-to-t from-black/20 to-transparent">
          
          {/* Settings Pill */}
          <button className="flex items-center gap-3 w-full p-3 hover:bg-white/[0.04] rounded-2xl text-zinc-400 hover:text-zinc-200 transition-all duration-300 group mb-2">
            <Settings size={18} strokeWidth={1.5} className="group-hover:rotate-45 transition-transform duration-500" />
            <span className="text-[15px] font-light tracking-wide">Preferences</span>
          </button>
          
          {/* Personalized User Profile */}
          <button className="flex items-center justify-between w-full p-3 hover:bg-white/[0.04] rounded-2xl transition-all duration-300 group">
            <div className="flex items-center gap-3.5">
              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-zinc-700 to-zinc-900 border border-white/10 flex items-center justify-center shadow-inner group-hover:border-amber-500/30 transition-colors">
                <span className="text-zinc-300 text-sm font-medium tracking-wider">{userProfile.initial}</span>
              </div>
              <div className="flex flex-col items-start">
                <span className="text-[15px] text-zinc-200 font-medium tracking-wide">{userProfile.name}</span>
                <span className="text-[11px] text-zinc-500 tracking-wider">Primary Account</span>
              </div>
            </div>
          </button>

        </div>
      </div>
    </>
  );
};

// --- History Item Sub-Component ---
const HistoryItem: React.FC<{ chat: ChatSession, isActive?: boolean, icon: React.ReactNode, onClick: () => void }> = ({ chat, isActive, icon, onClick }) => {
  return (
    <button 
      onClick={onClick}
      className={`relative flex items-center gap-3.5 w-full text-left py-2.5 px-4 rounded-[1rem] transition-all duration-300 group ${
        isActive 
          ? 'bg-amber-500/[0.08] text-amber-50' 
          : 'hover:bg-white/[0.03] text-zinc-400 hover:text-zinc-200'
      }`}
    >
      {/* Soft Active Indicator */}
      {isActive && (
        <div className="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-1/2 bg-amber-500 rounded-full opacity-80" />
      )}
      
      {icon}
      
      <span className="text-[14px] truncate pr-6 font-light tracking-wide">{chat.title}</span>
      
      {/* Options Icon (Shows on hover) */}
      <div className={`absolute right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${
        isActive ? 'opacity-100' : ''
      }`}>
        <MoreHorizontal size={16} strokeWidth={1.5} className="text-zinc-500 hover:text-white transition-colors" />
      </div>
    </button>
  );
};