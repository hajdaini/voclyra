import { describe, expect, it } from 'vitest';
import { mergeTranscriptText } from '@services/whisper-service';

describe('WhisperService transcript merge', () => {
  it('removes duplicated overlap even when the next chunk starts with stray words', () => {
    const current = [
      'Alors vous, pour vous, réussir à faire ça, ça a duré, je ne sais pas, quelques minutes.',
      "Et dites-vous que j'y ai passé des jours pour réussir à le faire.",
    ].join(' ');
    const next = [
      'Merci.',
      'réussir à faire ça, ça a duré, je ne sais pas, quelques minutes.',
      "Et dites-vous que j'y ai passé des jours pour réussir à le faire.",
      'Après, vous pouvez aussi faire en sorte d’ouvrir et fermer individuellement les mains.',
    ].join(' ');

    expect(mergeTranscriptText(current, next)).toBe([
      'Alors vous, pour vous, réussir à faire ça, ça a duré, je ne sais pas, quelques minutes.',
      "Et dites-vous que j'y ai passé des jours pour réussir à le faire.",
      'Après, vous pouvez aussi faire en sorte d’ouvrir et fermer individuellement les mains.',
    ].join(' '));
  });
});
