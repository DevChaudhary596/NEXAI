"use client";

import { useCallback, useRef, useState } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { transcribeAudio } from "@/lib/api";

interface VoiceInputButtonProps {
  disabled?: boolean;
  /** Called with the transcript once a recording finishes transcribing. */
  onTranscribed: (text: string) => void;
  /** Called with a short, user-facing message if recording/transcription fails. */
  onError?: (message: string) => void;
}

type Status = "idle" | "recording" | "transcribing";

/** Day 10: press to record, press again to stop, transcript comes back and
 * gets handed to the caller (which autofills + sends the query) - hands-free
 * once the mic permission is granted. */
export default function VoiceInputButton({
  disabled,
  onTranscribed,
  onError,
}: VoiceInputButtonProps) {
  const [status, setStatus] = useState<Status>("idle");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const startRecording = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      onError?.("This browser doesn't support microphone recording.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/ogg")
          ? "audio/ogg"
          : "";
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stopStream();
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size === 0) {
          setStatus("idle");
          onError?.("No audio captured - try again.");
          return;
        }
        setStatus("transcribing");
        try {
          const { text } = await transcribeAudio(blob);
          onTranscribed(text);
        } catch (err) {
          onError?.(err instanceof Error ? err.message : "Transcription failed.");
        } finally {
          setStatus("idle");
        }
      };

      recorderRef.current = recorder;
      recorder.start();
      setStatus("recording");
    } catch {
      onError?.("Microphone permission denied or unavailable.");
    }
  }, [onError, onTranscribed]);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
  }, []);

  const handleClick = () => {
    if (status === "recording") stopRecording();
    else if (status === "idle") startRecording();
  };

  return (
    <button
      type="button"
      className={`mic-button pixel-notch${status === "recording" ? " mic-button--recording" : ""}${
        status === "transcribing" ? " mic-button--transcribing" : ""
      }`}
      onClick={handleClick}
      disabled={disabled || status === "transcribing"}
      aria-label={status === "recording" ? "Stop recording" : "Ask by voice"}
      title={status === "recording" ? "Stop recording" : "Ask by voice"}
    >
      {status === "transcribing" ? (
        <Loader2 size={15} className="spin" />
      ) : status === "recording" ? (
        <Square size={13} />
      ) : (
        <Mic size={15} />
      )}
    </button>
  );
}
