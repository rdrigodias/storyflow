
export interface Scene {
  sceneNumber: number;
  narration: string;
  duration: string;
  durationSeconds: number; // Adicionado para a geração de vídeo
  visualDescription: string;
  imageUrl: string;
  isRegenerating?: boolean; // Para o feedback de UI ao regenerar
  charactersPresent?: string[]; // Adicionado para análise de roteiro
}

// Para os dados do formulário
export interface CharacterInput {
  id: number;
  type: 'image' | 'ai'; // Novo: Define se o personagem usa imagem ou IA
  name: string;
  characteristic?: string;
  context?: string; 
  file: File | null;
  previewUrl?: string; 
}

// Para os dados enviados à API
export interface CharacterReference {
    name: string;
    base64Image: string;
    mimeType: string;
    characteristic?: string;
    context?: string;
}

// Tipo para todas as informações dos personagens, com ou sem imagem
export type AllCharactersInfo = Array<{
  name: string;
  characteristic?: string;
  context?: string;
}>;
