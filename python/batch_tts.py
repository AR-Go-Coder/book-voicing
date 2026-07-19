import argparse
import json
import random
from pathlib import Path

import perth
import torch
import torchaudio as ta


class PassThroughWatermarker:
    """Fallback used only when Perth cannot expose its native watermarker."""

    def __init__(self, *args, **kwargs) -> None:
        pass

    def apply_watermark(self, audio, *args, **kwargs):
        return audio

    def get_watermark(self, audio, *args, **kwargs):
        return 0.0


def prepare_perth() -> None:
    if callable(getattr(perth, "PerthImplicitWatermarker", None)):
        return

    try:
        from perth.perth_net.perth_net_implicit.perth_watermarker import (
            PerthImplicitWatermarker,
        )

        perth.PerthImplicitWatermarker = PerthImplicitWatermarker
        print("Recovered PerthImplicitWatermarker from its internal module.", flush=True)
    except Exception as error:
        perth.PerthImplicitWatermarker = PassThroughWatermarker
        print(
            "Warning: Perth watermarker is unavailable; continuing without audio watermarking. "
            f"Reason: {type(error).__name__}: {error}",
            flush=True,
        )


prepare_perth()
from chatterbox.mtl_tts import ChatterboxMultilingualTTS


def load_model() -> ChatterboxMultilingualTTS:
    """Require Multilingual V3 instead of silently falling back to V2."""
    try:
        model = ChatterboxMultilingualTTS.from_pretrained(device="cuda", t3_model="v3")
    except TypeError as error:
        if "unexpected keyword argument 't3_model'" in str(error):
            raise RuntimeError(
                "This Chatterbox installation does not support Multilingual V3. "
                "Rebuild the environment with: powershell -ExecutionPolicy Bypass "
                "-File scripts/setup-windows.ps1 -ResetVenv"
            ) from error
        raise
    print("Loaded Chatterbox Multilingual V3.", flush=True)
    return model


def duration_seconds(wav: torch.Tensor, sample_rate: int) -> float:
    return float(wav.shape[-1]) / float(sample_rate)


def suspicious_duration(text: str, duration: float) -> bool:
    # Russian narration normally falls roughly between 7 and 22 visible chars/second.
    visible_chars = max(1, sum(not char.isspace() for char in text))
    chars_per_second = visible_chars / max(duration, 0.01)
    return duration < 0.7 or chars_per_second < 5.0 or chars_per_second > 28.0


def generate_with_retries(model, text: str, common: dict, retries: int):
    last_wav = None
    for attempt in range(retries + 1):
        seed = random.SystemRandom().randint(1, 2_147_483_647)
        torch.manual_seed(seed)
        torch.cuda.manual_seed_all(seed)

        params = dict(common)
        if attempt > 0:
            params["temperature"] = max(0.55, float(common["temperature"]) - 0.08 * attempt)
            params["repetition_penalty"] = min(1.5, float(common["repetition_penalty"]) + 0.08 * attempt)
            print(
                f"  retry {attempt}/{retries}: seed={seed}, "
                f"temperature={params['temperature']:.2f}, "
                f"repetition_penalty={params['repetition_penalty']:.2f}",
                flush=True,
            )

        with torch.inference_mode():
            wav = model.generate(text, **params)
        last_wav = wav
        duration = duration_seconds(wav, model.sr)
        if not suspicious_duration(text, duration):
            return wav, duration
        print(f"  suspicious duration {duration:.2f}s for {len(text)} chars", flush=True)

    return last_wav, duration_seconds(last_wav, model.sr)


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
    model = load_model()

    common = {
        "language_id": job.get("language", "ru"),
        "exaggeration": float(job.get("exaggeration", 0.25)),
        "cfg_weight": float(job.get("cfgWeight", 0.3)),
        "temperature": float(job.get("temperature", 0.72)),
        "repetition_penalty": float(job.get("repetitionPenalty", 1.3)),
        "min_p": float(job.get("minP", 0.05)),
        "top_p": float(job.get("topP", 0.95)),
    }
    retries = int(job.get("retries", 2))
    voice = job.get("voice")
    if voice:
        common["audio_prompt_path"] = str(Path(voice).resolve())

    for index, item in enumerate(items, start=1):
        text_path = Path(item["textFile"]).resolve()
        output = Path(item["output"]).resolve()
        temporary = output.with_name(f"{output.stem}.part{output.suffix}")
        text = text_path.read_text(encoding="utf-8").strip()
        if not text:
            raise ValueError(f"Empty chunk: {text_path}")

        output.parent.mkdir(parents=True, exist_ok=True)
        temporary.unlink(missing_ok=True)
        print(f"[{index}/{len(items)}] {output.name}", flush=True)

        try:
            wav, duration = generate_with_retries(model, text, common, retries)
            ta.save(str(temporary), wav.cpu(), model.sr)
            temporary.replace(output)
            print(f"  saved {duration:.2f}s", flush=True)
        except Exception:
            temporary.unlink(missing_ok=True)
            raise

        if index % 10 == 0:
            torch.cuda.empty_cache()

    print(f"Generated {len(items)} chunks.", flush=True)


if __name__ == "__main__":
    main()