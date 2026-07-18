import argparse
import json
from pathlib import Path

import torch
import torchaudio as ta
from chatterbox.mtl_tts import ChatterboxMultilingualTTS


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--job", required=True)
    args = parser.parse_args()

    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is unavailable. Check NVIDIA driver and PyTorch installation.")

    job = json.loads(Path(args.job).read_text(encoding="utf-8"))
    model = ChatterboxMultilingualTTS.from_pretrained(device="cuda", t3_model="v3")

    common = {
        "language_id": job.get("language", "ru"),
        "exaggeration": float(job.get("exaggeration", 0.5)),
        "cfg_weight": float(job.get("cfgWeight", 0.5)),
    }
    voice = job.get("voice")
    if voice:
        common["audio_prompt_path"] = voice

    items = job["items"]
    for index, item in enumerate(items, start=1):
        text = Path(item["textFile"]).read_text(encoding="utf-8").strip()
        output = Path(item["output"])
        output.parent.mkdir(parents=True, exist_ok=True)
        print(f"[{index}/{len(items)}] {output.name}", flush=True)
        with torch.inference_mode():
            wav = model.generate(text, **common)
        ta.save(str(output), wav.cpu(), model.sr)


if __name__ == "__main__":
    main()
