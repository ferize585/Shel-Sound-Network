export interface Track {
  id: number | string;
  title: string;
  artist: string;
  url: string;
  duration?: number;
  album?: string;
  file?: File;
  source: 'local' | 'shelby' | 'SHELBY';
  owner?: string;
  blobName?: string;
  size?: number;
}

export type View = 'library' | 'upload' | 'settings' | 'cloud-explorer';

export interface Settings {
  crossfade: boolean;
  gapless: boolean;
  volumeBoost: boolean;
  highQuality: boolean;
  visualizer: boolean;
  ambientGlow: boolean;
}
