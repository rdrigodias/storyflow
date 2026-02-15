
import { GoogleGenAI, Type, Modality } from "@google/genai";
import type { Scene, CharacterReference, AllCharactersInfo } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// A scene that has narration and duration, but needs visual description and image
type SceneWithoutVisuals = Omit<Scene, 'imageUrl' | 'visualDescription' | 'isRegenerating'> & { visualDescription: string };

/**
 * Splits a script into scenes using an AI model to create semantic groupings based on the target pacing.
 * @param script The full script text.
 * @param targetWordCount The approximate target word count per scene.
 * @returns A promise that resolves to an array of scenes.
 */
async function splitScriptIntoScenesWithAI(script: string, targetWordCount: number): Promise<SceneWithoutVisuals[]> {
    const WPM = 150; // Words Per Minute for duration calculation

    // Define rules based on pacing
    let rulesText = "";
    if (targetWordCount <= 25) {
        // Fast Pacing (Shorts/TikTok)
        rulesText = `
        1. **RITMO FRENÉTICO (SHORTS):** O objetivo são cenas muito curtas e rápidas.
        2. **DIVISÃO GRANULAR:** Divida quase toda sentença em uma nova cena.
        3. **AGRUPAMENTO PROIBIDO:** Evite agrupar sentenças, a menos que sejam fragmentos muito pequenos (menos de 5 palavras).
        `;
    } else if (targetWordCount >= 50) {
        // Slow Pacing (Documentary)
        rulesText = `
        1. **RITMO DOCUMENTÁRIO (CALMO):** O objetivo são cenas longas e contemplativas.
        2. **BLOCO NARRATIVO:** Agrupe várias sentenças que formem um pensamento completo ou um parágrafo narrativo.
        3. **EXTENSÃO:** Cada cena deve ter cerca de ${targetWordCount} palavras. Não quebre o texto em frases soltas.
        `;
    } else {
        // Standard Pacing
        rulesText = `
        1. **RITMO PADRÃO (YOUTUBE):** O objetivo é um equilíbrio entre dinamismo e compreensão.
        2. **AGRUPAMENTO LÓGICO:** Agrupe 2 ou 3 sentenças curtas que compartilhem o mesmo tópico visual.
        3. **EXTENSÃO:** Tente manter as cenas com cerca de ${targetWordCount} palavras.
        `;
    }

    const prompt = `
        Você é um editor de roteiro de vídeo experiente. Sua tarefa é dividir o roteiro a seguir em múltiplas cenas para um storyboard de vídeo, seguindo estritamente o ritmo solicitado.

        REGRAS DE RITMO SELECIONADO:
        ${rulesText}

        REGRA ABSOLUTA:
        - **NÃO RESUMA OU ALTERE O TEXTO:** Use o texto original do roteiro exatamente como está. Apenas corte e agrupe.

        Saída JSON Esperada:
        {
          "scenes": [
            "Texto da cena 1...",
            "Texto da cena 2..."
          ]
        }

        Agora, aplique essa lógica ao roteiro a seguir. Retorne APENAS o objeto JSON.
        ---
        ${script}
        ---
    `;
    
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        scenes: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.STRING,
                                description: "A narração para uma única cena.",
                            },
                        },
                    },
                    required: ["scenes"],
                },
            },
        });

        const jsonStr = response.text.trim();
        const result = JSON.parse(jsonStr);
        const narrations: string[] = result.scenes || [];

        if (!narrations || narrations.length === 0) {
            throw new Error("A IA não conseguiu dividir o roteiro em cenas. Tente ajustar o texto.");
        }
        
        return narrations.map((narration, index) => {
            const wordCount = narration.trim().split(/\s+/).filter(Boolean).length;
            const durationSeconds = Math.max(1, Math.round(wordCount / (WPM / 60)));
            return {
                sceneNumber: index + 1,
                narration,
                duration: `${durationSeconds} segundo${durationSeconds > 1 ? 's' : ''}`,
                durationSeconds,
                visualDescription: '', // Placeholder
            };
        });
    } catch (error) {
        console.error("Erro ao dividir roteiro com IA:", error);
        throw new Error("Falha ao processar o roteiro com a IA. Verifique o console para mais detalhes.");
    }
}


function parseSrtTimestamp(timestamp: string): number {
  // 00:00:01,600
  const parts = timestamp.split(/[:,]/);
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  const seconds = parseInt(parts[2], 10);
  const milliseconds = parseInt(parts[3], 10);
  return (hours * 3600) + (minutes * 60) + seconds + (milliseconds / 1000);
}

/**
 * Parses SRT file content and groups lines into larger, more coherent scenes based on max words.
 * @param srtContent The full content of the .srt file.
 * @param maxWordsPerScene The target maximum words per scene for grouping.
 * @returns An array of scenes.
 */
function parseAndGroupSrt(srtContent: string, maxWordsPerScene: number): SceneWithoutVisuals[] {
    const MAX_PAUSE_SECONDS = 1.5;

    // First, parse the SRT into individual timed lines
    const timedLines: { startTime: number; endTime: number; text: string }[] = [];
    const blocks = srtContent.trim().replace(/\r\n/g, '\n').split(/\n\n+/);

    blocks.forEach((block) => {
        const lines = block.trim().split('\n');
        if (lines.length < 2) return;

        const timeMatch = lines[1]?.match(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/);
        if (!timeMatch) return;
        
        const text = lines.slice(2).join(' ').trim().replace(/<[^>]*>?/gm, ''); // Remove HTML tags
        if (!text) return;

        const startTime = parseSrtTimestamp(timeMatch[1]);
        const endTime = parseSrtTimestamp(timeMatch[2]);
        timedLines.push({ startTime, endTime, text });
    });

    if (timedLines.length === 0) {
        return [];
    }
    
    // Intermediate grouping to define the content and time boundaries of each scene
    interface SceneGroup {
        narration: string;
        startTime: number;
        endTime: number;
    }
    const sceneGroups: SceneGroup[] = [];
    if (timedLines.length === 0) return [];

    let currentSceneNarration = timedLines[0].text;
    let currentSceneStartTime = timedLines[0].startTime;
    let lastLineEndTime = timedLines[0].endTime;

    for (let i = 1; i < timedLines.length; i++) {
        const line = timedLines[i];
        const wordCountSoFar = currentSceneNarration.split(/\s+/).filter(Boolean).length;
        const newWordsCount = line.text.split(/\s+/).filter(Boolean).length;
        const pauseSinceLastLine = line.startTime - lastLineEndTime;

        // Start a new scene if: 1. There's a long pause, OR 2. The scene is getting too long in words based on pacing.
        if (pauseSinceLastLine > MAX_PAUSE_SECONDS || (wordCountSoFar + newWordsCount) > maxWordsPerScene) {
            // Finalize the previous scene group
            sceneGroups.push({
                narration: currentSceneNarration,
                startTime: currentSceneStartTime,
                endTime: lastLineEndTime,
            });

            // Start a new scene group
            currentSceneNarration = line.text;
            currentSceneStartTime = line.startTime;
        } else {
            // Merge into the current scene
            currentSceneNarration += ' ' + line.text;
        }
        
        lastLineEndTime = line.endTime;
    }

    // Add the very last scene group
    sceneGroups.push({
        narration: currentSceneNarration,
        startTime: currentSceneStartTime,
        endTime: lastLineEndTime,
    });
    
    // Calculate final durations based on the start times of subsequent scenes
    // This preserves the original timing, including pauses.
    return sceneGroups.map((group, index) => {
        let durationSeconds: number;

        if (index < sceneGroups.length - 1) {
            // A scene's duration is the time from its start until the next scene begins.
            durationSeconds = sceneGroups[index + 1].startTime - group.startTime;
        } else {
            // The last scene's duration is its own content length.
            durationSeconds = group.endTime - group.startTime;
        }
        
        // The duration for video generation must be precise (fractional).
        // Set a minimum duration to avoid issues, e.g., 0.1 seconds.
        const preciseDurationSeconds = Math.max(0.1, durationSeconds);

        // The duration for display can be rounded for readability.
        const displayDurationSeconds = Math.max(1, Math.round(durationSeconds));

        return {
            sceneNumber: index + 1,
            narration: group.narration,
            duration: `${displayDurationSeconds} segundo${displayDurationSeconds > 1 ? 's' : ''}`, // For UI Display
            durationSeconds: preciseDurationSeconds, // For Video Rendering
            visualDescription: '', // Placeholder
        };
    });
}

/**
 * Generates a detailed, cinematic visual description for a scene's narration.
 * @param narration The narration of the scene.
 * @param allCharactersInfo A list of all defined characters and their characteristics.
 * @returns A promise that resolves to the visual description string.
 */
async function generateVisualDescriptionForScene(
  narration: string,
  allCharactersInfo: AllCharactersInfo
): Promise<string> {
  
  const characterContext = allCharactersInfo
    .map(c => `- ${c.name}${c.characteristic ? `: ${c.characteristic}` : ''}`)
    .join('\n');
    
  const charactersInScene = allCharactersInfo.filter(c => 
    new RegExp(`\\b${c.name}\\b`, 'i').test(narration) && c.characteristic
  );

  const specificInstructions = charactersInScene
    .map(c => `Ao descrever ${c.name}, é CRUCIAL que você incorpore a seguinte característica: "${c.characteristic}".`)
    .join(' ');


  const prompt = `
    Você é um especialista em descrição visual para inteligência artificial. Sua tarefa é criar uma descrição visual **objetiva e detalhada** para uma cena de storyboard, baseada na narração fornecida. A descrição deve ser rica em detalhes visuais concretos e evitar termos subjetivos ou abstratos.

    Personagens Definidos e suas Características:
    ${characterContext || 'Nenhum'}

    REGRAS:
    1.  **Foco Visual Objetivo:** Descreva o que é **visível** na cena. Inclua detalhes sobre: 
        *   **Enquadramento:** (ex: close-up no rosto de [PERSONAGEM], plano médio de [PERSONAGEM] e [OBJETO], plano geral de [CENÁRIO]).
        *   **Iluminação:** (ex: luz suave do amanhecer, sombras longas do pôr do sol, iluminação dramática vinda de uma única fonte, luz ambiente de escritório).
        *   **Cores:** (ex: tons quentes e vibrantes, paleta de cores frias e metálicas, cores pastel e suaves).
        *   **Ação/Expressão:** (ex: [PERSONAGEM] sorri calorosamente, [PERSONAGEM] olha para [OBJETO] com curiosidade, [PERSONAGEM] caminha rapidamente, uma folha cai lentamente).
        *   **Cenário/Ambiente:** (ex: floresta densa com árvores altas, escritório moderno com janelas grandes, rua movimentada da cidade à noite).
    2.  **Evite Subjetividade:** **NÃO** use palavras como "épico", "dramático", "palpável", "emocionante", "impactante" ou similares. Foque em descrever os **elementos visuais que criam** essas sensações, em vez de nomeá-las.
    3.  **Consistência de Personagens:** Se um personagem definido for mencionado ou inferido na narração, use seu nome EXATO (Ex: "${allCharactersInfo.length > 0 ? allCharactersInfo[0].name : 'PERSONAGEM'}"). Se o personagem tiver uma característica definida, certifique-se de que a descrição a inclua.
    4.  **Extensão:** A descrição deve ter entre 40 e 70 palavras.
    5.  **Formato:** Responda APENAS com a descrição visual, sem incluir a narração original ou qualquer outro texto introdutório.
    
    ${specificInstructions ? `REGRAS ADICIONAIS IMPORTANTES:\n${specificInstructions}` : ''}

    Narração da Cena para Inspirar a Descrição Visual:
    ---
    "${narration}"
    ---
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });
    return response.text.trim();
  } catch (error) {
    console.error("Erro ao gerar descrição visual:", error);
    // Return a fallback description to allow image generation to proceed
    return `Uma cena cinematográfica mostrando: ${narration}`;
  }
}


async function generateImageForScene(
  visualDescription: string,
  characterReferences: CharacterReference[],
  allCharactersInfo: AllCharactersInfo,
  imageStyle: string,
  restrictionPrompt: string
): Promise<string> {

  // Characters with reference images that are mentioned in the description
  const relevantCharacters = characterReferences.filter(char => 
    new RegExp(`\\b${char.name}\\b`, 'i').test(visualDescription)
  );

  // Instructions for any character (with or without ref image) that has a characteristic
  // Note: Using 'as any' for context because CharacterReference types might be outdated in some environments
  // but the user's InputForm captures it.
  const allCharsInDescriptionWithTraits = allCharactersInfo.filter(char =>
    (char.characteristic || (char as any).context) && new RegExp(`\\b${char.name}\\b`, 'i').test(visualDescription)
  );

  const characteristicsInstruction = allCharsInDescriptionWithTraits
    .map(char => {
        let text = `Para o personagem ${char.name}:`;
        if (char.characteristic) text += ` característica física obrigatória: "${char.characteristic}".`;
        if ((char as any).context) text += ` papel/contexto: "${(char as any).context}".`;
        return text;
    })
    .join(' ');
  
  const restrictionText = restrictionPrompt.trim() ? ` REGRAS NEGATIVAS/RESTRIÇÕES: ${restrictionPrompt.trim()}` : '';
  
  // Base Style Prompt constructed for all scenarios
  const basePrompt = `ESTILO: ${imageStyle}. CENA: ${visualDescription}. DETALHES: ${characteristicsInstruction}${restrictionText}`;


  if (relevantCharacters.length === 0) {
     // If no defined characters WITH REFERENCE IMAGES are in the scene, use Imagen 3
    const response = await ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: `Cinematic, high quality. ${basePrompt}`,
        config: {
          numberOfImages: 1,
          outputMimeType: 'image/jpeg',
          aspectRatio: '16:9',
        },
    });
    if (response.generatedImages && response.generatedImages.length > 0) {
      return `data:image/jpeg;base64,${response.generatedImages[0].image.imageBytes}`;
    }
    throw new Error("A geração de imagem padrão falhou.");
  }

  // If there are characters WITH REFERENCE IMAGES, use Gemini 2.5 Flash Image with instructions to avoid pose rigidity.
  const imageParts = relevantCharacters.map(char => ({
      inlineData: {
          data: char.base64Image,
          mimeType: char.mimeType,
      },
  }));

  // Stronger instructions to break "reference overfitting" (copying the pose/framing of the ref image)
  const characterInstruction = relevantCharacters
    .map(c => `
    [REFERÊNCIA DE IDENTIDADE: ${c.name}]
    - Use esta imagem APENAS como referência para: Rosto, Cabelo, Roupas e Identidade.
    - IGNORE COMPLETAMENTE: A pose, o fundo, a iluminação e o ângulo da câmera desta imagem de referência.
    - O personagem deve ser adaptado para a nova cena, assumindo a pose e a ação descritas.
    ${c.characteristic ? `- Detalhe Visual: "${c.characteristic}"` : ''}
    ${(c as any).context ? `- Contexto: "${(c as any).context}"` : ''}
    `).join('\n');

  const textPrompt = `
    TAREFA: Gere uma nova imagem cinematográfica (Proporção 16:9).
    
    1. DESCRIÇÃO DA CENA (PRIORIDADE MÁXIMA PARA COMPOSIÇÃO E AÇÃO):
    "${visualDescription}"
    
    2. INSTRUÇÕES DE PERSONAGEM (MANTENHA IDENTIDADE, MUDE A POSE):
    ${characterInstruction}
    
    3. ESTILO E REGRAS:
    - Estilo Visual: ${imageStyle}
    - NÃO copie a composição estática das imagens de referência. Crie uma composição nova baseada na Descrição da Cena.
    - Integre os personagens no ambiente de forma natural.
    ${restrictionText}
  `;
    
  const parts = [...imageParts, { text: textPrompt }];
    
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts },
      config: {
          responseModalities: [Modality.IMAGE, Modality.TEXT],
      },
    });

    const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (imagePart && imagePart.inlineData) {
      return `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
    } else {
        const textPart = response.candidates?.[0]?.content?.parts?.find(p => p.text);
        const reason = textPart?.text ? `Resposta do modelo: "${textPart.text}"` : "O modelo não retornou uma imagem.";
        
        console.error("Falha na geração com referência:", {
            reason: reason,
            prompt: textPrompt,
        });

        throw new Error(`A geração da imagem falhou. ${reason}`);
    }
  } catch (error) {
      console.error("Erro ao gerar imagem com referência:", error);
      throw error;
  }
}

export async function regenerateSceneImage(
    visualDescription: string,
    characterReferences: CharacterReference[],
    allCharactersInfo: AllCharactersInfo,
    imageStyle: string,
    restrictionPrompt: string
): Promise<string> {
    await sleep(1000); // Small delay to prevent rapid-fire requests
    return generateImageForScene(visualDescription, characterReferences, allCharactersInfo, imageStyle, restrictionPrompt);
}


export async function generateStoryboard(
  characterReferences: CharacterReference[],
  allCharactersInfo: AllCharactersInfo,
  scriptOrSrtContent: string,
  isSrt: boolean,
  imageStyle: string,
  restrictionPrompt: string,
  onProgress: (message: string) => void,
  delayBetweenScenes: number = 30000,
  pacing: number = 35 // Novo parâmetro, padrão 35
): Promise<Scene[]> {

  let scenesWithoutVisuals: SceneWithoutVisuals[];
  if (isSrt) {
    onProgress("Processando e agrupando cenas do arquivo .SRT com ritmo ajustado...");
    // Passa o pacing como limite de palavras para o SRT
    scenesWithoutVisuals = parseAndGroupSrt(scriptOrSrtContent, pacing);
  } else {
    onProgress("Analisando e dividindo o roteiro com IA usando o ritmo selecionado...");
    // Passa o pacing para a IA definir o tamanho das cenas
    scenesWithoutVisuals = await splitScriptIntoScenesWithAI(scriptOrSrtContent, pacing);
  }

  if (scenesWithoutVisuals.length === 0) {
    const errorMessage = isSrt
      ? "Nenhuma cena válida foi encontrada no arquivo .SRT. Verifique o formato do arquivo."
      : "Nenhuma cena foi identificada no roteiro. A IA pode não ter conseguido processar o texto.";
    throw new Error(errorMessage);
  }

  const completeScenes: Scene[] = [];
  const totalScenes = scenesWithoutVisuals.length;

  for (let i = 0; i < totalScenes; i++) {
    const scene = scenesWithoutVisuals[i];
    
    // Step 1: Generate Visual Description for the current scene
    onProgress(`Criando descrição para a cena ${i + 1} de ${totalScenes}...`);
    const visualDescription = await generateVisualDescriptionForScene(scene.narration, allCharactersInfo);
    
    // Step 2: Generate Image using the new description
    onProgress(`Gerando imagem para a cena ${i + 1} de ${totalScenes}...`);
    
    try {
        const imageUrl = await generateImageForScene(visualDescription, characterReferences, allCharactersInfo, imageStyle, restrictionPrompt);
        completeScenes.push({ ...scene, visualDescription, imageUrl });
    } catch (error) {
        console.error(`Falha ao gerar imagem para a cena ${scene.sceneNumber}. A operação continuará com uma imagem de placeholder.`, error);
        
        // Use a placeholder SVG image to indicate the failure for this specific scene
        const placeholderImageUrl = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 112.5'%3E%3Crect width='200' height='112.5' fill='%231f2937'/%3E%3Ctext x='100' y='50' text-anchor='middle' font-family='sans-serif' font-size='10' fill='%23fca5a5'%3EFalha ao gerar a imagem%3C/text%3E%3Ctext x='100' y='65' text-anchor='middle' font-family='sans-serif' font-size='6' fill='%239ca3af'%3EVerifique o console para detalhes.%3C/text%3E%3C/svg%3E";
        
        completeScenes.push({ ...scene, visualDescription, imageUrl: placeholderImageUrl });
    }

    // Rate limiting logic to respect API quota
    if (i < totalScenes - 1) {
      const waitTimeSec = Math.round(delayBetweenScenes / 1000);
      onProgress(`Cena ${i + 1} concluída. Pausando por ${waitTimeSec}s para não exceder a cota da API...`);
      await sleep(delayBetweenScenes);
    }
  }

  onProgress("Storyboard completo!");
  return completeScenes;
}
