import argparse
from pathlib import Path

import torch
import torchaudio as ta
from chatterbox.mtl_tts import ChatterboxMultilingualTTS


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate one WAV chunk with Chatterbox Multilingual")
    parser.add_argument("--text-file", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--voice")
    parser.add_argument("--language", default="ru")
    parser.add_argument("--exaggeration", type=float, default=0.5)
    parser.add_argument("--cfg-weight", type=float, default=0.5)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is unavailable. Check NVIDIA driver and PyTorch installation.")

    text_path = Path(args.text_file)
    output_path = Path(args.output)
    text = text_path.read_text(encoding="utf-8").strip()
    if not text:
        raise ValueError(f"Text file is empty: {text_path}")

    output_path.parent.mkdir(parents=True, exist_ok=True)

    model = ChatterboxMultilingualTTS.from_pretrained(device="cuda", t3_model="v3")
    kwargs = {
        "language_id": args.language,
        "exaggeration": args.exaggeration,
        "cfg_weight": args.cfg_weight,
    }
    if args.voice:
        kwargs["audio_prompt_path"] = str(Path(args.voice).resolve())

    with torch.inference_mode():
        wav = model.generate(text, **kwargs)

    ta.save(str(output_path), wav.cpu(), model.sr)
    print(f"Saved: {output_path}")


if __name__ == "__main__":
    main()
