import argparse
from pathlib import Path

import torch
import torchaudio as ta
from chatterbox.mtl_tts import ChatterboxMultilingualTTS


def load_model() -> ChatterboxMultilingualTTS:
    """Load V3 when supported, otherwise use the package default checkpoint."""
    try:
        return ChatterboxMultilingualTTS.from_pretrained(device="cuda", t3_model="v3")
    except TypeError as error:
        if "unexpected keyword argument 't3_model'" not in str(error):
            raise
        print(
            "Installed Chatterbox does not expose t3_model; using its default multilingual checkpoint.",
            flush=True,
        )
        return ChatterboxMultilingualTTS.from_pretrained(device="cuda")


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
    model = load_model()
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
