import { useCallback, useEffect, useRef, useState } from "react";

export type SpeechStatus = "unsupported" | "idle" | "speaking" | "paused";

/**
 * TTS via the Web Speech API (Phase 8). Text remains the primary source of
 * information: when speech is unsupported every method is a safe no-op and
 * `supported` is false so the UI hides the controls instead of degrading.
 */
export function useSpeech(): {
  supported: boolean;
  status: SpeechStatus;
  speak: (text: string) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
} {
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  const [status, setStatus] = useState<SpeechStatus>(supported ? "idle" : "unsupported");
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Per-utterance onend/onerror handlers drive the status; the effect only
  // guarantees speech stops when the component unmounts.
  useEffect(() => {
    if (!supported) return;
    const synth = window.speechSynthesis;
    return () => {
      synth.cancel();
    };
  }, [supported]);

  const speak = useCallback(
    (text: string): void => {
      if (!supported || !text.trim()) return;
      const synth = window.speechSynthesis;
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-NG";
      utterance.onstart = () => setStatus("speaking");
      utterance.onpause = () => setStatus("paused");
      utterance.onresume = () => setStatus("speaking");
      utterance.onend = () => setStatus("idle");
      utterance.onerror = () => setStatus("idle");
      utteranceRef.current = utterance;
      synth.speak(utterance);
    },
    [supported],
  );

  const pause = useCallback((): void => {
    if (!supported) return;
    window.speechSynthesis.pause();
    setStatus("paused");
  }, [supported]);

  const resume = useCallback((): void => {
    if (!supported) return;
    window.speechSynthesis.resume();
    setStatus("speaking");
  }, [supported]);

  const stop = useCallback((): void => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setStatus("idle");
  }, [supported]);

  return { supported, status, speak, pause, resume, stop };
}
