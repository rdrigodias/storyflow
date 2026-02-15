
import React, { useState, useRef } from 'react';
import type { Scene } from '../types';

interface SceneCardProps {
  scene: Scene;
  onRegenerate: (sceneNumber: number, newVisualDescription: string) => Promise<void>;
  isSelected: boolean;
  onSelectionChange: (sceneNumber: number) => void;
  onDeleteImage: (sceneNumber: number) => void;
  onUpdateImage: (sceneNumber: number, file: File) => void;
}

const Separator = () => (
    <div className="text-center text-gray-600 text-xl tracking-[0.3em]">
        ═══════════════════════════════════════
    </div>
);

const FooterSeparator = () => (
    <div className="text-center text-gray-700">
        ───────────────────────────────────────
    </div>
);

export const SceneCard: React.FC<SceneCardProps> = ({ scene, onRegenerate, isSelected, onSelectionChange, onDeleteImage, onUpdateImage }) => {
  const [editedDescription, setEditedDescription] = useState(scene.visualDescription);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleRegenerateClick = () => {
    if (scene.isRegenerating) return;
    onRegenerate(scene.sceneNumber, editedDescription);
  };
  
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onUpdateImage(scene.sceneNumber, file);
    }
     // Reset the input value to allow uploading the same file again
    if(event.target) {
        event.target.value = '';
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className={`relative bg-gray-800 rounded-xl shadow-2xl overflow-hidden border transition-all duration-200 ${isSelected ? 'ring-2 ring-indigo-500 border-indigo-500' : 'border-gray-700'}`}>
        <div className="absolute top-4 right-4 z-10">
            <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onSelectionChange(scene.sceneNumber)}
                aria-label={`Selecionar cena ${scene.sceneNumber}`}
                className="h-6 w-6 rounded text-indigo-600 bg-gray-900 border-gray-500 focus:ring-indigo-500 cursor-pointer"
            />
        </div>

      <div className="p-6">
        <Separator />
        <h2 className="text-center text-2xl font-bold my-3 text-gray-300">CENA {scene.sceneNumber}</h2>
        <Separator />
      </div>

      <div className="p-6 space-y-6">
        <div>
          <h3 className="font-semibold text-lg text-purple-400 mb-2">📖 NARRAÇÃO:</h3>
          <p className="text-gray-300 italic">"{scene.narration}"</p>
        </div>

        <div>
          <h3 className="font-semibold text-lg text-purple-400 mb-2">⏱️ DURAÇÃO:</h3>
          <p className="text-gray-300">{scene.duration}</p>
        </div>

        <div>
          <h3 className="font-semibold text-lg text-purple-400 mb-2">🎬 DESCRIÇÃO VISUAL DETALHADA (PROMPT):</h3>
          <textarea
            value={editedDescription}
            onChange={(e) => setEditedDescription(e.target.value)}
            disabled={scene.isRegenerating}
            rows={4}
            className="w-full p-3 bg-gray-900 border border-gray-600 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-300 leading-relaxed whitespace-pre-wrap resize-y transition-colors duration-200 disabled:opacity-50"
          />
        </div>

        <div>
            <h3 className="font-semibold text-lg text-purple-400 mb-3">🖼️ IMAGEM:</h3>
            <div className="bg-gray-900 rounded-lg overflow-hidden relative">
                <img src={scene.imageUrl} alt={`Visual for scene ${scene.sceneNumber}`} className="w-full h-auto object-cover" />
                {scene.isRegenerating && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <svg className="animate-spin h-10 w-10 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                    </div>
                )}
            </div>
            <div className="text-center mt-4">
                <div className="flex flex-wrap justify-center items-center gap-3">
                    <button
                        onClick={handleRegenerateClick}
                        disabled={scene.isRegenerating}
                        className="inline-flex items-center justify-center px-5 py-2 text-md font-semibold text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-indigo-500 disabled:bg-gray-500 disabled:cursor-not-allowed transition-all duration-300 ease-in-out transform hover:scale-105 disabled:scale-100"
                    >
                        {scene.isRegenerating ? (
                        <>
                            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Gerando...
                        </>
                        ) : (
                        '✨ Gerar Novamente'
                        )}
                    </button>
                     <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept="image/*"
                        className="hidden"
                        disabled={scene.isRegenerating}
                    />
                    <button
                        onClick={handleUploadClick}
                        disabled={scene.isRegenerating}
                        className="inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-white bg-gray-600 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-gray-500 disabled:bg-gray-500 disabled:cursor-not-allowed transition-all"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                        Upload
                    </button>
                    <button
                        onClick={() => onDeleteImage(scene.sceneNumber)}
                        disabled={scene.isRegenerating}
                        className="inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-red-500 disabled:bg-gray-500 disabled:cursor-not-allowed transition-all"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        Excluir
                    </button>
                </div>
            </div>
        </div>
      </div>
      
      <div className="p-6 pt-0">
        <FooterSeparator />
      </div>

    </div>
  );
};
