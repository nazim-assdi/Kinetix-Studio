import React, { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';

interface VoiceoverRecorderProps {
  onRecorded: (file: File) => void;
}

export const VoiceoverRecorder: React.FC<VoiceoverRecorderProps> = ({ onRecorded }) => {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const discardOnStopRef = useRef(false);

  const startRecording = async () => {
    setError('');
    discardOnStopRef.current = false;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Microphone recording is not supported in this environment.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      chunksRef.current = [];
      const mimeType = [
        'audio/webm;codecs=opus',
        'audio/ogg;codecs=opus',
        'audio/mp4',
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setError('Recording failed. Check microphone permission and try again.');
        setRecording(false);
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || 'audio/webm';
        const extension = type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : 'webm';
        const blob = new Blob(chunksRef.current, { type });
        if (!discardOnStopRef.current && blob.size > 0) {
          const fileName = `Voiceover-${new Date().toISOString().replace(/[:.]/g, '-') }.${extension}`.replace(' .', '.');
          onRecorded(new File([blob], fileName, { type }));
        } else if (!discardOnStopRef.current) {
          setError('No audio was captured. Try recording again.');
        }
        chunksRef.current = [];
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setRecording(false);
      };
      recorder.start(250);
      setRecording(true);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Microphone access was denied.';
      setError(message);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  };

  useEffect(() => () => {
    discardOnStopRef.current = true;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={recording ? stopRecording : () => void startRecording()}
        aria-label={recording ? 'Stop Voiceover Recording' : 'Record Voiceover'}
        title={recording ? 'Stop and add voiceover to timeline' : 'Record voiceover from microphone'}
        className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold transition-colors ${
          recording
            ? 'bg-[#7F1D1D] text-white animate-pulse'
            : 'bg-[#292035] text-[#E9D5FF] hover:bg-[#49315F]'
        }`}
      >
        {recording ? <Square className="w-3 h-3 fill-current" /> : <Mic className="w-3 h-3" />}
        {recording ? 'Stop' : 'Voiceover'}
      </button>
      {error && (
        <span role="alert" title={error} className="max-w-36 truncate text-[9px] text-[#FCA5A5]">{error}</span>
      )}
    </div>
  );
};
