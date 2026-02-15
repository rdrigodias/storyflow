
import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';

export function Register() {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    whatsapp: '',
    plan: 'PLAN_30_DAYS'
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  // Updated to port 3001
  const API_URL = 'http://144.91.88.214:3001';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      await axios.post(`${API_URL}/register`, formData);
      navigate('/pending');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Falha ao criar conta');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full bg-gray-800 rounded-xl shadow-2xl border border-gray-700 p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">Criar Nova Conta</h1>
          <p className="text-gray-400 mt-1">Junte-se ao StoryFlow AI</p>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-500 text-red-200 p-3 rounded-lg mb-4 text-sm text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email</label>
            <input
              name="email"
              type="email"
              required
              value={formData.email}
              onChange={handleChange}
              className="w-full p-3 bg-gray-900 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Senha</label>
            <input
              name="password"
              type="password"
              required
              minLength={6}
              value={formData.password}
              onChange={handleChange}
              className="w-full p-3 bg-gray-900 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">WhatsApp</label>
            <input
              name="whatsapp"
              type="text"
              required
              placeholder="(00) 00000-0000"
              value={formData.whatsapp}
              onChange={handleChange}
              className="w-full p-3 bg-gray-900 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Plano Desejado</label>
            <select
              name="plan"
              value={formData.plan}
              onChange={handleChange}
              className="w-full p-3 bg-gray-900 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-indigo-500"
            >
              <option value="PLAN_30_DAYS">Mensal (30 Dias)</option>
              <option value="PLAN_6_MONTHS">Semestral (6 Meses)</option>
              <option value="PLAN_1_YEAR">Anual (1 Ano)</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 mt-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition-all shadow-lg shadow-emerald-900/20 disabled:opacity-50"
          >
            {isLoading ? 'Criando...' : 'Solicitar Acesso'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-gray-500">
          Já tem uma conta?{' '}
          <Link to="/login" className="text-indigo-400 hover:text-indigo-300 font-semibold">
            Entrar
          </Link>
        </div>
      </div>
    </div>
  );
}
