import React from 'react';

interface ImageStyleSelectorProps {
  selectedStyle: string;
  onStyleChange: (style: string) => void;
  isDisabled: boolean;
}

const styles = [
  // REALISTA E CINEMATOGRÁFICO
  {
    name: 'Filme Realista',
    group: 'REALISTA E CINEMATOGRÁFICO',
    imageUrl: new URL('../../assets/Filme-Cinematográfico.webp', import.meta.url).href,
  },
  {
    name: 'Fotografia',
    group: 'REALISTA E CINEMATOGRÁFICO',
    imageUrl: new URL('../../assets/Fotografia.webp', import.meta.url).href,
  },
  {
    name: 'Modern Realism',
    group: 'REALISTA E CINEMATOGRÁFICO',
    imageUrl: new URL('../../assets/Realismo-Moderno.webp', import.meta.url).href,
  },
  {
    name: 'Close-up',
    group: 'REALISTA E CINEMATOGRÁFICO',
    imageUrl: new URL('../../assets/Close-up.webp', import.meta.url).href,
  },
  {
    name: 'Portrait',
    group: 'REALISTA E CINEMATOGRÁFICO',
    imageUrl: new URL('../../assets/Portrait.webp', import.meta.url).href,
  },

  // ARTÍSTICO E ILUSTRATIVO
  {
    name: 'Desenho Animado',
    group: 'ARTÍSTICO E ILUSTRATIVO',
    imageUrl: new URL('../../assets/Desenho-Animado.webp', import.meta.url).href,
  },
  {
    name: 'Toon Shader',
    group: 'ARTÍSTICO E ILUSTRATIVO',
    imageUrl: new URL('../../assets/Toon-Shader.webp', import.meta.url).href,
  },
  {
    name: 'Anime',
    group: 'ARTÍSTICO E ILUSTRATIVO',
    imageUrl: new URL('../../assets/Anime.webp', import.meta.url).href,
  },
  {
    name: 'Quadrinhos dos EUA',
    group: 'ARTÍSTICO E ILUSTRATIVO',
    imageUrl: new URL('../../assets/Quadrinhos-dos-EUA.webp', import.meta.url).href,
  },
  {
    name: 'Noir Comic',
    group: 'ARTÍSTICO E ILUSTRATIVO',
    imageUrl: new URL('../../assets/Noir-Comic.webp', import.meta.url).href,
  },
  {
    name: 'Ink Watercolor',
    group: 'ARTÍSTICO E ILUSTRATIVO',
    imageUrl: new URL('../../assets/Aquarela-Watercolor.webp', import.meta.url).href,
  },
  {
    name: 'Pintura a Óleo',
    group: 'ARTÍSTICO E ILUSTRATIVO',
    imageUrl: new URL('../../assets/Pintura-a-Óleo.webp', import.meta.url).href,
  },

  // TEMÁTICO E ATMOSFÉRICO
  {
    name: 'CyberPunk',
    group: 'TEMÁTICO E ATMOSFÉRICO',
    imageUrl: new URL('../../assets/Cyberpunk.webp', import.meta.url).href,
  },
  {
    name: 'Terror',
    group: 'TEMÁTICO E ATMOSFÉRICO',
    imageUrl: new URL('../../assets/Terror.webp', import.meta.url).href,
  },
  {
    name: 'Foto Assustadora',
    group: 'TEMÁTICO E ATMOSFÉRICO',
    imageUrl: new URL('../../assets/Foto-Assustadora.webp', import.meta.url).href,
  },
  {
    name: 'Bíblico',
    group: 'TEMÁTICO E ATMOSFÉRICO',
    imageUrl: new URL('../../assets/Bíblico.webp', import.meta.url).href,
  },
  {
    name: 'Jurássico',
    group: 'TEMÁTICO E ATMOSFÉRICO',
    imageUrl: new URL('../../assets/Jurássico.webp', import.meta.url).href,
  },
  {
    name: 'Pré-histórico',
    group: 'TEMÁTICO E ATMOSFÉRICO',
    imageUrl: new URL('../../assets/Pré-histórico.webp', import.meta.url).href,
  },
];

const groupedStyles = styles.reduce((acc, style) => {
    if (!acc[style.group]) {
        acc[style.group] = [];
    }
    acc[style.group].push(style);
    return acc;
}, {} as Record<string, typeof styles>);

export function ImageStyleSelector({ selectedStyle, onStyleChange, isDisabled }: ImageStyleSelectorProps) {
    return (
        <div className={`bg-gray-900/50 p-4 rounded-lg border border-gray-700 space-y-4 ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
            {Object.entries(groupedStyles).map(([group, options]) => (
                <div key={group}>
                    <h3 className="text-md font-semibold text-gray-400 mb-3">{group}</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {options.map(option => {
                            const isSelected = selectedStyle === option.name;
                            return (
                                <button
                                    key={option.name}
                                    type="button"
                                    onClick={() => !isDisabled && onStyleChange(option.name)}
                                    disabled={isDisabled}
                                    className={`relative rounded-lg overflow-hidden border-2 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-indigo-500 ${isSelected ? 'border-indigo-500' : 'border-gray-600 hover:border-gray-500'}`}
                                    aria-pressed={isSelected}
                                >
                                    <img
                                      src={option.imageUrl}
                                      alt={option.name}
                                      loading="lazy"
                                      decoding="async"
                                      className="w-full h-full object-cover aspect-video"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent"></div>
                                    <p className="absolute bottom-1 left-2 right-2 text-xs font-semibold text-white text-center truncate">{option.name}</p>
                                    {isSelected && (
                                        <div className="absolute top-1 right-1 bg-indigo-500 rounded-full h-5 w-5 flex items-center justify-center">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                            </svg>
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}
