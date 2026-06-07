import { History, Home, Info, Settings } from 'lucide-react';
import type { AppSection, OverlayState, ResultState } from '@shared/types';

export const navItems: Array<{ id: AppSection; label: string; icon: typeof Home }> = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'history', label: 'History', icon: History },
  { id: 'about', label: 'About', icon: Info },
];

export const speakFallbackResult: ResultState = {
  text: '',
  status: 'ready',
  tone: 'success',
  message: 'Speak ready',
};

export const improveFallbackResult: ResultState = {
  text: '',
  status: 'ready',
  tone: 'success',
  message: 'Improve ready',
};

export const transcriptFallbackResult: ResultState = {
  text: '',
  status: 'ready',
  tone: 'success',
  message: 'Transcription ready',
};

export const inactiveOverlayState: OverlayState = {
  active: false,
  mode: 'speak',
  status: 'recording',
  waveform: [],
};
