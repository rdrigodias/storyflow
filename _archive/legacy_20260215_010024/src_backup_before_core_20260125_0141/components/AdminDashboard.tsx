import React, { useEffect, useState } from 'react';
import { Shield, CheckCircle, XCircle, AlertTriangle, Search, Save, Key } from 'lucide-react';

interface User {
  id: string;
  email: string;
  plan: string;
  status: string;
  expiresAt: string | null;
  role: string;
  googleApiKey: string | null;
}

const PLAN_OPTIONS = [
  { value: 'PLAN_30_DAYS', label: '🟢 Mensal (30 Dias)' },
  { value: 'PLAN_3_MONTHS', label: '🔵 Trimestral (90 Dias)' },
  { value: 'PLAN_6_MONTHS', label: '🟣 Semestral (180 Dias)' },
  { value: 'PLAN_1_YEAR',    label: '🟡 Anual (365 Dias)' },
  { value: 'BAN_USER',       label: '🔴 BANIR USUÁRIO' },
];

export function AdminDashboard() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<string>('');
  const [error, setError] = useState('');

  // Busca os dados ao carregar
  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('http://144.91.88.214:3001/admin/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) throw new Error('Falha ao carregar usuários. Você é Admin?');
      
      const data = await res.json();
      setUsers(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePlan = async (email: string) => {
    if (!selectedPlan) return;
    if (!confirm(`Tem certeza que deseja aplicar ${selectedPlan} para ${email}?`)) return;

    try {
      const token = localStorage.getItem('token');
      const res = await fetch('http://144.91.88.214:3001/admin/change-plan', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ email, newPlan: selectedPlan })
      });

      if (res.ok) {
        alert('✅ Plano atualizado com sucesso!');
        setEditingUser(null);
        fetchUsers(); // Recarrega a lista
      } else {
        const err = await res.json();
        alert(`Erro: ${err.message}`);
      }
    } catch (e) {
      alert('Erro de conexão');
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Nunca';
    return new Date(dateStr).toLocaleDateString('pt-BR');
  };

  const translatePlan = (plan: string) => {
    const map: Record<string, string> = {
        'PLAN_30_DAYS': 'Mensal',
        'PLAN_3_MONTHS': 'Trimestral',
        'PLAN_6_MONTHS': 'Semestral',
        'PLAN_1_YEAR': 'Anual'
    };
    return map[plan] || plan;
  };

  if (loading) return <div className="text-white text-center p-10">Carregando painel...</div>;
  if (error) return <div className="text-red-400 text-center p-10 font-bold">⛔ {error}</div>;

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="flex items-center gap-3 mb-8">
        <div className="bg-red-600 p-3 rounded-lg shadow-lg">
            <Shield className="w-8 h-8 text-white" />
        </div>
        <div>
            <h1 className="text-3xl font-black text-white tracking-tight">Painel Admin</h1>
            <p className="text-gray-400">Gerenciamento seguro de usuários</p>
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl shadow-2xl border border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-400">
            <thead className="bg-gray-900 text-gray-200 uppercase font-bold text-xs">
                <tr>
                <th className="p-4">Usuário / Email</th>
                <th className="p-4">Plano Atual</th>
                <th className="p-4">Status</th>
                <th className="p-4">Vencimento</th>
                <th className="p-4 text-center">API Key</th>
                <th className="p-4 text-right">Ação</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
                {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-750 transition-colors">
                    <td className="p-4 font-medium text-white">
                        {user.email}
                        {user.role === 'ADMIN' && <span className="ml-2 text-[10px] bg-red-500 text-white px-1 rounded">ADMIN</span>}
                    </td>
                    
                    <td className="p-4">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${user.plan.includes('YEAR') ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'}`}>
                            {translatePlan(user.plan)}
                        </span>
                    </td>

                    <td className="p-4">
                        {user.status === 'ACTIVE' 
                            ? <span className="flex items-center gap-1 text-emerald-400"><CheckCircle className="w-4 h-4"/> Ativo</span>
                            : <span className="flex items-center gap-1 text-red-400"><XCircle className="w-4 h-4"/> {user.status}</span>
                        }
                    </td>

                    <td className="p-4 text-white">
                        {formatDate(user.expiresAt)}
                    </td>

                    <td className="p-4 text-center">
                        {user.googleApiKey 
                            ? <CheckCircle className="w-5 h-5 text-emerald-500 mx-auto" title="Chave Salva" />
                            : <AlertTriangle className="w-5 h-5 text-yellow-500 mx-auto" title="Sem Chave" />
                        }
                    </td>

                    <td className="p-4 text-right">
                        {editingUser === user.email ? (
                            <div className="flex items-center gap-2 justify-end">
                                <select 
                                    className="bg-gray-900 border border-gray-600 rounded p-1 text-xs text-white outline-none"
                                    onChange={(e) => setSelectedPlan(e.target.value)}
                                    defaultValue=""
                                >
                                    <option value="" disabled>Selecione...</option>
                                    {PLAN_OPTIONS.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                                <button 
                                    onClick={() => handleUpdatePlan(user.email)}
                                    className="bg-emerald-600 hover:bg-emerald-500 p-1.5 rounded text-white"
                                    title="Salvar"
                                >
                                    <Save className="w-4 h-4" />
                                </button>
                                <button 
                                    onClick={() => setEditingUser(null)}
                                    className="bg-gray-600 hover:bg-gray-500 p-1.5 rounded text-white"
                                    title="Cancelar"
                                >
                                    <XCircle className="w-4 h-4" />
                                </button>
                            </div>
                        ) : (
                            <button 
                                onClick={() => setEditingUser(user.email)}
                                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-bold transition-all"
                            >
                                GERENCIAR
                            </button>
                        )}
                    </td>
                </tr>
                ))}
            </tbody>
            </table>
        </div>
      </div>
    </div>
  );
}
