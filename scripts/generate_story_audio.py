#!/usr/bin/env python3
"""
Generates SOLEN story narration using Gemini multi-speaker TTS.
Output: frontend/public/audio/story_narration.wav

Usage:
    GEMINI_API_KEY=your_key python3 scripts/generate_story_audio.py
"""

import mimetypes
import os
import struct
import sys
from pathlib import Path

from google import genai
from google.genai import types


OUTPUT_PATH = Path(__file__).parent.parent / "frontend" / "public" / "audio" / "story_narration.wav"


def save_binary_file(file_name: Path, data: bytes):
    file_name.parent.mkdir(parents=True, exist_ok=True)
    file_name.write_bytes(data)
    print(f"✅ Audio saved to: {file_name}")


def convert_to_wav(audio_data: bytes, mime_type: str) -> bytes:
    parameters = parse_audio_mime_type(mime_type)
    bits_per_sample = parameters["bits_per_sample"]
    sample_rate = parameters["rate"]
    num_channels = 1
    data_size = len(audio_data)
    bytes_per_sample = bits_per_sample // 8
    block_align = num_channels * bytes_per_sample
    byte_rate = sample_rate * block_align
    chunk_size = 36 + data_size

    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF",
        chunk_size,
        b"WAVE",
        b"fmt ",
        16,
        1,
        num_channels,
        sample_rate,
        byte_rate,
        block_align,
        bits_per_sample,
        b"data",
        data_size,
    )
    return header + audio_data


def parse_audio_mime_type(mime_type: str) -> dict:
    bits_per_sample = 16
    rate = 24000
    for param in mime_type.split(";"):
        param = param.strip()
        if param.lower().startswith("rate="):
            try:
                rate = int(param.split("=", 1)[1])
            except (ValueError, IndexError):
                pass
        elif param.startswith("audio/L"):
            try:
                bits_per_sample = int(param.split("L", 1)[1])
            except (ValueError, IndexError):
                pass
    return {"bits_per_sample": bits_per_sample, "rate": rate}


def generate():
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("❌ GEMINI_API_KEY environment variable not set.")
        print("   Run: GEMINI_API_KEY=your_key python3 scripts/generate_story_audio.py")
        sys.exit(1)

    client = genai.Client(api_key=api_key)
    model = "gemini-3.1-flash-tts-preview"

    contents = [
        types.Content(
            role="user",
            parts=[
                types.Part.from_text(
                    text="""Read the following transcript based on the audio profile and director's note.

# Audio Profile
For Speaker 1: A smooth, premium commercial voice.

# Director's note
For Speaker 1: Style: Promo/Hype. Pace: Natural. Accent: American (Gen).

## Transcript:
Speaker 1: From high above, satellites watch our changing world. They pierce through violent storms, revealing the impact of floods on our cities.
Speaker 2: Command, ground rescue team updates: The rescue boat has reached the stranded group on the rooftop. Evacuation is underway.
Speaker 1: The engine integrates all modalities to provide complete situational awareness, allowing rapid response for disaster relief. Built on adaptable foundation models, Solen scales seamlessly beyond crisis response. Solen.
Speaker 2: From satellite data to a better tomorrow."""
                ),
            ],
        ),
    ]

    generate_content_config = types.GenerateContentConfig(
        temperature=1,
        response_modalities=["audio"],
        speech_config=types.SpeechConfig(
            multi_speaker_voice_config=types.MultiSpeakerVoiceConfig(
                speaker_voice_configs=[
                    types.SpeakerVoiceConfig(
                        speaker="Speaker 1",
                        voice_config=types.VoiceConfig(
                            prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Algieba")
                        ),
                    ),
                    types.SpeakerVoiceConfig(
                        speaker="Speaker 2",
                        voice_config=types.VoiceConfig(
                            prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Enceladus")
                        ),
                    ),
                ]
            ),
        ),
    )

    print("🎙️  Generating story narration with Gemini TTS...")
    audio_data = bytearray()
    mime_type = ""

    for chunk in client.models.generate_content_stream(
        model=model,
        contents=contents,
        config=generate_content_config,
    ):
        if chunk.parts is None:
            continue
        if chunk.parts[0].inline_data and chunk.parts[0].inline_data.data:
            inline_data = chunk.parts[0].inline_data
            audio_data.extend(inline_data.data)
            mime_type = inline_data.mime_type
        else:
            if text := chunk.text:
                print(text)

    if audio_data:
        file_extension = mimetypes.guess_extension(mime_type)
        data_buffer = bytes(audio_data)
        if file_extension is None or file_extension != ".wav":
            data_buffer = convert_to_wav(bytes(audio_data), mime_type)
        save_binary_file(OUTPUT_PATH, data_buffer)
    else:
        print("❌ No audio data received from API.")
        sys.exit(1)


if __name__ == "__main__":
    generate()
