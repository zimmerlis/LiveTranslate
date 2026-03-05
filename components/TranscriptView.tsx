
import React, { useEffect, useRef } from 'react';
import { TranscriptPair } from '../types';

interface TranscriptViewProps {
  title: string;
  content: string;
  history: TranscriptPair[];
  mode: 'original' | 'translated';
  accentColor: string;
  customFontSize?: number;
  customTextColor?: string;
}

const TranscriptView: React.FC<TranscriptViewProps> = ({ 
  title, 
  content, 
  history, 
  mode, 
  accentColor,
  customFontSize = 24,
  customTextColor
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [content, history]);

  const isTranslated = mode === 'translated';

  return (
    <div className="flex flex-col h-full bg-slate-800/50 rounded-2xl border border-slate-700 overflow-hidden shadow-2xl backdrop-blur-sm transition-all duration-300">
      <div className={`px-6 py-4 border-b border-slate-700 bg-slate-800/80 flex items-center justify-between`}>
        <h2 className="text-xl font-semibold text-slate-100 flex items-center gap-2">
          <span className={`w-3 h-3 rounded-full ${accentColor}`}></span>
          {title}
        </h2>
        <span className="text-xs uppercase tracking-widest text-slate-500 font-bold">Live Stream</span>
      </div>
      
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-4"
      >
        {history.map((pair) => (
          <div key={pair.id} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <p className="text-lg leading-relaxed text-slate-300">
              {mode === 'original' ? pair.original : pair.translated}
            </p>
            <div className="mt-1 h-px w-12 bg-slate-700/50"></div>
          </div>
        ))}
        
        {content && (
          <div className="animate-pulse">
            <p 
              className={`leading-relaxed font-medium border-l-4 pl-4 py-2 rounded-r-lg ${!customTextColor && isTranslated ? 'text-emerald-400 border-emerald-500 bg-emerald-500/5' : 'text-blue-400 border-blue-500 bg-blue-500/5'}`}
              style={{ 
                fontSize: isTranslated ? `${customFontSize}px` : undefined,
                color: (isTranslated && customTextColor) ? customTextColor : undefined,
                borderColor: (isTranslated && customTextColor) ? customTextColor : undefined
              }}
            >
              {content}
              <span className="inline-block w-1 h-[0.8em] ml-1 bg-current animate-bounce opacity-50"></span>
            </p>
          </div>
        )}

        {!content && history.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 space-y-4 text-center opacity-40">
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            <p className="text-sm font-bold uppercase tracking-widest">Warte auf Signal...</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TranscriptView;
