import { describe, expect, it } from 'vitest';
import { actionOverlay, actionResult, actionUi } from '@shared/action-ui';
import { shouldShowDownloadModelButton } from '@renderer/ui/views/HomeView';

describe('Action status', () => {
  it('shows simple messages and colors', () => {
    expect(actionUi('speak', 'ready')).toMatchObject({ title: 'Speak', message: 'Speak ready', tone: 'success' });
    expect(actionUi('improve', 'ready')).toMatchObject({ title: 'Improve', message: 'Improve ready', tone: 'success' });
    expect(actionUi('transcript', 'ready')).toMatchObject({ title: 'Transcript', message: 'Transcription ready', tone: 'success' });
    expect(actionUi('speak', 'loading')).toMatchObject({ message: 'Speak is loading...', tone: 'info' });
    expect(actionUi('speak', 'recording')).toMatchObject({ message: 'Listening...', tone: 'info' });
    expect(actionUi('transcript', 'recording')).toMatchObject({ message: 'Recording...', tone: 'info' });
    expect(actionUi('improve', 'processing')).toMatchObject({ message: 'Improving text...', tone: 'info' });
    expect(actionUi('speak', 'warning')).toMatchObject({ message: 'Action unavailable', tone: 'warning', messageType: 'warning' });
    expect(actionUi('improve', 'error')).toMatchObject({ message: 'Improve failed', tone: 'error', messageType: 'error' });
    expect(actionUi('transcript', 'done')).toMatchObject({ message: 'Transcript done', tone: 'success', messageType: 'success' });
  });

  it('creates Home and Overlay status', () => {
    expect(actionResult('improve', 'processing')).toMatchObject({
      text: '',
      status: 'processing',
      tone: 'info',
      message: 'Improving text...',
      actionPhase: 'processing',
    });
    expect(actionOverlay('transcript', 'processing')).toMatchObject({
      active: true,
      mode: 'transcript',
      status: 'transcribing',
      phase: 'transcribing',
      actionPhase: 'processing',
      message: 'Transcribing...',
      messageType: 'info',
    });
  });

  it('shows Overlay states', () => {
    expect(actionOverlay('speak', 'loading')).toMatchObject({
      active: true,
      mode: 'speak',
      status: 'warning',
      phase: 'loading',
      actionPhase: 'loading',
      message: 'Speak is loading...',
      messageType: 'info',
    });
    expect(actionOverlay('improve', 'loading')).toMatchObject({
      active: true,
      mode: 'improve',
      status: 'warning',
      phase: 'loading',
      actionPhase: 'loading',
      message: 'Improve is loading...',
      messageType: 'info',
    });
    expect(actionOverlay('speak', 'recording')).toMatchObject({
      status: 'recording',
      phase: 'recording',
      message: 'Listening...',
    });
    expect(actionOverlay('transcript', 'recording')).toMatchObject({
      status: 'recording',
      phase: 'recording',
      message: 'Recording...',
    });
    expect(actionOverlay('speak', 'ready')).toMatchObject({
      active: false,
      status: 'done',
      message: 'Speak ready',
      messageType: 'success',
    });
  });

  it('shows model download action only when the active model is missing', () => {
    expect(shouldShowDownloadModelButton('speak', true, false, true)).toBe(true);
    expect(shouldShowDownloadModelButton('transcript', true, false, true)).toBe(true);
    expect(shouldShowDownloadModelButton('improve', true, true, false)).toBe(true);
    expect(shouldShowDownloadModelButton('speak', true, true, false)).toBe(false);
    expect(shouldShowDownloadModelButton('improve', true, false, true)).toBe(false);
    expect(shouldShowDownloadModelButton('speak', false, false, false)).toBe(false);
  });
});
