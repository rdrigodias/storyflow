import React, { useEffect, useState } from "react";
import { Header } from "./Header";
import { ApiKeyModal } from "./ApiKeyModal";


const API_BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");

export function DashboardPlaceholder() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [hasKey, setHasKey] = useState(false);

  // opcional: tenta descobrir se já existe chave salva (se você tiver endpoint pra isso)
  useEffect(() => {
    // Se não existir endpoint, deixa sempre false e força abrir modal.
    // setIsModalOpen(true);
  }, []);

  const saveKey = async (key: string) => {
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_BASE}/user/apikey`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ apiKey: key }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const msg = data?.error || data?.message || "Falha ao salvar API Key";
      throw new Error(msg);
    }

    setHasKey(true);
    setIsModalOpen(false);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Header onOpenSettings={() => setIsModalOpen(true)} />

      <main className="max-w-4xl mx-auto p-6">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <h2 className="text-xl font-black">Núcleo removido</h2>
          <p className="text-gray-400 mt-2 text-sm">
            O app está com autenticação, planos/expiração, painel admin e salvamento de API Key funcionando.
            O módulo de Geração de Storyboard será importado na próxima etapa.
          </p>

          <div className="mt-4 flex gap-3">
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
        canClose={hasKey}
        onSave={(key) => {
          // ApiKeyModal espera sync, então fazemos async com wrapper
          saveKey(key).catch((e) => alert(e.message));
        }}
      />
    </div>
  );
}
