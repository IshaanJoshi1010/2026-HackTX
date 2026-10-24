"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { cn } from "@/lib/utils";

export interface VoiceButtonProps {
  onTranscript(text: string): void;
  disabled?: boolean;
  className?: string;
}

// Window type augmentation for Web Speech API
interface SpeechRecognitionEvent {
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
    };
  };
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

function isSpeechSupported(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ||
    (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition,
  );
}

export function VoiceButton({ onTranscript, disabled = false, className }: VoiceButtonProps) {
  const [listening, setListening] = useState(false);
  const supported = isSpeechSupported();
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  useEffect(() => {
    const SpeechClass =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionInstance }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionInstance }).webkitSpeechRecognition;

    if (!SpeechClass) {
      return;
    }

    try {
      const instance = new SpeechClass();
      instance.continuous = false;
      instance.interimResults = false;
      instance.lang = "en-US";

      instance.onresult = (event: SpeechRecognitionEvent) => {
        const text = event.results[0]?.[0]?.transcript;
        if (text) {
          onTranscript(text);
        }
        setListening(false);
      };

      instance.onerror = () => {
        setListening(false);
      };

      instance.onend = () => {
        setListening(false);
      };

      recognitionRef.current = instance;
    } catch {
      recognitionRef.current = null;
    }

    return () => {
      recognitionRef.current?.abort();
    };
  }, [onTranscript]);

  const toggle = () => {
    if (!supported || disabled) return;
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
    } else {
      try {
        recognitionRef.current?.start();
        setListening(true);
      } catch {
        setListening(false);
      }
    }
  };

  const title = !supported
    ? "Speech recognition is unavailable in this environment"
    : listening
      ? "Listening... Click to stop"
      : "Dictate life event";

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={!supported || disabled}
      title={title}
      aria-label={title}
      aria-pressed={listening}
      className={cn(
        "flex size-9 items-center justify-center rounded-full transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
        listening
          ? "bg-ink text-canvas animate-pulse"
          : "bg-ink/10 text-ink/75 hover:bg-ink/20 hover:text-ink",
        className,
      )}
    >
      {listening ? <Mic className="size-4" /> : <MicOff className="size-4" />}
    </button>
  );
}
