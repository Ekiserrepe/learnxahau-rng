#!/usr/bin/env bash
# Compiles every hook in hooks/*.c into build/*.wasm
# Requires an LLVM clang with the wasm32 target and wasm-ld
# (e.g. `brew install llvm lld` on macOS, `apt install clang lld` on Linux).
set -euo pipefail
cd "$(dirname "$0")/.."

CLANG="${CLANG:-$(command -v /opt/homebrew/opt/llvm/bin/clang || command -v clang)}"
mkdir -p build

for src in hooks/*.c; do
  out="build/$(basename "${src%.c}").wasm"
  # -mcpu=mvp: newer LLVM emits a DATACOUNT section that the Hook validator rejects
  "$CLANG" --target=wasm32 -mcpu=mvp -O2 -nostdlib \
    -Ihooks/include \
    -Wl,--no-entry -Wl,--allow-undefined \
    -Wl,--export=hook \
    -Wl,-z,stack-size=8192 -Wl,--initial-memory=65536 -Wl,--max-memory=65536 \
    -Wl,--strip-all \
    -o "$out" "$src"
  echo "Built $out ($(wc -c < "$out" | tr -d ' ') bytes)"
done
