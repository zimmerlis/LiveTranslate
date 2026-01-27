
export interface TranscriptPair {
  id: string;
  original: string;
  translated: string;
  timestamp: number;
}

export enum TranslationLanguage {
  Afrikaans = 'Afrikaans',
  Albanian = 'Albanisch',
  Arabic = 'Arabisch',
  Armenian = 'Armenisch',
  Azerbaijani = 'Aserbaidschanisch',
  Basque = 'Baskisch',
  Bengali = 'Bengalisch',
  Bosnian = 'Bosnisch',
  Bulgarian = 'Bulgarisch',
  Catalan = 'Katalanisch',
  Chinese_Simplified = 'Chinesisch (Vereinfacht)',
  Chinese_Traditional = 'Chinesisch (Traditionell)',
  Croatian = 'Kroatisch',
  Czech = 'Tschechisch',
  Danish = 'Dänisch',
  Dutch = 'Niederländisch',
  English = 'Englisch',
  Esperanto = 'Esperanto',
  Estonian = 'Estnisch',
  Finnish = 'Finnisch',
  French = 'Französisch',
  Galician = 'Galicisch',
  Georgian = 'Georgisch',
  Greek = 'Griechisch',
  Gujarati = 'Gujarati',
  Haitian_Creole = 'Haitianisch',
  Hebrew = 'Hebräisch',
  Hindi = 'Hindi',
  Hungarian = 'Ungarisch',
  Icelandic = 'Isländisch',
  Indonesian = 'Indonesisch',
  Irish = 'Irisch',
  Italian = 'Italienisch',
  Japanese = 'Japanisch',
  Javanese = 'Javanisch',
  Kannada = 'Kannada',
  Kazakh = 'Kasachisch',
  Khmer = 'Khmer',
  Korean = 'Koreanisch',
  Latin = 'Latein',
  Latvian = 'Lettisch',
  Lithuanian = 'Litauisch',
  Macedonian = 'Mazedonisch',
  Malay = 'Malaiisch',
  Malayalam = 'Malayalam',
  Maltese = 'Maltesisch',
  Maori = 'Maori',
  Marathi = 'Marathi',
  Mongolian = 'Mongolisch',
  Nepali = 'Nepalesisch',
  Norwegian = 'Norwegisch',
  Persian = 'Persisch',
  Polish = 'Polnisch',
  Portuguese = 'Portugiesisch',
  Punjabi = 'Punjabi',
  Romanian = 'Rumänisch',
  Russian = 'Russisch',
  Serbian = 'Serbisch',
  Slovak = 'Slowakisch',
  Slovenian = 'Slowenisch',
  Spanish = 'Spanisch',
  Swahili = 'Suaheli',
  Swedish = 'Schwedisch',
  Tagalog = 'Tagalog',
  Tamil = 'Tamil',
  Telugu = 'Telugu',
  Thai = 'Thailändisch',
  Turkish = 'Türkisch',
  Ukrainian = 'Ukrainisch',
  Urdu = 'Urdu',
  Uzbek = 'Usbekisch',
  Vietnamese = 'Vietnamesisch',
  Welsh = 'Walisisch'
}

export interface AppState {
  isRecording: boolean;
  targetLanguage: TranslationLanguage;
  history: TranscriptPair[];
  currentOriginal: string;
  currentTranslated: string;
}
