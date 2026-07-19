import argparse
import sys

import torch


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Verify PyTorch CUDA and Chatterbox installation")
    parser.add_argument("--require-cuda", action="store_true")
    parser.add_argument("--check-chatterbox", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    print(f"PyTorch: {torch.__version__}")
    print(f"CUDA available: {torch.cuda.is_available()}")
    print(f"PyTorch CUDA runtime: {torch.version.cuda}")

    if args.require_cuda and not torch.cuda.is_available():
        raise RuntimeError(
            "CUDA is unavailable. A CPU-only PyTorch build may be installed, "
            "or the NVIDIA driver is not accessible."
        )

    if torch.cuda.is_available():
        device = torch.device("cuda:0")
        print(f"GPU: {torch.cuda.get_device_name(device)}")
        props = torch.cuda.get_device_properties(device)
        print(f"VRAM: {props.total_memory / 1024 ** 3:.1f} GB")

        value = (torch.ones(1024, device=device) * 2).sum().item()
        if value != 2048:
            raise RuntimeError(f"Unexpected CUDA calculation result: {value}")
        print("CUDA tensor test: OK")

    if args.check_chatterbox:
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS

        if ChatterboxMultilingualTTS is None:
            raise RuntimeError("ChatterboxMultilingualTTS import returned no class")
        print("Chatterbox import: OK")

    print("Environment verification: OK")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Verification failed: {error}", file=sys.stderr)
        raise
