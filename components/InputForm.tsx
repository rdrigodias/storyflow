
import React, { useState, useEffect } from 'react';
import type { CharacterInput } from '../types';
import { ImageStyleSelector } from './ImageStyleSelector';

interface InputFormProps {
  onSubmit: (
      characters: CharacterInput[], 
      script: string, 
      srtContent: string | null, 
      audioFile: File | null, 
      imageStyle: string, 
      restrictionPrompt: string,
      generationDelay: number,
      pacing: number 
    ) => void;
  isLoading: boolean;
}

const Guidelines = () => (
  <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700 mt-6">
    <div className="flex items-center mb-3 text-yellow-400">
      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <h3 className="text-md font-semibold">Diretrizes para Geração</h3>
    </div>
    <ul className="list-disc list-inside text-gray-400 text-xs space-y-1">
      <li>Evite nomes de celebridades ou pessoas reais.</li>
      <li>Conteúdo sensível será bloqueado pela política de segurança da Google.</li>
      <li>Texto em imagens é gerado com baixa precisão pela maioria dos modelos.</li>
    </ul>
  </div>
);


export function InputForm({ onSubmit, isLoading }: InputFormProps) {
  // Estado 'script' removido pois agora é obrigatório usar SRT
  const [characters, setCharacters] = useState<CharacterInput[]>([
    { id: Date.now(), type: 'image', name: '', characteristic: '', context: '', file: null, previewUrl: '' }
  ]);
  const [srtFile, setSrtFile] = useState<File | null>(null);
  const [srtContent, setSrtContent] = useState<string | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const [imageStyle, setImageStyle] = useState<string>('Filme Realista');
  const [restrictionPrompt, setRestrictionPrompt] = useState('');
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [apiPlan, setApiPlan] = useState<'free' | 'paid'>('free');
  
  // 22: Frenético, 35: Padrão, 60: Documentário
  const [pacing, setPacing] = useState<number>(35); 

  useEffect(() => {
    return () => {
      characters.forEach(char => char.previewUrl && URL.revokeObjectURL(char.previewUrl));
      if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
    };
  }, [characters, audioPreviewUrl]);

  const addCharacter = (type: 'image' | 'ai') => {
    setCharacters(prev => [
      ...prev,
      { id: Date.now(), type, name: '', characteristic: '', context: '', file: null, previewUrl: '' }
    ]);
  };

  const removeCharacter = (id: number) => {
    setCharacters(prev => {
      const charToRemove = prev.find(c => c.id === id);
      if (charToRemove?.previewUrl) URL.revokeObjectURL(charToRemove.previewUrl);
      return prev.filter(c => c.id !== id);
    });
  };
  
  const handleCharacterChange = (id: number, field: 'name' | 'file' | 'characteristic' | 'context', value: string | File | null) => {
    setCharacters(prev => 
      prev.map(char => {
        if (char.id === id) {
          if (field === 'file') {
             if (char.previewUrl) URL.revokeObjectURL(char.previewUrl);
             const fileValue = value as File | null;
             return { ...char, file: fileValue, previewUrl: fileValue ? URL.createObjectURL(fileValue) : undefined };
          }
          if ((field === 'name' || field === 'characteristic' || field === 'context') && typeof value === 'string') {
             return { ...char, [field]: value };
          }
        }
        return char;
      })
    );
  };

  const handleSrtFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setSrtFile(file);
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setSrtContent(e.target?.result as string);
      };
      reader.readAsText(file);
    } else {
      setSrtContent(null);
    }
  };

  const handleAudioFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setAudioFile(file);
    if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
    if (file) setAudioPreviewUrl(URL.createObjectURL(file));
    else setAudioPreviewUrl(null);
  };

  const isFormValid = () => {
    // Validação simplificada: SRT é obrigatório
    if (!srtFile) return false;
    if (characters.length === 0) return false;
    
    return characters.every(char => {
      const nameOk = char.name.trim().length > 0;
      if (char.type === 'image') return nameOk && char.file !== null;
      return nameOk;
    });
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidationAttempted(true);
    if (!isFormValid() || isLoading) return;
    const delay = apiPlan === 'paid' ? 2000 : 30000;
    // Passamos string vazia para 'script' pois estamos usando apenas SRT
    onSubmit(characters, "", srtContent, audioFile, imageStyle, restrictionPrompt, delay, pacing);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-gray-800/50 p-6 rounded-lg shadow-md border border-gray-700 space-y-8">
      
      {/* 1. CONFIGURAÇÕES GERAIS */}
      <div className="flex flex-col md:flex-row gap-6">
        <div className="flex-1">
            <label className="block text-lg font-bold text-gray-300 mb-3 uppercase tracking-wider">
              1. Gerenciar Personagens
            </label>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => addCharacter('image')}
                disabled={isLoading}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-bold text-sm transition-all"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                + Ref. Imagem
              </button>
              <button
                type="button"
                onClick={() => addCharacter('ai')}
                disabled={isLoading}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md font-bold text-sm transition-all"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                + IA Decide
              </button>
            </div>
            {characters.length === 0 && (
              <p className="text-red-400 text-xs mt-2 font-semibold italic">Adicione pelo menos um personagem para continuar.</p>
            )}
        </div>

        <div className="flex-1">
            <label className="block text-lg font-bold text-gray-300 mb-3 uppercase tracking-wider">
            ⚙️ Configuração
            </label>
            <div className="space-y-4">
                {/* Seletor de Plano */}
                <div className="grid grid-cols-2 gap-2">
                    <button
                        type="button"
                        onClick={() => setApiPlan('free')}
                        className={`p-3 rounded-md border transition-all text-xs font-black uppercase ${apiPlan === 'free' ? 'bg-gray-700 border-indigo-500 text-white shadow-lg' : 'bg-gray-900 border-gray-700 text-gray-500'}`}
                    >
                        Plano Gratuito
                    </button>
                    <button
                        type="button"
                        onClick={() => setApiPlan('paid')}
                        className={`p-3 rounded-md border transition-all text-xs font-black uppercase ${apiPlan === 'paid' ? 'bg-indigo-900/50 border-indigo-400 text-indigo-100 shadow-indigo-500/20 shadow-lg' : 'bg-gray-900 border-gray-700 text-gray-500'}`}
                    >
                        Plano Pago ⚡
                    </button>
                </div>
            </div>
        </div>
      </div>

      {/* LISTA DINÂMICA DE PERSONAGENS */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {characters.map((char, index) => {
          const isNameInvalid = validationAttempted && !char.name.trim();
          const isFileInvalid = validationAttempted && char.type === 'image' && !char.file;
          const cardBorderColor = char.type === 'image' ? 'border-indigo-500/30' : 'border-emerald-500/30';
          const cardHeaderBg = char.type === 'image' ? 'bg-indigo-500/10' : 'bg-emerald-500/10';
          const cardTypeLabel = char.type === 'image' ? 'Referência' : 'IA Decide';

          return (
            <div key={char.id} className={`bg-gray-900/40 rounded-xl border-2 transition-all ${cardBorderColor} ${isNameInvalid || isFileInvalid ? 'border-red-500 shadow-lg shadow-red-500/20' : ''}`}>
                <div className={`flex justify-between items-center p-3 rounded-t-xl ${cardHeaderBg}`}>
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-800 text-[10px] font-black text-gray-400">
                      {index + 1}
                    </span>
                    <span className={`text-[10px] font-black uppercase tracking-widest ${char.type === 'image' ? 'text-indigo-400' : 'text-emerald-400'}`}>
                      {cardTypeLabel}
                    </span>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => removeCharacter(char.id)}
                    className="p-1 text-gray-500 hover:text-red-400 transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>

                <div className="p-4 space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase ml-1">Nome do Personagem *</label>
                    <input
                        type="text"
                        placeholder="Ex: Dr. Smith"
                        value={char.name}
                        onChange={(e) => handleCharacterChange(char.id, 'name', e.target.value)}
                        disabled={isLoading}
                        className={`w-full p-2.5 bg-gray-800 border rounded-lg text-sm transition-all focus:ring-2 focus:ring-indigo-500 ${isNameInvalid ? 'border-red-500' : 'border-gray-700'}`}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-500 uppercase ml-1">Traits Visuais</label>
                      <textarea
                          placeholder="Ex: Cabelos brancos, olhos profundos..."
                          value={char.characteristic || ''}
                          onChange={(e) => handleCharacterChange(char.id, 'characteristic', e.target.value)}
                          disabled={isLoading}
                          rows={2}
                          className="w-full p-2.5 bg-gray-800 border border-gray-700 rounded-lg text-xs resize-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-indigo-400/80 uppercase ml-1">Contexto no Roteiro</label>
                      <textarea
                          placeholder="Ex: Ele é o mentor sábio que guia o herói."
                          value={char.context || ''}
                          onChange={(e) => handleCharacterChange(char.id, 'context', e.target.value)}
                          disabled={isLoading}
                          rows={2}
                          className="w-full p-2.5 bg-gray-900 border border-indigo-900/30 rounded-lg text-xs resize-none text-indigo-100 placeholder:text-gray-700 focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  {char.type === 'image' && (
                    <div className="space-y-2 pt-2 border-t border-gray-800">
                        <label className={`block w-full text-xs cursor-pointer group ${isFileInvalid ? 'ring-2 ring-red-500 rounded-lg' : ''}`}>
                            <div className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-gray-700 rounded-xl group-hover:bg-gray-800/50 group-hover:border-indigo-500/50 transition-all">
                                {char.previewUrl ? (
                                  <img src={char.previewUrl} className="w-16 h-16 object-cover rounded-full border-2 border-indigo-500 mb-2 shadow-lg" />
                                ) : (
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-600 mb-1 group-hover:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                  </svg>
                                )}
                                <span className="text-[10px] font-black uppercase text-gray-500 group-hover:text-indigo-300">
                                  {char.file ? char.file.name : 'Subir Imagem *'}
                                </span>
                            </div>
                             <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => handleCharacterChange(char.id, 'file', e.target.files ? e.target.files[0] : null)}
                                disabled={isLoading}
                                className="hidden"
                            />
                        </label>
                    </div>
                  )}
                </div>
            </div>
            );
        })}
      </div>

      <div className="space-y-6">
        <div>
          <label className="block text-lg font-bold text-gray-300 mb-3 uppercase tracking-wider">2. Roteiro (.srt)</label>
          <div className={`bg-gray-900/50 p-5 rounded-xl border-2 transition-all ${validationAttempted && !srtFile ? 'border-red-500' : 'border-gray-700'}`}>
              
              <div className="mb-6">
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 mb-2 block">Ritmo do Vídeo (Cortes e Duração)</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: 22, label: 'Frenético (Shorts)', desc: '~20 palavras/cena' },
                      { value: 35, label: 'Padrão (YouTube)', desc: '~35 palavras/cena' },
                      { value: 60, label: 'Documentário', desc: '~60 palavras/cena' }
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setPacing(opt.value)}
                        className={`p-3 rounded-lg border text-left transition-all ${pacing === opt.value ? 'bg-indigo-900/60 border-indigo-400 ring-1 ring-indigo-400' : 'bg-gray-800 border-gray-700 hover:border-gray-600'}`}
                      >
                        <div className={`text-xs font-black uppercase ${pacing === opt.value ? 'text-white' : 'text-gray-400'}`}>{opt.label}</div>
                        <div className="text-[10px] text-gray-500 mt-1">{opt.desc}</div>
                      </button>
                    ))}
                  </div>
              </div>
              
              <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1 space-y-2">
                    <label className="text-[10px] font-bold text-indigo-300 uppercase ml-1">Upload Arquivo de Legenda (.srt) *OBRIGATÓRIO</label>
                    <input
                        type="file"
                        accept=".srt"
                        onChange={handleSrtFileChange}
                        disabled={isLoading}
                        className="w-full text-xs text-gray-400 file:bg-indigo-700 file:text-white file:border-0 file:rounded-md file:px-4 file:py-3 file:mr-4 file:font-semibold file:hover:bg-indigo-600 transition-all cursor-pointer bg-gray-800/50 rounded-lg border border-gray-600 p-1"
                    />
                    <p className="text-[10px] text-gray-500 ml-1">Este arquivo definirá as cenas e o texto.</p>
                  </div>
                  <div className="flex-1 space-y-2">
                    <label className="text-[10px] font-bold text-emerald-300 uppercase ml-1">Áudio da Narração (Opcional)</label>
                    <input
                        type="file"
                        accept="audio/*"
                        onChange={handleAudioFileChange}
                        disabled={isLoading}
                        className="w-full text-xs text-gray-400 file:bg-emerald-700 file:text-white file:border-0 file:rounded-md file:px-4 file:py-3 file:mr-4 file:font-semibold file:hover:bg-emerald-600 transition-all cursor-pointer bg-gray-800/50 rounded-lg border border-gray-600 p-1"
                    />
                    {audioPreviewUrl && <audio controls src={audioPreviewUrl} className="w-full h-8 mt-1" />}
                    <p className="text-[10px] text-gray-500 ml-1">Sincroniza a duração exata do vídeo.</p>
                  </div>
              </div>
          </div>
        </div>

        <div>
          <label className="block text-lg font-bold text-gray-300 mb-3 uppercase tracking-wider">3. Estilo Visual</label>
          <ImageStyleSelector selectedStyle={imageStyle} onStyleChange={setImageStyle} isDisabled={isLoading} />
        </div>

        <div>
          <label className="block text-lg font-bold text-gray-300 mb-3 uppercase tracking-wider">🛑 Restrições Globais (Prompt Negativo)</label>
          <textarea
              placeholder="Ex: Nunca gere personagens com 3 braços. Mantenha o cenário sempre escuro..."
              value={restrictionPrompt}
              onChange={(e) => setRestrictionPrompt(e.target.value)}
              disabled={isLoading}
              rows={3}
              className="w-full p-4 bg-gray-900 border border-gray-700 rounded-xl text-xs text-gray-400 resize-none focus:ring-1 focus:ring-red-500/50"
          />
        </div>
      </div>

      <div className="text-center pt-10 border-t border-gray-700">
        <button
          type="submit"
          disabled={isLoading || !isFormValid()}
          className={`px-16 py-5 rounded-2xl font-black text-2xl tracking-widest transition-all ${isLoading ? 'bg-gray-700 cursor-not-allowed scale-95' : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 hover:scale-105 active:scale-95 shadow-2xl shadow-indigo-500/40'}`}
        >
          {isLoading ? '⚙️ PROCESSANDO...' : '🚀 CRIAR STORYBOARD'}
        </button>
        {validationAttempted && !isFormValid() && (
          <p className="text-red-400 text-xs mt-4 font-bold animate-pulse">
             {!srtFile ? '⚠️ O arquivo .SRT é obrigatório.' : 'Preencha todos os campos obrigatórios (*) antes de iniciar.'}
          </p>
        )}
      </div>
      
      <Guidelines />
    </form>
  );
}
