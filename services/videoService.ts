
import type { Scene } from '../types';

const FRAME_RATE = 30;

// Helper to load an image
const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
};

// Ken Burns effect logic
const getKenBurnsTransforms = (imgWidth: number, imgHeight: number, canvasWidth: number, canvasHeight: number) => {
    const imgAspect = imgWidth / imgHeight;
    const canvasAspect = canvasWidth / canvasHeight;

    const initialScale = (imgAspect > canvasAspect) ? canvasHeight / imgHeight : canvasWidth / imgWidth;
    
    const zoomIn = Math.random() > 0.5;
    const startScale = zoomIn ? initialScale : initialScale * 1.2;
    const endScale = zoomIn ? initialScale * 1.2 : initialScale;

    const panX = Math.random() - 0.5;
    const panY = Math.random() - 0.5;

    const getMaxOffset = (scaledSize: number, canvasSize: number) => Math.max(0, (scaledSize - canvasSize) / 2);
    
    const startW = imgWidth * startScale;
    const startH = imgHeight * startScale;
    const maxOffsetXStart = getMaxOffset(startW, canvasWidth);
    const maxOffsetYStart = getMaxOffset(startH, canvasHeight);
    const startX = maxOffsetXStart + panX * maxOffsetXStart;
    const startY = maxOffsetYStart + panY * maxOffsetYStart;

    const endW = imgWidth * endScale;
    const endH = imgHeight * endScale;
    const maxOffsetXEnd = getMaxOffset(endW, canvasWidth);
    const maxOffsetYEnd = getMaxOffset(endH, canvasHeight);
    const endX = maxOffsetXEnd - panX * maxOffsetXEnd;
    const endY = maxOffsetYEnd - panY * maxOffsetYEnd;

    return {
        source: { sx: 0, sy: 0, sWidth: imgWidth, sHeight: imgHeight },
        dest: {
            start: { dx: -startX, dy: -startY, dWidth: startW, dHeight: startH },
            end: { dx: -endX, dy: -endY, dWidth: endW, dHeight: endH }
        }
    };
};

export const generateVideoFromScenes = (
  scenes: Scene[],
  audioUrl: string | null,
  resolution: '720p' | '1080p',
  onProgress: (progress: number, message: string) => void
): Promise<{ url: string; filename: string }> => {
    return new Promise(async (resolve, reject) => {
        const width = resolution === '1080p' ? 1920 : 1280;
        const height = resolution === '1080p' ? 1080 : 720;

        onProgress(0, 'Iniciando a renderização do vídeo...');

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { alpha: false }); // Performance optimization
        if (!ctx) {
            return reject(new Error('Não foi possível obter o contexto 2D do canvas.'));
        }
        
        const PREFERRED_MIME_TYPE = 'video/mp4; codecs="avc1.42E01E"';
        const FALLBACK_MIME_TYPE = 'video/webm; codecs=vp9';
        const selectedMimeType = MediaRecorder.isTypeSupported(PREFERRED_MIME_TYPE)
          ? PREFERRED_MIME_TYPE
          : FALLBACK_MIME_TYPE;
        const extension = selectedMimeType.startsWith('video/mp4') ? 'mp4' : 'webm';

        const canvasStream = canvas.captureStream(FRAME_RATE);
        
        let finalStream: MediaStream;
        let totalDuration = scenes.reduce((sum, s) => sum + s.durationSeconds, 0);
        let scaledScenes = [...scenes];
        let audioSourceNode: AudioBufferSourceNode | null = null;
        let audioContext: AudioContext | null = null;
        let renderInterval: number | null = null;

        if (audioUrl) {
            try {
                onProgress(5, 'Processando e sincronizando áudio...');
                audioContext = new AudioContext();
                const response = await fetch(audioUrl);
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

                totalDuration = audioBuffer.duration;
                
                const totalSrtDuration = scenes.reduce((sum, s) => sum + s.durationSeconds, 0);
                if (totalSrtDuration > 0.1) {
                    const scaleFactor = totalDuration / totalSrtDuration;
                    scaledScenes = scenes.map(scene => ({
                        ...scene,
                        durationSeconds: scene.durationSeconds * scaleFactor
                    }));

                    const sumOfScaledDurations = scaledScenes.reduce((sum, s) => sum + s.durationSeconds, 0);
                    const diff = totalDuration - sumOfScaledDurations;
                    if (scaledScenes.length > 0 && Math.abs(diff) > 0.001) {
                        scaledScenes[scaledScenes.length - 1].durationSeconds += diff;
                    }
                }
                
                const destination = audioContext.createMediaStreamDestination();
                audioSourceNode = audioContext.createBufferSource();
                audioSourceNode.buffer = audioBuffer;
                audioSourceNode.connect(destination);

                finalStream = new MediaStream([...canvasStream.getTracks(), ...destination.stream.getTracks()]);
            } catch(e) {
                console.error("Erro ao processar o áudio:", e);
                audioContext?.close().catch(console.error);
                return reject(new Error("Falha ao processar o arquivo de áudio. Verifique se o arquivo não está corrompido."));
            }
        } else {
            finalStream = canvasStream;
        }

        if (totalDuration <= 0) {
            return reject(new Error("A duração do vídeo é zero. Não é possível gerar um clipe."));
        }

        const recorder = new MediaRecorder(finalStream, { mimeType: selectedMimeType, videoBitsPerSecond: resolution === '1080p' ? 8000000 : 5000000 });
        const videoChunks: Blob[] = [];

        const cleanup = () => {
            if (renderInterval) clearInterval(renderInterval);
            renderInterval = null;
            audioSourceNode?.stop();
            audioSourceNode?.disconnect();
            audioContext?.close().catch(console.error);
        };
        
        recorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                videoChunks.push(event.data);
            }
        };

        recorder.onstop = () => {
            cleanup();
            if (videoChunks.length === 0) {
                return reject(new Error('A gravação do vídeo falhou, nenhum dado foi capturado. Verifique a duração do seu roteiro/áudio.'));
            }
            const videoBlob = new Blob(videoChunks, { type: selectedMimeType });
            const finalVideoUrl = URL.createObjectURL(videoBlob);
            const filename = `storyboard_${resolution}.${extension}`;
            onProgress(100, 'Vídeo renderizado com sucesso!');
            resolve({ url: finalVideoUrl, filename });
        };

        recorder.onerror = (event) => {
            cleanup();
            console.error("MediaRecorder error:", event);
            reject(new Error('Ocorreu um erro durante a gravação do vídeo.'));
        };
        
        try {
            onProgress(10, 'Carregando imagens em alta resolução...');
            const images = await Promise.all(scaledScenes.map(scene => loadImage(scene.imageUrl)));
            const transforms = images.map(img => getKenBurnsTransforms(img.width, img.height, width, height));

            const sceneStartTimes: number[] = [0];
            for (let i = 0; i < scaledScenes.length - 1; i++) {
                sceneStartTimes.push(sceneStartTimes[i] + scaledScenes[i].durationSeconds);
            }
            
            recorder.start();
            audioSourceNode?.start(0);

            const startTime = performance.now();
            let currentSceneIndex = 0;
            let lastReportedProgress = -1;
            
            renderInterval = window.setInterval(() => {
                const currentTime = (performance.now() - startTime) / 1000;
                
                if (currentTime >= totalDuration) {
                    if (recorder.state === 'recording') {
                        recorder.stop();
                    }
                    return;
                }

                while (currentSceneIndex < scaledScenes.length - 1 && currentTime >= sceneStartTimes[currentSceneIndex + 1]) {
                    currentSceneIndex++;
                }

                const scene = scaledScenes[currentSceneIndex];
                const img = images[currentSceneIndex];
                const transform = transforms[currentSceneIndex];
                const sceneStartTime = sceneStartTimes[currentSceneIndex];
                
                const timeInScene = currentTime - sceneStartTime;
                const progress = scene.durationSeconds > 0.001 ? Math.min(1, timeInScene / scene.durationSeconds) : 1;

                const dx = transform.dest.start.dx + (transform.dest.end.dx - transform.dest.start.dx) * progress;
                const dy = transform.dest.start.dy + (transform.dest.end.dy - transform.dest.start.dy) * progress;
                const dWidth = transform.dest.start.dWidth + (transform.dest.end.dWidth - transform.dest.start.dWidth) * progress;
                const dHeight = transform.dest.start.dHeight + (transform.dest.end.dHeight - transform.dest.start.dHeight) * progress;

                ctx.fillStyle = 'black';
                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(
                    img, 
                    transform.source.sx, transform.source.sy, 
                    transform.source.sWidth, transform.source.sHeight,
                    dx, dy, dWidth, dHeight
                );
                
                // Calculate progress from 10% to 95% (leaving room for start and end)
                const renderPercent = (currentTime / totalDuration);
                const visualProgress = 10 + Math.floor(renderPercent * 85);

                if (visualProgress > lastReportedProgress) {
                    onProgress(visualProgress, `Renderizando cena ${currentSceneIndex + 1}/${scaledScenes.length}...`);
                    lastReportedProgress = visualProgress;
                }

            }, 1000 / FRAME_RATE);

        } catch (error) {
            if (recorder.state === 'recording') {
                recorder.stop();
            } else {
                cleanup();
            }
            console.error("Erro durante a geração do vídeo:", error);
            reject(error);
        }
    });
};
