import { useCallback, useState } from 'react';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';

import { transcribeVoiceNote } from '../api/features';
import { errorMessage } from './errorMessage';

export type VoiceState = 'idle' | 'recording' | 'working';

/**
 * Hold-to-talk recording that comes back as text. The recording goes to BudgetFriendly's server, which
 * transcribes it; nothing is kept on the phone after it's sent.
 */
export function useVoiceNote(onText: (text: string) => void) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [state, setState] = useState<VoiceState>('idle');
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    setError(null);
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setError('Allow the microphone in your phone settings to talk instead of typing.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setState('recording');
    } catch (e) {
      setError(errorMessage(e, 'Could not start recording'));
      setState('idle');
    }
  }, [recorder]);

  const finish = useCallback(
    async (send: boolean) => {
      if (state !== 'recording') return;
      setState(send ? 'working' : 'idle');
      try {
        await recorder.stop();
        const uri = recorder.uri;
        if (!send || !uri) return;
        const audio = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
        const res = await transcribeVoiceNote(audio, uri.toLowerCase().endsWith('.wav') ? 'audio/wav' : 'audio/m4a');
        const text = res.text.trim();
        if (text) onText(text);
        else setError('I didn’t catch that. Try again, a bit closer to the mic.');
      } catch (e) {
        setError(errorMessage(e, 'Could not turn that into text'));
      } finally {
        setState('idle');
        await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
      }
    },
    [onText, recorder, state]
  );

  return {
    state,
    error,
    setError,
    start,
    /** Stop and transcribe. */
    stop: useCallback(() => finish(true), [finish]),
    /** Stop and throw the recording away. */
    cancel: useCallback(() => finish(false), [finish])
  };
}
