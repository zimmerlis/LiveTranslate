
export interface TranscriptPair {
  id: string;
  original: string;
  translated: string;
  timestamp: number;
}

export interface ChannelState {
  id: number;
  language: TranslationLanguage;
  currentText: string;
  history: TranscriptPair[];
  isActive: boolean;
  status: 'dormant' | 'starting' | 'active';
}

export enum TranslationLanguage {
  English = 'Englisch',
  Spanish = 'Spanisch',
  French = 'Französisch',
  Italian = 'Italienisch',
  Russian = 'Russisch',
  Chinese = 'Chinesisch',
  Japanese = 'Japanisch',
  Turkish = 'Türkisch',
  Arabic = 'Arabisch',
  Portuguese = 'Portugiesisch',
  Dutch = 'Niederländisch',
  Polish = 'Polnisch',
  Greek = 'Griechisch',
  Vietnamese = 'Vietnamesisch',
  Korean = 'Koreanisch',
  Hindi = 'Hindi',
  Ukrainian = 'Ukrainisch',
  Romanian = 'Rumänisch',
  Bulgarian = 'Bulgarisch',
  Croatian = 'Kroatisch',
  Czech = 'Tschechisch',
  Danish = 'Dänisch',
  Estonian = 'Estnisch',
  Finnish = 'Finnisch',
  Hungarian = 'Ungarisch',
  Latvian = 'Lettisch',
  Lithuanian = 'Litauisch',
  Slovak = 'Slowakisch',
  Slovenian = 'Slowenisch',
  Swedish = 'Schwedisch',
  Thai = 'Thailändisch',
  Hebrew = 'Hebräisch',
  Indonesian = 'Indonesisch'
}

export interface AppState {
  isAdmin: boolean;
  activeChannelIndex: number;
  channels: ChannelState[];
}
