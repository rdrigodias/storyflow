import React, { useEffect, useState } from "react";

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (apiKey: string) => void; // o salvamento/validação acontece fora (backend)
  canClose: boolean;
}

export function ApiKeyModal({ isOpen, onClose, onSave, canClose }: ApiKeyModalProps) {
  const [keyInput, setKeyInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setKeyInput("");
      setLoading(false);
      setStatus("idle");
      setMessage("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setLoading(true);
    setStatus("idle");
    setMessage("");

    try {
      if (!keyInput.trim()) {
        throw new Error("Digite uma API Key.");
      }
      // delega para quem chamou (ex: DashboardPlaceholder) salvar/validar no backend
      await Promise.resolve(onSave(keyInput.trim()));

      setStatus("success");
      setMessage("API Key salva com sucesso.");
    } catch (e: any) {
      setStatus("error");
      setMessage(e?.message || "Falha ao salvar API Key.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl bg-gray-900 border border-gray-800 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-black text-white">Configurar API Key</h2>
            <p className="text-sm text-gray-400 mt-1">
              Cole sua API Key. O sistema irá validar/salvar no servidor.
            </p>
          </div>

          <button
            className="text-gray-400 hover:text-white"
            onClick={() => canClose && onClose()}
            disabled={!canClose}
            title={!canClose ? "Você precisa salvar uma chave antes de fechar." : "Fechar"}
          >
            ✕
          </button>
        </div>

        <div className="mt-4">
          <label className="text-sm text-gray-300 font-bold">API Key</label>
          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="Cole aqui..."
            className="mt-2 w-full rounded-lg bg-gray-950 border border-gray-800 px-3 py-2 text-white outline-none focus:border-indigo-600"
          />
        </div>

        {status !== "idle" && (
          <div
            className={`mt-3 text-sm ${
              status === "success" ? "text-green-400" : "text-red-400"
            }`}
          >
            {message}
          </div>
        )}

        <div className="mt-5 flex gap-3 justify-end">
          <button
            className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 font-bold text-sm"
            onClick={() => canClose && onClose()}
            disabled={!canClose || loading}
          >
            Cancelar
          </button>

          <button
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 font-bold text-sm disabled:opacity-50"
            onClick={handleSave}
            disabled={loading}
          >
            {loading ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
