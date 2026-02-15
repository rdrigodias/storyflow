import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Phone, CreditCard, Mail, Lock, Clock } from 'lucide-react';

export function LoginScreen() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [selectedPlan, setSelectedPlan] = useState('PLAN_30_DAYS');
  const [isRegister, setIsRegister] = useState(false);
  const [showPending, setShowPending] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const endpoint = isRegister ? '/register' : '/login';
    const body: any = { email, password };
    if (isRegister) { body.whatsapp = whatsapp; body.plan = selectedPlan; }

    try {
const API_BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");
const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      
      if (res.status === 403 && data.code === 'PENDING_APPROVAL') { setShowPending(true); return; }
      if (!res.ok) throw new Error(data.message || 'Erro');

      if (isRegister) { 
          setShowPending(true); 
      } else {
        login(data.token, data.user);
        navigate('/app');
      }
    } catch (err: any) { setError(err.message); }
  };

  if (showPending) {
      return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
            <div className="bg-gray-900 p-8 rounded-2xl shadow-2xl border border-yellow-500/30 w-full max-w-md text-center">
                <div className="w-16 h-16 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-4"><Clock className="w-8 h-8 text-yellow-400" /></div>
                <h2 className="text-xl font-bold text-white mb-2">Conta em Análise</h2>
                <p className="text-gray-400 text-sm mb-6">Aguarde a aprovação do administrador.</p>
                <button onClick={() => { setShowPending(false); setIsRegister(false); }} className="text-indigo-400 text-sm font-bold">Voltar</button>
            </div>
        </div>
      );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="bg-gray-900 p-8 rounded-2xl shadow-2xl border border-gray-800 w-full max-w-md relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 to-purple-500"></div>
        <h1 className="text-3xl font-black text-white mb-2 text-center tracking-tight">StoryFlow <span className="text-indigo-500">AI</span></h1>
        <p className="text-gray-500 text-center text-sm mb-6">{isRegister ? 'Solicitar Acesso' : 'Entrar'}</p>
        {error && <div className="text-red-400 text-xs font-bold text-center mb-4">{error}</div>}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative"><Mail className="absolute left-3 top-3.5 h-4 w-4 text-gray-500" /><input type="email" placeholder="Email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full pl-10 p-3 bg-gray-800 border border-gray-700 rounded-lg text-white outline-none focus:border-indigo-500" /></div>
          <div className="relative"><Lock className="absolute left-3 top-3.5 h-4 w-4 text-gray-500" /><input type="password" placeholder="Senha" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} className="w-full pl-10 p-3 bg-gray-800 border border-gray-700 rounded-lg text-white outline-none focus:border-indigo-500" /></div>
          
          {isRegister && (
            <>
                <div className="relative"><Phone className="absolute left-3 top-3.5 h-4 w-4 text-gray-500" /><input type="text" placeholder="WhatsApp" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} className="w-full pl-10 p-3 bg-gray-800 border border-gray-700 rounded-lg text-white outline-none focus:border-emerald-500" /></div>
                <div className="relative"><CreditCard className="absolute left-3 top-3.5 h-4 w-4 text-gray-500" /><select value={selectedPlan} onChange={e => setSelectedPlan(e.target.value)} className="w-full pl-10 p-3 bg-gray-800 border border-gray-700 rounded-lg text-white outline-none focus:border-purple-500"><option value="PLAN_30_DAYS">🟢 Mensal</option><option value="PLAN_3_MONTHS">🔵 Trimestral</option><option value="PLAN_6_MONTHS">🟣 Semestral</option><option value="PLAN_1_YEAR">🟡 Anual</option></select></div>
            </>
          )}
          <button className="w-full bg-indigo-600 hover:bg-indigo-500 text-white p-3 rounded-lg font-bold shadow-lg transition-all mt-2">{isRegister ? 'SOLICITAR ACESSO' : 'ENTRAR'}</button>
        </form>
        <button onClick={() => { setIsRegister(!isRegister); setError(''); }} className="w-full mt-4 text-gray-500 text-xs font-bold hover:text-white uppercase">{isRegister ? 'Já tenho conta' : 'Criar nova conta'}</button>
      </div>
    </div>
  );
}
EOF
