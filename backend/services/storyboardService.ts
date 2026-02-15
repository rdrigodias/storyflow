import { GoogleGenAI, Modality, Type } from '@google/genai';

export interface Scene {
  sceneNumber: number;
  narration: string;
  duration: string;
  durationSeconds: number;
  visualDescription: string;
  imageUrl: string;
}

export interface CharacterReference {
  name: string;
  base64Image: string;
  mimeType: string;
  characteristic?: string;
  context?: string;
}

export type AllCharactersInfo = Array<{
  name: string;
  characteristic?: string;
  context?: string;
}>;

type SceneWithoutVisuals = Omit<Scene, 'imageUrl' | 'visualDescription'> & {
  visualDescription: string;
};

const PLACEHOLDER_IMAGE_URL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 112.5'%3E%3Crect width='200' height='112.5' fill='%231f2937'/%3E%3Ctext x='100' y='50' text-anchor='middle' font-family='sans-serif' font-size='10' fill='%23fca5a5'%3EFalha ao gerar a imagem%3C/text%3E%3Ctext x='100' y='65' text-anchor='middle' font-family='sans-serif' font-size='6' fill='%239ca3af'%3EVerifique o console para detalhes.%3C/text%3E%3C/svg%3E";
const MOCK_IMAGE_URL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 112.5'%3E%3Crect width='200' height='112.5' fill='%230a3b8c'/%3E%3Ctext x='100' y='58' text-anchor='middle' font-family='sans-serif' font-size='10' fill='%23dbeafe'%3EMock Scene%3C/text%3E%3C/svg%3E";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getAiClient = (apiKey: string) => {
  if (!apiKey) {
    throw new Error('API Key não configurada para o usuário.');
  }
  return new GoogleGenAI({ apiKey });
};

function parseSrtTimestamp(timestamp: string): number {
  const parts = timestamp.split(/[:,]/);
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  const seconds = parseInt(parts[2], 10);
  const milliseconds = parseInt(parts[3], 10);
  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}

function parseAndGroupSrt(srtContent: string, maxWordsPerScene: number): SceneWithoutVisuals[] {
  const MAX_PAUSE_SECONDS = 1.5;
  const timedLines: { startTime: number; endTime: number; text: string }[] = [];
  const blocks = srtContent.trim().replace(/\r\n/g, '\n').split(/\n\n+/);

  blocks.forEach((block) => {
    const lines = block.trim().split('\n');
    if (lines.length < 2) return;

    const timeMatch = lines[1]?.match(
      /(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/
    );
    if (!timeMatch) return;

    const text = lines
      .slice(2)
      .join(' ')
      .trim()
      .replace(/<[^>]*>?/gm, '');
    if (!text) return;

    const startTime = parseSrtTimestamp(timeMatch[1]);
    const endTime = parseSrtTimestamp(timeMatch[2]);
    timedLines.push({ startTime, endTime, text });
  });

  if (timedLines.length === 0) return [];

  interface SceneGroup {
    narration: string;
    startTime: number;
    endTime: number;
  }

  const sceneGroups: SceneGroup[] = [];
  let currentSceneNarration = timedLines[0].text;
  let currentSceneStartTime = timedLines[0].startTime;
  let lastLineEndTime = timedLines[0].endTime;

  for (let i = 1; i < timedLines.length; i++) {
    const line = timedLines[i];
    const wordCountSoFar = currentSceneNarration.split(/\s+/).filter(Boolean).length;
    const newWordsCount = line.text.split(/\s+/).filter(Boolean).length;
    const pauseSinceLastLine = line.startTime - lastLineEndTime;

    if (pauseSinceLastLine > MAX_PAUSE_SECONDS || wordCountSoFar + newWordsCount > maxWordsPerScene) {
      sceneGroups.push({
        narration: currentSceneNarration,
        startTime: currentSceneStartTime,
        endTime: lastLineEndTime,
      });

      currentSceneNarration = line.text;
      currentSceneStartTime = line.startTime;
    } else {
      currentSceneNarration += ` ${line.text}`;
    }

    lastLineEndTime = line.endTime;
  }

  sceneGroups.push({
    narration: currentSceneNarration,
    startTime: currentSceneStartTime,
    endTime: lastLineEndTime,
  });

  return sceneGroups.map((group, index) => {
    let durationSeconds: number;

    if (index < sceneGroups.length - 1) {
      durationSeconds = sceneGroups[index + 1].startTime - group.startTime;
    } else {
      durationSeconds = group.endTime - group.startTime;
    }

    const preciseDurationSeconds = Math.max(0.1, durationSeconds);
    const displayDurationSeconds = Math.max(1, Math.round(durationSeconds));

    return {
      sceneNumber: index + 1,
      narration: group.narration,
      duration: `${displayDurationSeconds} segundo${displayDurationSeconds > 1 ? 's' : ''}`,
      durationSeconds: preciseDurationSeconds,
      visualDescription: '',
    };
  });
}

function splitScriptIntoMockScenes(script: string): SceneWithoutVisuals[] {
  const parts = script
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const narrations = parts.length ? parts.slice(0, 4) : [script.trim()].filter(Boolean);
  if (!narrations.length) return [];

  return narrations.map((narration, index) => ({
    sceneNumber: index + 1,
    narration,
    duration: '2 segundos',
    durationSeconds: 2,
    visualDescription: `Mock visual da cena ${index + 1}: ${narration.slice(0, 80)}`,
  }));
}

function buildMockScenes(args: {
  scriptOrSrtContent: string;
  isSrt: boolean;
  pacing: number;
}): Scene[] {
  const { scriptOrSrtContent, isSrt, pacing } = args;
  const sourceScenes = isSrt
    ? parseAndGroupSrt(scriptOrSrtContent, pacing)
    : splitScriptIntoMockScenes(scriptOrSrtContent);

  if (!sourceScenes.length) {
    throw new Error('Falha simulada: conteúdo vazio para geração mock.');
  }

  return sourceScenes.map((scene, index) => ({
    ...scene,
    visualDescription: scene.visualDescription || `Mock visual da cena ${index + 1}`,
    imageUrl: MOCK_IMAGE_URL,
  }));
}

async function splitScriptIntoScenesWithAI(
  script: string,
  targetWordCount: number,
  apiKey: string
): Promise<SceneWithoutVisuals[]> {
  const ai = getAiClient(apiKey);
  const WPM = 150;

  let rulesText = '';
  if (targetWordCount <= 25) {
    rulesText = `
        1. **RITMO FRENÉTICO (SHORTS):** O objetivo são cenas muito curtas e rápidas.
        2. **DIVISÃO GRANULAR:** Divida quase toda sentença em uma nova cena.
        3. **AGRUPAMENTO PROIBIDO:** Evite agrupar sentenças, a menos que sejam fragmentos muito pequenos (menos de 5 palavras).
        `;
  } else if (targetWordCount >= 50) {
    rulesText = `
        1. **RITMO DOCUMENTÁRIO (CALMO):** O objetivo são cenas longas e contemplativas.
        2. **BLOCO NARRATIVO:** Agrupe várias sentenças que formem um pensamento completo ou um parágrafo narrativo.
        3. **EXTENSÃO:** Cada cena deve ter cerca de ${targetWordCount} palavras. Não quebre o texto em frases soltas.
        `;
  } else {
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

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          scenes: {
            type: Type.ARRAY,
            items: {
              type: Type.STRING,
              description: 'A narração para uma única cena.',
            },
          },
        },
        required: ['scenes'],
      },
    },
  });

  const jsonStr = response.text?.trim();
  if (!jsonStr) {
    throw new Error('Resposta vazia ao dividir roteiro em cenas.');
  }
  const result = JSON.parse(jsonStr) as { scenes?: string[] };
  const narrations = result.scenes || [];

  if (!narrations.length) {
    throw new Error('A IA não conseguiu dividir o roteiro em cenas. Tente ajustar o texto.');
  }

  return narrations.map((narration, index) => {
    const wordCount = narration.trim().split(/\s+/).filter(Boolean).length;
    const durationSeconds = Math.max(1, Math.round(wordCount / (WPM / 60)));
    return {
      sceneNumber: index + 1,
      narration,
      duration: `${durationSeconds} segundo${durationSeconds > 1 ? 's' : ''}`,
      durationSeconds,
      visualDescription: '',
    };
  });
}

async function generateVisualDescriptionForScene(
  narration: string,
  allCharactersInfo: AllCharactersInfo,
  apiKey: string
): Promise<string> {
  const ai = getAiClient(apiKey);
  const characterContext = allCharactersInfo
    .map((c) => `- ${c.name}${c.characteristic ? `: ${c.characteristic}` : ''}`)
    .join('\n');

  const charactersInScene = allCharactersInfo.filter(
    (c) => new RegExp(`\\b${c.name}\\b`, 'i').test(narration) && c.characteristic
  );

  const specificInstructions = charactersInScene
    .map(
      (c) =>
        `Ao descrever ${c.name}, é CRUCIAL que você incorpore a seguinte característica: "${c.characteristic}".`
    )
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
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text?.trim() || `Uma cena cinematográfica mostrando: ${narration}`;
  } catch {
    return `Uma cena cinematográfica mostrando: ${narration}`;
  }
}

async function generateImageForScene(
  visualDescription: string,
  characterReferences: CharacterReference[],
  allCharactersInfo: AllCharactersInfo,
  imageStyle: string,
  restrictionPrompt: string,
  apiKey: string
): Promise<string> {
  const ai = getAiClient(apiKey);
  const relevantCharacters = characterReferences.filter((char) =>
    new RegExp(`\\b${char.name}\\b`, 'i').test(visualDescription)
  );

  const allCharsInDescriptionWithTraits = allCharactersInfo.filter(
    (char) => (char.characteristic || char.context) && new RegExp(`\\b${char.name}\\b`, 'i').test(visualDescription)
  );

  const characteristicsInstruction = allCharsInDescriptionWithTraits
    .map((char) => {
      let text = `Para o personagem ${char.name}:`;
      if (char.characteristic) text += ` característica física obrigatória: "${char.characteristic}".`;
      if (char.context) text += ` papel/contexto: "${char.context}".`;
      return text;
    })
    .join(' ');

  const restrictionText = restrictionPrompt.trim()
    ? ` REGRAS NEGATIVAS/RESTRIÇÕES: ${restrictionPrompt.trim()}`
    : '';

  const basePrompt = `ESTILO: ${imageStyle}. CENA: ${visualDescription}. DETALHES: ${characteristicsInstruction}${restrictionText}`;

  if (relevantCharacters.length === 0) {
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
      const imageBytes = response.generatedImages[0]?.image?.imageBytes;
      if (imageBytes) {
        return `data:image/jpeg;base64,${imageBytes}`;
      }
    }
    throw new Error('A geração de imagem padrão falhou.');
  }

  const imageParts = relevantCharacters.map((char) => ({
    inlineData: {
      data: char.base64Image,
      mimeType: char.mimeType,
    },
  }));

  const characterInstruction = relevantCharacters
    .map(
      (c) => `
    [REFERÊNCIA DE IDENTIDADE: ${c.name}]
    - Use esta imagem APENAS como referência para: Rosto, Cabelo, Roupas e Identidade.
    - IGNORE COMPLETAMENTE: A pose, o fundo, a iluminação e o ângulo da câmera desta imagem de referência.
    - O personagem deve ser adaptado para a nova cena, assumindo a pose e a ação descritas.
    ${c.characteristic ? `- Detalhe Visual: "${c.characteristic}"` : ''}
    ${c.context ? `- Contexto: "${c.context}"` : ''}
    `
    )
    .join('\n');

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

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: { parts },
    config: {
      responseModalities: [Modality.IMAGE, Modality.TEXT],
    },
  });

  const imagePart = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (imagePart?.inlineData) {
    return `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
  }

  const textPart = response.candidates?.[0]?.content?.parts?.find((p) => p.text);
  const reason = textPart?.text
    ? `Resposta do modelo: "${textPart.text}"`
    : 'O modelo não retornou uma imagem.';
  throw new Error(`A geração da imagem falhou. ${reason}`);
}

export async function regenerateSceneImage(args: {
  visualDescription: string;
  characterReferences: CharacterReference[];
  allCharactersInfo: AllCharactersInfo;
  imageStyle: string;
  restrictionPrompt: string;
  apiKey: string;
}): Promise<string> {
  await sleep(1000);
  return generateImageForScene(
    args.visualDescription,
    args.characterReferences,
    args.allCharactersInfo,
    args.imageStyle,
    args.restrictionPrompt,
    args.apiKey
  );
}

export async function generateStoryboard(args: {
  characterReferences: CharacterReference[];
  allCharactersInfo: AllCharactersInfo;
  scriptOrSrtContent: string;
  isSrt: boolean;
  imageStyle: string;
  restrictionPrompt: string;
  delayBetweenScenes: number;
  pacing: number;
  apiKey: string;
  onProgress?: (message: string) => void;
}): Promise<Scene[]> {
  const {
    characterReferences,
    allCharactersInfo,
    scriptOrSrtContent,
    isSrt,
    imageStyle,
    restrictionPrompt,
    delayBetweenScenes,
    pacing,
    apiKey,
    onProgress,
  } = args;

  if (process.env.STORYBOARD_MOCK_MODE === '1') {
    onProgress?.('Modo mock ativo: iniciando geração simulada...');
    await sleep(50);

    if (scriptOrSrtContent.includes('__MOCK_FAIL__')) {
      throw new Error('Falha simulada de geração (mock).');
    }

    const mockScenes = buildMockScenes({ scriptOrSrtContent, isSrt, pacing });
    for (let i = 0; i < mockScenes.length; i++) {
      onProgress?.(`Mock: cena ${i + 1} de ${mockScenes.length} concluída.`);
      await sleep(20);
    }
    onProgress?.('Storyboard mock completo!');
    return mockScenes;
  }

  let scenesWithoutVisuals: SceneWithoutVisuals[];
  if (isSrt) {
    onProgress?.('Processando e agrupando cenas do arquivo .SRT com ritmo ajustado...');
    scenesWithoutVisuals = parseAndGroupSrt(scriptOrSrtContent, pacing);
  } else {
    onProgress?.('Analisando e dividindo o roteiro com IA usando o ritmo selecionado...');
    scenesWithoutVisuals = await splitScriptIntoScenesWithAI(scriptOrSrtContent, pacing, apiKey);
  }

  if (scenesWithoutVisuals.length === 0) {
    const errorMessage = isSrt
      ? 'Nenhuma cena válida foi encontrada no arquivo .SRT. Verifique o formato do arquivo.'
      : 'Nenhuma cena foi identificada no roteiro. A IA pode não ter conseguido processar o texto.';
    throw new Error(errorMessage);
  }

  const completeScenes: Scene[] = [];
  for (let i = 0; i < scenesWithoutVisuals.length; i++) {
    const scene = scenesWithoutVisuals[i];
    onProgress?.(`Criando descrição para a cena ${i + 1} de ${scenesWithoutVisuals.length}...`);
    const visualDescription = await generateVisualDescriptionForScene(
      scene.narration,
      allCharactersInfo,
      apiKey
    );

    try {
      onProgress?.(`Gerando imagem para a cena ${i + 1} de ${scenesWithoutVisuals.length}...`);
      const imageUrl = await generateImageForScene(
        visualDescription,
        characterReferences,
        allCharactersInfo,
        imageStyle,
        restrictionPrompt,
        apiKey
      );
      completeScenes.push({ ...scene, visualDescription, imageUrl });
    } catch {
      onProgress?.(`Falha ao gerar imagem da cena ${scene.sceneNumber}. Usando placeholder.`);
      completeScenes.push({ ...scene, visualDescription, imageUrl: PLACEHOLDER_IMAGE_URL });
    }

    if (i < scenesWithoutVisuals.length - 1 && delayBetweenScenes > 0) {
      const waitTimeSec = Math.round(delayBetweenScenes / 1000);
      onProgress?.(
        `Cena ${i + 1} concluída. Pausando por ${waitTimeSec}s para não exceder a cota da API...`
      );
      await sleep(delayBetweenScenes);
    }
  }

  onProgress?.('Storyboard completo!');
  return completeScenes;
}
