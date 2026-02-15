
import React from 'react';
import { SceneCard } from './SceneCard';
import { LoadingIndicator } from './LoadingIndicator';
import type { Scene } from '../types';

interface SceneDisplayProps {
  scenes: Scene[];
  isLoading: boolean;
  loadingMessage: string;
  error: string | null;
  onRegenerateScene: (sceneNumber: number, newVisualDescription: string) => Promise<void>;
  selectedScenes: Set<number>;
  onSceneSelection: (sceneNumber: number) => void;
  onDeleteSceneImage: (sceneNumber: number) => void;
  onUpdateSceneImage: (sceneNumber: number, file: File) => void;
}

export function SceneDisplay({ scenes, isLoading, loadingMessage, error, onRegenerateScene, selectedScenes, onSceneSelection, onDeleteSceneImage, onUpdateSceneImage }: SceneDisplayProps) {
  if (isLoading) {
    return <LoadingIndicator message={loadingMessage} />;
  }

  if (error) {
    return (
      <div className="text-center p-8 bg-red-900/20 border border-red-500 rounded-lg">
        <h3 className="text-xl font-semibold text-red-400">Ocorreu um Erro</h3>
        <p className="mt-2 text-red-300">{error}</p>
      </div>
    );
  }
  
  if (scenes.length === 0) {
    return (
      <div className="text-center py-16 px-8 bg-gray-800/50 border border-dashed border-gray-600 rounded-lg">
        <h3 className="text-xl font-semibold text-gray-300">Aguardando seu roteiro</h3>
        <p className="mt-2 text-gray-400">Preencha os campos acima e clique em gerar para ver a mágica acontecer.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {scenes.map((scene) => (
        <SceneCard 
            key={scene.sceneNumber} 
            scene={scene} 
            onRegenerate={onRegenerateScene}
            isSelected={selectedScenes.has(scene.sceneNumber)}
            onSelectionChange={onSceneSelection}
            onDeleteImage={onDeleteSceneImage}
            onUpdateImage={onUpdateSceneImage}
        />
      ))}
    </div>
  );
}
