import argparse
import json
from pathlib import Path

import torch
import torchaudio as ta
from chatterbox.mtl_tts import ChatterboxMultilingualTTS


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate audiobook chunks with one model load")
    parser.add_argument("--job", required=True)
    args = parser.parse_args()

    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is unavailable. Check NVIDIA driver and PyTorch installation.")

    job_path = Path(args.job).resolve()
    job = json.loads(job_path.read_text(encoding="utf-8"))
    items = job.get("items", [])
    if not items:
        print("No pending chunks.", flush=True)
        return

    print(f"Loading Chatterbox on {torch.cuda.get_device_name(0)}...", flush=True)
    model = ChatterboxMultilingualTTS.from_pretrained(device="cuda", t3_model="v3")

    common = {
        "language_id": job.get("language", "ru"),
        "exaggeration": float(job.get("exaggeration", 0.5)),
        "cfg_weight": float(job.get("cfgWeight", 0.5)),
    }
    voice = job.get("voice")
    if voice:
        common["audio_prompt_path"] = str(Path(voice).resolve())

    for index, item in enumerate(items, start=1):
        text_path = Path(item["textFile"]).resolve()
        output = Path(item["output"]).resolve()
        temporary = output.with_suffix(output.suffix + ".part")
        text = text_path.read_text(encoding="utf-8").strip()
        if not text:
            raise ValueError(f"Empty chunk: {text_path}")

        output.parent.mkdir(parents=True, exist_ok=True)
        temporary.unlink(missing_ok=True)
        print(f"[{index}/{len(items)}] {output.name}", flush=True)

        try:
            with torch.inference_mode():
                wav = model.generate(text, **common)
            ta.save(str(temporary), wav.cpu(), model.sr, format="wav")
            temporary.replace(output)
        except Exception:
            temporary.unlink(missing_ok=True)
            raise

        if index % 10 == 0:
            torch.cuda.empty_cache()

    print(f"Generated {len(items)} chunks.", flush=True)


if __name__ == "__main__":
    main()
