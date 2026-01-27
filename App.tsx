
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { TranslationLanguage, TranscriptPair } from './types';
import { createAudioBlob, decode, decodeAudioData } from './services/audioUtils';
import TranscriptView from './components/TranscriptView';

const App: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState<TranslationLanguage>(TranslationLanguage.English);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [history, setHistory] = useState<TranscriptPair[]>([]);
  
  // States for live display (interim results)
  const [currentOriginal, setCurrentOriginal] = useState('');
  const [currentTranslated, setCurrentTranslated] = useState('');
  
  // Refs to track accumulated text and audio state safely within callbacks (avoiding stale closures)
  const accumulatedOriginalRef = useRef('');
  const accumulatedTranslatedRef = useRef('');
  const isAudioEnabledRef = useRef(isAudioEnabled);
  
  const [error, setError] = useState<string | null>(null);

  // Audio & Session Contexts
  const inputAudioCtx = useRef<AudioContext | null>(null);
  const outputAudioCtx = useRef<AudioContext | null>(null);
  const sessionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Sync ref with state
  useEffect(() => {
    isAudioEnabledRef.current = isAudioEnabled;
  }, [isAudioEnabled]);

  // Cleanup effect
  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, []);

  const handleStartSession = useCallback(async () => {
    try {
      setError(null);
      
      if (!inputAudioCtx.current) {
        inputAudioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      }
      if (!outputAudioCtx.current) {
        outputAudioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: async () => {
            setIsRecording(true);

            // Access Microphone
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            
            const source = inputAudioCtx.current!.createMediaStreamSource(stream);
            const scriptProcessor = inputAudioCtx.current!.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createAudioBlob(inputData);
              sessionPromise.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };

            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioCtx.current!.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            // 1. Process User Transcription (German)
            if (message.serverContent?.inputTranscription) {
              const text = message.serverContent.inputTranscription.text;
              accumulatedOriginalRef.current += text;
              setCurrentOriginal(accumulatedOriginalRef.current);
            }

            // 2. Process Translation Output from Model
            if (message.serverContent?.outputTranscription) {
              const text = message.serverContent.outputTranscription.text;
              accumulatedTranslatedRef.current += text;
              setCurrentTranslated(accumulatedTranslatedRef.current);
            } else if (message.serverContent?.modelTurn?.parts) {
              for (const part of message.serverContent.modelTurn.parts) {
                if (part.text) {
                  accumulatedTranslatedRef.current += part.text;
                  setCurrentTranslated(accumulatedTranslatedRef.current);
                }
              }
            }

            // 3. Turn Completed
            if (message.serverContent?.turnComplete) {
              const original = accumulatedOriginalRef.current.trim();
              const translated = accumulatedTranslatedRef.current.trim();
              
              if (original || translated) {
                setHistory((prev) => [
                  ...prev,
                  {
                    id: Math.random().toString(36).substr(2, 9),
                    original: original || "...",
                    translated: translated || "...",
                    timestamp: Date.now()
                  }
                ]);
              }
              
              // Reset current buffer
              accumulatedOriginalRef.current = '';
              accumulatedTranslatedRef.current = '';
              setCurrentOriginal('');
              setCurrentTranslated('');
            }

            // 4. Handle Audio Data - ONLY if audio output is enabled
            const base64Audio = message.serverContent?.modelTurn?.parts?.find(p => p.inlineData)?.inlineData?.data;
            if (base64Audio && outputAudioCtx.current && isAudioEnabledRef.current) {
              const audioBuffer = await decodeAudioData(
                decode(base64Audio),
                outputAudioCtx.current,
                24000,
                1
              );
              const source = outputAudioCtx.current.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(outputAudioCtx.current.destination);
              source.start();
            }
          },
          onerror: (e) => {
            setError('Verbindungsfehler. Bitte versuche es erneut.');
            stopRecording();
          },
          onclose: () => {
            setIsRecording(false);
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          thinkingConfig: { thinkingBudget: 0 },
          systemInstruction: `SYSTEM-ORDER: DU BIST EIN STUMMER ÜBERSETZUNGS-ROBOTER.
          
          MISSION: Übersetze deutsches Audio SOFORT in ${targetLanguage}.
          
          STRIKTES VERBOT:
          - KEINE Metadaten wie "Translating...", "Analyzing...", "I am...".
          - KEINE Erklärungen oder Kommentare.
          - KEINE Wiederholung des deutschen Textes.
          
          REGEL: Gib NUR UND AUSSCHLIESSLICH die Übersetzung in ${targetLanguage} aus. Deine Antwort besteht NUR aus dem Zieltext.`,
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
          }
        }
      });

      sessionRef.current = await sessionPromise;
    } catch (err: any) {
      setError('Fehler beim Zugriff auf das Mikrofon oder API.');
    }
  }, [targetLanguage]);

  const stopRecording = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsRecording(false);
    if (sessionRef.current) {
      window.location.reload(); 
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      handleStartSession();
    }
  };

  const sortedLanguages = Object.values(TranslationLanguage).sort((a, b) => a.localeCompare(b));

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 font-sans p-4 md:p-8">
      {/* Header & Controls */}
      <header className="flex flex-col md:flex-row items-center justify-between gap-6 mb-8 bg-slate-900/50 p-6 rounded-3xl border border-slate-800 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="bg-blue-600 p-3 rounded-2xl shadow-lg shadow-blue-900/20">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
              Live-Stream Übersetzer
            </h1>
            <p className="text-slate-500 text-sm font-medium uppercase tracking-wider">Strikter Dolmetscher Modus</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {/* Audio Output Switch */}
          <div className="flex flex-col items-center">
            <label className="text-xs font-bold text-slate-500 mb-1 uppercase tracking-tighter">Audio Ausgabe</label>
            <button
              onClick={() => setIsAudioEnabled(!isAudioEnabled)}
              className={`p-2 rounded-xl transition-all border ${
                isAudioEnabled 
                  ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-500 hover:bg-emerald-500/20' 
                  : 'bg-slate-800 border-slate-700 text-slate-500 hover:bg-slate-700'
              }`}
              title={isAudioEnabled ? "Audio eingeschaltet" : "Audio stummgeschaltet"}
            >
              {isAudioEnabled ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
              )}
            </button>
          </div>

          <div className="flex flex-col">
            <label className="text-xs font-bold text-slate-500 mb-1 uppercase tracking-tighter">Zielsprache</label>
            <select 
              disabled={isRecording}
              value={targetLanguage}
              onChange={(e) => setTargetLanguage(e.target.value as TranslationLanguage)}
              className="bg-slate-800 border border-slate-700 text-slate-200 rounded-xl px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none transition-all disabled:opacity-50 cursor-pointer max-w-[200px]"
            >
              {sortedLanguages.map((lang) => (
                <option key={lang} value={lang}>{lang}</option>
              ))}
            </select>
          </div>

          <button
            onClick={toggleRecording}
            className={`flex items-center gap-3 px-8 py-3 rounded-xl font-bold transition-all transform active:scale-95 ${
              isRecording 
                ? 'bg-red-500/10 text-red-500 border border-red-500/50 hover:bg-red-500/20 shadow-red-500/10 shadow-lg' 
                : 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500 hover:-translate-y-0.5'
            }`}
          >
            {isRecording ? (
              <>
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                </span>
                Aktiv...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" />
                </svg>
                Übersetzung Starten
              </>
            )}
          </button>
        </div>
      </header>

      {error && (
        <div className="mb-6 bg-red-500/10 border border-red-500/50 text-red-500 px-6 py-4 rounded-2xl flex items-center gap-4 animate-in slide-in-from-top-4 duration-300">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="font-semibold">{error}</p>
        </div>
      )}

      {/* Side-by-Side Views */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-0 mb-4">
        <TranscriptView 
          title="Deutsch (Eingabe)" 
          content={currentOriginal} 
          history={history}
          mode="original"
          accentColor="bg-blue-500"
        />
        <TranscriptView 
          title={`${targetLanguage} (Übersetzung)`} 
          content={currentTranslated} 
          history={history}
          mode="translated"
          accentColor="bg-emerald-500"
        />
      </main>

      <footer className="text-center text-slate-600 text-[10px] uppercase tracking-widest pb-4">
        Gemini 2.5 Live Engine • Zero-Prompt Latency Mode
      </footer>
    </div>
  );
};

export default App;
