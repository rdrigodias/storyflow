import React, { useState } from "react";
import { Header } from "../components/Header";
import { ApiKeyModal } from "../components/ApiKeyModal";
import { StoryboardCore } from "./StoryboardCore";

const API_BASE = import.meta.env.VITE_API_BASE;

export function StoryboardDashboard() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const saveKey = async (key: string) => {
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_BASE}/user/apikey`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token || ""}`,
      },
      body: JSON.stringify({ apiKey: key }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const msg = (data && (data.error || data.message)) || "Falha ao salvar API Key";
      throw new Error(msg);
    }

    // O core lê daqui
    localStorage.setItem("googleApiKey", key);

  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Header onOpenSettings={() => setIsModalOpen(true)} />

      <StoryboardCore onOpenSettings={() => setIsModalOpen(true)} />

      <ApiKeyModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        canClose={true}
        onSave={saveKey}
      />
    </div>
  );
}
