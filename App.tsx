
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { TranslationLanguage, TranscriptPair, ChannelState } from './types';
import { createAudioBlob, decode, decodeAudioData } from './services/audioUtils';
import TranscriptView from './components/TranscriptView';

const ADMIN_SECRET = 'admin123'; 
const DEFAULT_STREAM_URL = 'https://livestreaming-node-4.srg-ssr.ch/srgssr/srf4news/mp3/128';

interface LogEntry {
  id: string;
  timestamp: string;
  message: string;
  type: 'info' | 'warn' | 'error' | 'debug' | 'system';
}

const nativeLanguageNames: Record<TranslationLanguage, string> = {
  [TranslationLanguage.English]: 'ENGLISH',
  [TranslationLanguage.Spanish]: 'ESPAÑOL',
  [TranslationLanguage.French]: 'FRANÇAIS',
  [TranslationLanguage.Italian]: 'ITALIANO',
  [TranslationLanguage.Russian]: 'РУССКИЙ',
  [TranslationLanguage.Chinese]: '中文',
  [TranslationLanguage.Japanese]: '日本語',
  [TranslationLanguage.Turkish]: 'TÜRKÇE',
  [TranslationLanguage.Arabic]: 'العربية',
  [TranslationLanguage.Portuguese]: 'PORTUGUÊS',
  [TranslationLanguage.Dutch]: 'NEDERLANDS',
  [TranslationLanguage.Polish]: 'POLSKI',
  [TranslationLanguage.Greek]: 'ΕΛΛΗΝΙΚΑ',
  [TranslationLanguage.Vietnamese]: 'TIẾNG VIỆT',
  [TranslationLanguage.Korean]: '한국어',
  [TranslationLanguage.Hindi]: 'हिन्दी',
  [TranslationLanguage.Ukrainian]: 'УКРАЇНСЬKA',
  [TranslationLanguage.Romanian]: 'ROMÂNĂ',
  [TranslationLanguage.Bulgarian]: 'БЪЛГАРСКИ',
  [TranslationLanguage.Croatian]: 'HRVATSKI',
  [TranslationLanguage.Czech]: 'ČEŠTINA',
  [TranslationLanguage.Danish]: 'DANSK',
  [TranslationLanguage.Estonian]: 'EESTI',
  [TranslationLanguage.Finnish]: 'SUOMI',
  [TranslationLanguage.Hungarian]: 'MAGYAR',
  [TranslationLanguage.Latvian]: 'LATVIEŠU',
  [TranslationLanguage.Lithuanian]: 'LIETUVIŲ',
  [TranslationLanguage.Slovak]: 'SLOVENČINA',
  [TranslationLanguage.Slovenian]: 'SLOVENŠČINA',
  [TranslationLanguage.Swedish]: 'SVENSKA',
  [TranslationLanguage.Thai]: 'ไทย',
  [TranslationLanguage.Hebrew]: 'עברית',
  [TranslationLanguage.Indonesian]: 'BAHASA INDONESIA'
};

const App: React.FC = () => {
  // --- UI States ---
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  
  // --- Design States ---
  const [fontSize, setFontSize] = useState(48);
  const [textColor, setTextColor] = useState('#10b981');

  // --- Broadcast States ---
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [inputSource, setInputSource] = useState<'mic' | 'stream'>('mic');
  const [streamUrl, setStreamUrl] = useState(DEFAULT_STREAM_URL);
  const [activeChannelIndex, setActiveChannelIndex] = useState(0);
  const [initStatus, setInitStatus] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);

  // --- Data States ---
  const [sourceText, setSourceText] = useState('');
  const [sourceHistory, setSourceHistory] = useState<TranscriptPair[]>([]);
  const [channels, setChannels] = useState<ChannelState[]>(
    Array.from({ length: 6 }).map((_, i) => ({
      id: i,
      language: [
        TranslationLanguage.English, TranslationLanguage.Spanish, 
        TranslationLanguage.French, TranslationLanguage.Ukrainian, 
        TranslationLanguage.Romanian, TranslationLanguage.Polish
      ][i],
      currentText: '',
      history: [],
      isActive: false,
      status: 'dormant'
    }))
  );

  // --- Debug States ---
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // --- Refs for Audio & API ---
  const audioContextsRef = useRef<{ input: AudioContext | null; output: AudioContext | null }>({ input: null, output: null });
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  // Store promises to avoid race conditions when sending audio data
  const sessionsMapRef = useRef<Map<number | string, any>>(new Map());
  const streamAudioRef = useRef<HTMLAudioElement | null>(null);
  const channelTextAccumulatorsRef = useRef<Map<number | string, string>>(new Map());
  const pendingConnectionsRef = useRef<Set<number | string>>(new Set());
  const lastErrorRef = useRef<Map<number | string, number>>(new Map());

  // --- Helper: Logging ---
  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    const timestamp = new Date().toLocaleTimeString('de-DE', { hour12: false }) + '.' + new Date().getMilliseconds().toString().padStart(3, '0');
    setLogs(prev => [...prev.slice(-149), { id: Math.random().toString(), timestamp, message, type }]);
  }, []);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // --- Logic: Session Management ---
  const stopSession = useCallback((key: number | string) => {
    const sessionPromise = sessionsMapRef.current.get(key);
    if (sessionPromise) {
      sessionPromise.then((session: any) => {
        try { session.close(); } catch (e) {}
      });
      sessionsMapRef.current.delete(key);
      const name = typeof key === 'number' ? `Slot ${key + 1}` : 'Source';
      addLog(`${name} Verbindung geschlossen.`, 'info');
    }
    pendingConnectionsRef.current.delete(key);
    if (typeof key === 'number') {
      setChannels(prev => prev.map(c => c.id === key ? { ...c, status: 'dormant', currentText: '', isActive: false } : c));
    }
  }, [addLog]);

  // Fix: Corrected startSourceSession to include all mandatory callbacks and use session promise correctly
  const startSourceSession = useCallback(async () => {
    const key = 'source';
    if (sessionsMapRef.current.has(key) || pendingConnectionsRef.current.has(key)) return;

    const lastErrorTime = lastErrorRef.current.get(key) || 0;
    if (Date.now() - lastErrorTime < 5000) return;

    pendingConnectionsRef.current.add(key);
    addLog(`Starte Transkription (Deutsch)...`, 'debug');

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: 'Transkribiere das Audio auf Deutsch. Gib NUR den transkribierten Text aus, keine Kommentare oder Erklärungen.',
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            addLog(`Source-Transkription ONLINE.`, 'info');
            pendingConnectionsRef.current.delete(key);
          },
          onmessage: async (msg: LiveServerMessage) => {
            if (msg.serverContent?.outputTranscription) {
              const text = msg.serverContent.outputTranscription.text;
              const acc = (channelTextAccumulatorsRef.current.get(key) || '') + text;
              channelTextAccumulatorsRef.current.set(key, acc);
              setSourceText(acc);
            }
            if (msg.serverContent?.turnComplete) {
              const final = (channelTextAccumulatorsRef.current.get(key) || '').trim();
              if (final) {
                setSourceHistory(prev => [{ id: Math.random().toString(), original: final, translated: '', timestamp: Date.now() }, ...prev].slice(0, 5));
                setSourceText('');
                channelTextAccumulatorsRef.current.set(key, '');
              }
            }
          },
          onclose: () => stopSession(key),
          onerror: (e) => {
            addLog(`Source-Transkription Fehler.`, 'error');
            lastErrorRef.current.set(key, Date.now());
            stopSession(key);
          }
        }
      });
      sessionsMapRef.current.set(key, sessionPromise);
    } catch (err: any) {
      addLog(`Source-Fehler: ${err.message}`, 'error');
      lastErrorRef.current.set(key, Date.now());
      stopSession(key);
    }
  }, [addLog, stopSession]);

  // Fix: Implemented startChannelSession with correct Gemini Live API configuration and callbacks
  const startChannelSession = useCallback(async (idx: number) => {
    if (sessionsMapRef.current.has(idx) || pendingConnectionsRef.current.has(idx)) return;

    const lastErrorTime = lastErrorRef.current.get(idx) || 0;
    if (Date.now() - lastErrorTime < 5000) return;

    pendingConnectionsRef.current.add(idx);
    const targetLang = channels[idx].language;
    addLog(`Slot ${idx + 1} Verbindungsaufbau (${targetLang})...`, 'debug');
    
    setChannels(prev => prev.map(c => c.id === idx ? { ...c, status: 'starting' } : c));

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: `You are a professional simultaneous translator. Translate everything you hear from German into ${targetLang}. Output the translation as both audio and text transcription. Keep the tone natural and consistent.`,
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } }
          }
        },
        callbacks: {
          onopen: () => {
            addLog(`Slot ${idx + 1} (${targetLang}) ONLINE.`, 'info');
            pendingConnectionsRef.current.delete(idx);
            setChannels(prev => prev.map(c => c.id === idx ? { ...c, status: 'active', isActive: true } : c));
          },
          onmessage: async (msg: LiveServerMessage) => {
            if (msg.serverContent?.outputTranscription) {
              const text = msg.serverContent.outputTranscription.text;
              const acc = (channelTextAccumulatorsRef.current.get(idx) || '') + text;
              channelTextAccumulatorsRef.current.set(idx, acc);
              setChannels(prev => prev.map(c => c.id === idx ? { ...c, currentText: acc } : c));
            }
            if (msg.serverContent?.turnComplete) {
              const final = (channelTextAccumulatorsRef.current.get(idx) || '').trim();
              if (final) {
                setChannels(prev => prev.map(c => c.id === idx ? {
                  ...c,
                  history: [{ id: Math.random().toString(), original: '', translated: final, timestamp: Date.now() }, ...c.history].slice(0, 5),
                  currentText: ''
                } : c));
                channelTextAccumulatorsRef.current.set(idx, '');
              }
            }
            const audioData = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData && audioContextsRef.current.output) {
               if (activeChannelIndex === idx) {
                 const buffer = await decodeAudioData(decode(audioData), audioContextsRef.current.output, 24000, 1);
                 const sourceNode = audioContextsRef.current.output.createBufferSource();
                 sourceNode.buffer = buffer;
                 sourceNode.connect(audioContextsRef.current.output.destination);
                 sourceNode.start();
               }
            }
          },
          onclose: () => stopSession(idx),
          onerror: (e) => {
            addLog(`Slot ${idx + 1} Fehler.`, 'error');
            lastErrorRef.current.set(idx, Date.now());
            stopSession(idx);
          }
        }
      });
      sessionsMapRef.current.set(idx, sessionPromise);
    } catch (err: any) {
      addLog(`Slot ${idx + 1} Fehler: ${err.message}`, 'error');
      lastErrorRef.current.set(idx, Date.now());
      stopSession(idx);
    }
  }, [addLog, stopSession, channels, activeChannelIndex]);

  // Fix: Added startBroadcasting to initialize audio capture and send PCM data to all active sessions
  const startBroadcasting = async () => {
    try {
      setInitStatus('Initialisiere Audio...');
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextsRef.current = { input: inputCtx, output: outputCtx };

      let audioStream: MediaStream;
      if (inputSource === 'mic') {
        audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } else {
        const audio = new Audio(streamUrl);
        audio.crossOrigin = "anonymous";
        streamAudioRef.current = audio;
        await audio.play();
        audioStream = (audio as any).captureStream ? (audio as any).captureStream() : (audio as any).mozCaptureStream();
      }

      const source = inputCtx.createMediaStreamSource(audioStream);
      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      const analyzer = inputCtx.createAnalyser();
      analyzer.fftSize = 256;
      
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        
        let sum = 0;
        for(let i=0; i<inputData.length; i++) sum += inputData[i] * inputData[i];
        setAudioLevel(Math.sqrt(sum / inputData.length));

        const blob = createAudioBlob(inputData);
        
        sessionsMapRef.current.forEach((sessionPromise) => {
          sessionPromise.then((session: any) => {
            session.sendRealtimeInput({ media: blob });
          });
        });
      };

      source.connect(analyzer);
      source.connect(processor);
      processor.connect(inputCtx.destination);
      
      processorRef.current = processor;
      analyzerRef.current = analyzer;

      setIsBroadcasting(true);
      setInitStatus('');
      addLog('Übertragung gestartet.', 'system');

      startSourceSession();
      channels.forEach((_, i) => {
        startChannelSession(i);
      });

    } catch (err: any) {
      addLog(`Broadcast-Fehler: ${err.message}`, 'error');
      setInitStatus('Fehler beim Starten');
      setIsBroadcasting(false);
    }
  };

  const stopBroadcasting = () => {
    setIsBroadcasting(false);
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioContextsRef.current.input) {
      audioContextsRef.current.input.close();
      audioContextsRef.current.input = null;
    }
    if (audioContextsRef.current.output) {
      audioContextsRef.current.output.close();
      audioContextsRef.current.output = null;
    }
    if (streamAudioRef.current) {
      streamAudioRef.current.pause();
      streamAudioRef.current = null;
    }
    
    sessionsMapRef.current.forEach((_, key) => stopSession(key));
    addLog('Übertragung gestoppt.', 'system');
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans">
      <header className="bg-slate-800/50 border-b border-slate-700 px-6 py-4 flex items-center justify-between backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-emerald-500 rounded-xl flex items-center justify-center shadow-lg">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">
              Polyglot Stream
            </h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">AI Simultaneous Interpretation</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/50 rounded-full border border-slate-700">
            <div className={`w-2 h-2 rounded-full ${isBroadcasting ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`}></div>
            <span className="text-xs font-medium text-slate-400">{isBroadcasting ? 'LIVE' : 'OFFLINE'}</span>
          </div>
          
          <button 
            onClick={() => isAdmin ? setShowSettings(!showSettings) : setShowAdminLogin(true)}
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-white"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-88px)]">
        <div className={`lg:col-span-4 flex flex-col gap-6 ${!isAdmin && 'hidden lg:flex'}`}>
          <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-6 space-y-6">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Broadcast Control</h3>
            <div className="space-y-4">
              <div className="flex rounded-lg overflow-hidden border border-slate-700 p-1 bg-slate-900/50">
                <button 
                  onClick={() => setInputSource('mic')}
                  className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${inputSource === 'mic' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  MIC
                </button>
                <button 
                  onClick={() => setInputSource('stream')}
                  className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${inputSource === 'stream' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  STREAM
                </button>
              </div>
              {inputSource === 'stream' && (
                <input 
                  type="text" 
                  value={streamUrl}
                  onChange={(e) => setStreamUrl(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Stream URL..."
                />
              )}
              <button 
                onClick={isBroadcasting ? stopBroadcasting : startBroadcasting}
                className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-3 transition-all ${isBroadcasting ? 'bg-red-500/10 text-red-500 border border-red-500/50 hover:bg-red-500/20' : 'bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-500/20'}`}
              >
                {isBroadcasting ? 'STOP BROADCAST' : 'START BROADCAST'}
              </button>
              {initStatus && <p className="text-center text-xs text-blue-400 animate-pulse">{initStatus}</p>}
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase">
                <span>Signal Level</span>
                <span>{Math.round(audioLevel * 100)}%</span>
              </div>
              <div className="h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-700">
                <div 
                  className={`h-full transition-all duration-75 ${audioLevel > 0.5 ? 'bg-red-500' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.min(100, audioLevel * 200)}%` }}
                ></div>
              </div>
            </div>
          </div>
          <div className="flex-1 min-h-0">
             <TranscriptView 
                title="Source (German)" 
                content={sourceText} 
                history={sourceHistory} 
                mode="original" 
                accentColor="bg-blue-500" 
             />
          </div>
        </div>

        <div className="lg:col-span-8 flex flex-col gap-6 min-h-0">
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {channels.map((channel, idx) => (
              <button
                key={channel.id}
                onClick={() => setActiveChannelIndex(idx)}
                className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all duration-300 ${activeChannelIndex === idx ? 'bg-emerald-500/10 border-emerald-500/50 shadow-lg' : 'bg-slate-800/30 border-slate-700 hover:border-slate-600'}`}
              >
                <span className={`text-[10px] font-black uppercase tracking-tighter ${activeChannelIndex === idx ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {nativeLanguageNames[channel.language]}
                </span>
                <div className="relative">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${activeChannelIndex === idx ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-400'}`}>
                    {channel.language.substring(0, 2).toUpperCase()}
                  </div>
                  {channel.status === 'active' && (
                    <span className="absolute -top-1 -right-1 flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
          <div className="flex-1 min-h-0">
            <TranscriptView 
              title={channels[activeChannelIndex].language} 
              content={channels[activeChannelIndex].currentText} 
              history={channels[activeChannelIndex].history} 
              mode="translated" 
              accentColor="bg-emerald-500"
              customFontSize={fontSize}
              customTextColor={textColor}
            />
          </div>
        </div>
      </main>

      {showAdminLogin && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-[100] p-6">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 max-w-sm w-full space-y-6 shadow-2xl">
            <h2 className="text-2xl font-bold text-center">Admin Access</h2>
            <input 
              type="password" 
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Secret..."
            />
            <button 
              onClick={() => adminPassword === ADMIN_SECRET ? (setIsAdmin(true), setShowAdminLogin(false)) : alert('Access Denied')}
              className="w-full bg-blue-600 hover:bg-blue-500 py-3 rounded-lg font-bold"
            >
              LOGIN
            </button>
            <button onClick={() => setShowAdminLogin(false)} className="w-full text-slate-400 text-sm">CANCEL</button>
          </div>
        </div>
      )}

      {isAdmin && showSettings && (
        <div className="fixed inset-y-0 right-0 w-80 bg-slate-800 border-l border-slate-700 shadow-2xl z-[90] flex flex-col p-6 space-y-8">
           <div className="flex items-center justify-between">
             <h2 className="text-xl font-bold">Settings</h2>
             <button onClick={() => setShowSettings(false)} className="text-slate-400">CLOSE</button>
           </div>
           <div className="space-y-6 overflow-y-auto flex-1">
              <section className="space-y-4">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Display</h3>
                <div className="space-y-2">
                  <label className="text-sm text-slate-400">Size: {fontSize}px</label>
                  <input type="range" min="16" max="96" value={fontSize} onChange={(e) => setFontSize(parseInt(e.target.value))} className="w-full" />
                </div>
              </section>
              <section className="space-y-4">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Logs</h3>
                <div ref={logContainerRef} className="h-40 bg-black rounded p-2 font-mono text-[10px] overflow-y-auto space-y-1">
                  {logs.map(log => <div key={log.id} className="text-slate-400">[{log.timestamp}] {log.message}</div>)}
                </div>
              </section>
           </div>
        </div>
      )}
    </div>
  );
};

export default App;