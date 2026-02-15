
import React from 'react';

export function Header() {
  return (
    <header className="bg-gray-800 shadow-lg">
      <div className="container mx-auto px-4 py-6 text-center">
        <h1 className="text-3xl md:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-500">
          🎬 Divisor de Roteiro em Cenas
        </h1>
        <p className="mt-2 text-gray-400">
          Transforme seu roteiro em um storyboard visual com a ajuda da IA.
        </p>
      </div>
    </header>
  );
}
