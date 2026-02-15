import React, { useState } from "react";
import { Header } from "./Header";
import { ApiKeyModal } from "./ApiKeyModal";

const API_BASE = import.meta.env.VITE_API_BASE;

export function DashboardPlaceholder() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const saveKey = async (key: string) => {
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_BASE}/user/apikey`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token || ""}`,
      },
      body: JSON.stringify({ apiKey: key }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const msg = (data && (data.error || data.message)) || "Falha ao salvar API Key";
      throw new Error(msg);
    }

    setIsModalOpen(false);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Header onOpenSettings={() => setIsModalOpen(true)} />

      <main className="max-w-4xl mx-auto p-6">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <h2 className="text-xl font-black">Núcleo removido</h2>
          <p className="text-gray-400 mt-2 text-sm">
            Autenticação, planos/expiração, painel admin e salvamento de API Key continuam.
            O módulo de Storyboard será importado na próxima etapa.
          </p>

          <div className="mt-4">
            <button
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 font-bold text-sm"
              onClick={() => setIsModalOpen(true)}
            >
              Configurar API Key
            </button>
          </div>
        </div>
      </main>

      <ApiKeyModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        canClose={true}
        onSave={(key) => {
          saveKey(key).catch((e) => alert(e.message));
        }}
      />
    </div>
  );
}
