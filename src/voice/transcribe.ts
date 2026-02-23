import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createSubsystemLogger } from "../logging/subsystem.js";
import type { TranscriptionRequest, TranscriptionResult } from "./types.js";

const log = createSubsystemLogger("voice:transcribe");

export function isWhisperAvailable(): boolean {
  try {
    const result = spawnSync("which", ["whisper"], { encoding: "utf8" });
    return result.status === 0;
  } catch {
    return false;
  }
}

export async function transcribeAudio(req: TranscriptionRequest): Promise<TranscriptionResult> {
  const start = Date.now();

  if (!existsSync(req.audioPath)) {
    return { ok: false, error: `Audio file not found: ${req.audioPath}` };
  }

  if (!isWhisperAvailable()) {
    return {
      ok: false,
      error:
        "whisper CLI not available. Install with: pip install openai-whisper or brew install openai-whisper",
    };
  }

  const outDir = mkdtempSync(path.join(tmpdir(), "voice-"));
  try {
    const args = [
      req.audioPath,
      "--model",
      "base",
      "--output_format",
      "txt",
      "--output_dir",
      outDir,
      "--fp16",
      "False",
    ];
    if (req.language && req.language !== "auto") {
      args.push("--language", req.language);
    }

    const result = spawnSync("whisper", args, {
      encoding: "utf8",
      timeout: 120_000,
    });

    if (result.status !== 0) {
      log.warn(`whisper failed: ${result.stderr}`);
      return { ok: false, error: result.stderr || "whisper exited with non-zero status" };
    }

    // Find the output .txt file
    const baseName = path.basename(req.audioPath, path.extname(req.audioPath));
    const outputFile = path.join(outDir, `${baseName}.txt`);

    if (!existsSync(outputFile)) {
      return { ok: false, error: "whisper did not produce output file" };
    }

    const text = readFileSync(outputFile, "utf-8").trim();
    return { ok: true, text, durationMs: Date.now() - start };
  } finally {
    try {
      rmSync(outDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}
