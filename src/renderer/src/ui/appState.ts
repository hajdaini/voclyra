import { History, Home, Info, Settings } from 'lucide-react';
import type { AppSection, OverlayState, ResultState } from '@shared/types';
import { actionResult } from '@shared/action-ui';

export const navItems: Array<{ id: AppSection; label: string; icon: typeof Home }> = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'history', label: 'History', icon: History },
  { id: 'about', label: 'About', icon: Info },
];

export const speakFallbackResult: ResultState = actionResult('speak', 'ready');

export const improveFallbackResult: ResultState = actionResult('improve', 'ready');

export const transcriptFallbackResult: ResultState = actionResult('transcript', 'ready');

export const inactiveOverlayState: OverlayState = {
  active: false,
  mode: 'speak',
  status: 'recording',
  actionPhase: 'ready',
  waveform: [],
};
