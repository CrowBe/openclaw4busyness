export type TranscriptionFormat = "whisper" | "wav2vec";

export type TranscriptionRequest = {
  audioPath: string; // Local path to audio file
  format?: TranscriptionFormat;
  language?: string; // e.g. 'en', 'auto'
};

export type TranscriptionResult = {
  ok: boolean;
  text?: string;
  error?: string;
  durationMs?: number;
  words?: Array<{ word: string; start: number; end: number }>;
};
