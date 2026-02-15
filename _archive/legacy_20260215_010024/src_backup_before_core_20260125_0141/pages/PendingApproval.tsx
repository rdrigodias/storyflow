
import React from 'react';
import { Link } from 'react-router-dom';

export function PendingApproval() {
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-gray-800 rounded-xl border border-yellow-600/30 p-8 text-center shadow-2xl">
        <div className="flex justify-center mb-6">
          <div className="bg-yellow-900/30 p-4 rounded-full">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
        
        <h1 className="text-2xl font-bold text-white mb-2">Conta em Análise</h1>
        <p className="text-gray-300 mb-6 leading-relaxed">
          Obrigado por se cadastrar no <strong>StoryFlow AI</strong>. Seu pedido foi recebido e está aguardando aprovação do administrador.
        </p>
        
        <div className="bg-gray-900 rounded-lg p-4 mb-6 border border-gray-700">
          <p className="text-sm text-gray-400">
            Entraremos em contato via WhatsApp para confirmar a ativação do seu plano.
          </p>
        </div>

        <Link to="/login" className="inline-block px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors">
          Voltar para Login
        </Link>
      </div>
    </div>
  );
}
