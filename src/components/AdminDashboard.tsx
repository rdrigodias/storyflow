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

// ✅ Base da API via .env (ex: https://api.storyflowai.com.br)
const API_BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");

export function AdminDashboard() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<string>('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('token');

      const res = await fetch(`${API_BASE}/admin/users`, {
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

      const res = await fetch(`${API_BASE}/admin/change-plan`, {
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
        fetchUsers();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Erro: ${err?.message || 'Falha ao atualizar plano'}`);
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
                    {String(user.role).toUpperCase() === 'ADMIN' && (
                      <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-red-600 text-white font-black">
                        ADMIN
                      </span>
                    )}
                  </td>

                  <td className="p-4">{translatePlan(user.plan)}</td>

                  <td className="p-4">
                    {String(user.status).toUpperCase() === 'ACTIVE' ? (
                      <span className="inline-flex items-center gap-2 text-green-400 font-bold">
                        <CheckCircle className="w-4 h-4" /> Ativo
                      </span>
                    ) : String(user.status).toUpperCase() === 'PENDING' ? (
                      <span className="inline-flex items-center gap-2 text-yellow-400 font-bold">
                        <AlertTriangle className="w-4 h-4" /> Pendente
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2 text-red-400 font-bold">
                        <XCircle className="w-4 h-4" /> Bloqueado
                      </span>
                    )}
                  </td>

                  <td className="p-4">{formatDate(user.expiresAt)}</td>

                  <td className="p-4 text-center">
                    {user.googleApiKey ? (
                      <span className="inline-flex items-center gap-1 text-green-400 font-bold">
                        <Key className="w-4 h-4" /> OK
                      </span>
                    ) : (
                      <span className="text-gray-500">—</span>
                    )}
                  </td>

                  <td className="p-4 text-right">
                    {editingUser === user.email ? (
                      <div className="flex items-center justify-end gap-2">
                        <select
                          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs"
                          value={selectedPlan}
                          onChange={(e) => setSelectedPlan(e.target.value)}
                        >
                          <option value="">Selecione...</option>
                          {PLAN_OPTIONS.map((p) => (
                            <option key={p.value} value={p.value}>
                              {p.label}
                            </option>
                          ))}
                        </select>

                        <button
                          className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black"
                          onClick={() => handleUpdatePlan(user.email)}
                        >
                          SALVAR
                        </button>

                        <button
                          className="px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-xs font-black"
                          onClick={() => setEditingUser(null)}
                        >
                          CANCELAR
                        </button>
                      </div>
                    ) : (
                      <button
                        className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-black"
                        onClick={() => { setEditingUser(user.email); setSelectedPlan(''); }}
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
