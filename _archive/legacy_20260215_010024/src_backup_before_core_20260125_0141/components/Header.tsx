import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogOut, Video, User, CheckCircle, Clock, Key } from 'lucide-react';

interface HeaderProps {
    onOpenSettings?: () => void;
}

const PLAN_LABELS: Record<string, string> = {
    'PLAN_30_DAYS': 'MENSAL',
    'PLAN_3_MONTHS': 'TRIMESTRAL',
    'PLAN_6_MONTHS': 'SEMESTRAL',
    'PLAN_1_YEAR': 'ANUAL'
};

export function Header({ onOpenSettings }: HeaderProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isAdminView = location.pathname.startsWith('/admin');

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getDaysRemaining = () => {
      if (!user?.expiresAt) return 0;
      const now = new Date();
      const expiration = new Date(user.expiresAt);
      const diffTime = expiration.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays > 0 ? diffDays : 0;
  };

  const daysRemaining = getDaysRemaining();
  const planLabel = user?.plan ? (PLAN_LABELS[user.plan] || 'MENSAL') : 'INATIVO';
  const roleLabel = user?.role === 'ADMIN' ? 'Administrador' : 'Editor';

  return (
    <header className="bg-gray-900 border-b border-gray-800 sticky top-0 z-50">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        
        <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <Video className="w-5 h-5 text-white" />
            </div>
            <div>
                <h1 className="text-xl font-bold text-white tracking-tight leading-none">
                    StoryFlow <span className="text-indigo-400">AI</span>
                </h1>
                <p className="text-[10px] text-gray-500 font-medium tracking-wider uppercase">Studio Pro</p>
            </div>
        </div>

        <div className="flex items-center gap-6">
            
            <div className="hidden md:flex items-center gap-3 bg-gray-800/50 px-4 py-1.5 rounded-full border border-gray-700/50">
                <div className="flex flex-col items-end">
                    <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Plano Atual</span>
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                        {planLabel} <CheckCircle className="w-3 h-3" />
                    </span>
                </div>
                <div className="w-px h-6 bg-gray-700"></div>
                <div className="flex flex-col">
                     <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Expira em</span>
                     <span className={`text-xs font-bold flex items-center gap-1 ${daysRemaining < 5 ? 'text-red-400' : 'text-white'}`}>
                        {daysRemaining} Dias <Clock className="w-3 h-3 text-indigo-400" />
                     </span>
                </div>
            </div>

            <div className="flex items-center gap-3 pl-3 border-l border-gray-800">
                
                {onOpenSettings && (
                    <button 
                        onClick={onOpenSettings}
                        className="p-2 bg-indigo-500/10 hover:bg-indigo-500/20 rounded-lg text-indigo-400 transition-colors border border-indigo-500/20"
                        title="Configurar API Key"
                    >
                        <Key className="w-4 h-4" />
                    </button>
                )}

                <div className="text-right hidden sm:block">
                    <p className="text-sm font-bold text-white leading-none">{user?.name || user?.email?.split('@')[0] || 'Usuário'}</p>
                    <p className="text-xs text-indigo-400 font-medium">{roleLabel}</p>
                </div>
                <div className="w-9 h-9 bg-gray-700 rounded-full flex items-center justify-center border border-gray-600">
                    <User className="w-5 h-5 text-gray-300" />
                </div>
                <button 
                    onClick={handleLogout}
                    className="p-2 hover:bg-red-500/10 rounded-lg group transition-all"
                    title="Sair"
                >
                    <LogOut className="w-5 h-5 text-gray-500 group-hover:text-red-400 transition-colors" />
                </button>
            </div>
        </div>
      </div>
    </header>
  );
}
