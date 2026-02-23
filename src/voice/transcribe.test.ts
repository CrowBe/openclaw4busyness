import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock node:child_process and node:fs before importing the module under test
vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  mkdtempSync: vi.fn(() => "/tmp/voice-test123"),
  rmSync: vi.fn(),
}));

vi.mock("node:os", () => ({
  tmpdir: vi.fn(() => "/tmp"),
}));

vi.mock("node:path", async () => {
  const actual = await vi.importActual<typeof import("node:path")>("node:path");
  return actual;
});

vi.mock("../logging/subsystem.js", () => ({
  createSubsystemLogger: () => ({
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    raw: vi.fn(),
    child: vi.fn(),
    isEnabled: vi.fn(() => false),
    subsystem: "voice:transcribe",
  }),
}));

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, mkdtempSync } from "node:fs";
import { isWhisperAvailable, transcribeAudio } from "./transcribe.js";

const mockSpawnSync = vi.mocked(spawnSync);
const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockMkdtempSync = vi.mocked(mkdtempSync);

beforeEach(() => {
  vi.clearAllMocks();
  // Default: mkdtempSync returns a stable temp dir
  mockMkdtempSync.mockReturnValue("/tmp/voice-test123");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isWhisperAvailable", () => {
  it("returns true when whisper is found (status 0)", () => {
    mockSpawnSync.mockReturnValue({
      status: 0,
      stdout: "/usr/local/bin/whisper\n",
      stderr: "",
      pid: 1234,
      output: [],
      signal: null,
    });
    expect(isWhisperAvailable()).toBe(true);
    expect(mockSpawnSync).toHaveBeenCalledWith("which", ["whisper"], { encoding: "utf8" });
  });

  it("returns false when whisper is not found (status 1)", () => {
    mockSpawnSync.mockReturnValue({
      status: 1,
      stdout: "",
      stderr: "",
      pid: 1234,
      output: [],
      signal: null,
    });
    expect(isWhisperAvailable()).toBe(false);
  });

  it("returns false when spawnSync throws", () => {
    mockSpawnSync.mockImplementation(() => {
      throw new Error("spawn failed");
    });
    expect(isWhisperAvailable()).toBe(false);
  });

  it("returns false when status is null", () => {
    mockSpawnSync.mockReturnValue({
      status: null,
      stdout: "",
      stderr: "",
      pid: 1234,
      output: [],
      signal: null,
    });
    expect(isWhisperAvailable()).toBe(false);
  });
});

describe("transcribeAudio", () => {
  describe("file not found", () => {
    it("returns error when audio file does not exist", async () => {
      mockExistsSync.mockReturnValue(false);

      const result = await transcribeAudio({ audioPath: "/nonexistent/audio.wav" });

      expect(result.ok).toBe(false);
      expect(result.error).toContain("/nonexistent/audio.wav");
      expect(result.error).toContain("not found");
    });

    it("does not call spawnSync when audio file is missing", async () => {
      mockExistsSync.mockReturnValue(false);

      await transcribeAudio({ audioPath: "/missing.wav" });

      expect(mockSpawnSync).not.toHaveBeenCalled();
    });
  });

  describe("whisper not available", () => {
    it("returns error when whisper CLI is not available", async () => {
      // File exists, but whisper is not found
      mockExistsSync.mockImplementation((filePath) => {
        // Audio file exists, but output file does not
        return String(filePath) === "/audio/test.wav";
      });
      mockSpawnSync.mockReturnValue({
        status: 1,
        stdout: "",
        stderr: "",
        pid: 1234,
        output: [],
        signal: null,
      });

      const result = await transcribeAudio({ audioPath: "/audio/test.wav" });

      expect(result.ok).toBe(false);
      expect(result.error).toContain("whisper CLI not available");
    });

    it("error message includes install instructions", async () => {
      mockExistsSync.mockImplementation((filePath) => String(filePath) === "/audio/test.wav");
      mockSpawnSync.mockReturnValue({
        status: 1,
        stdout: "",
        stderr: "",
        pid: 1234,
        output: [],
        signal: null,
      });

      const result = await transcribeAudio({ audioPath: "/audio/test.wav" });

      expect(result.error).toContain("pip install openai-whisper");
    });
  });

  describe("successful transcription", () => {
    it("returns transcribed text on success", async () => {
      // Audio file exists, whisper is found (status 0 for 'which'), output file exists
      mockExistsSync.mockImplementation(() => {
        // All calls return true: audio file check and output file check
        return true;
      });
      mockSpawnSync.mockImplementation((_cmd: string, args?: readonly string[]) => {
        if ((args ?? [])[0] === "whisper" || (_cmd === "which" && (args ?? [])[0] === "whisper")) {
          return { status: 0, stdout: "", stderr: "", pid: 1, output: [], signal: null };
        }
        return { status: 0, stdout: "", stderr: "", pid: 1, output: [], signal: null };
      });
      mockReadFileSync.mockReturnValue("Hello, this is the transcription." as never);

      const result = await transcribeAudio({ audioPath: "/audio/recording.wav" });

      expect(result.ok).toBe(true);
      expect(result.text).toBe("Hello, this is the transcription.");
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("whisper process failure", () => {
    it("returns error when whisper exits with non-zero status", async () => {
      let spawnCallCount = 0;
      mockExistsSync.mockImplementation((filePath) => String(filePath) === "/audio/test.wav");
      mockSpawnSync.mockImplementation((_cmd: string, _args?: readonly string[]) => {
        spawnCallCount++;
        if (spawnCallCount === 1) {
          // 'which whisper' succeeds
          return {
            status: 0,
            stdout: "/usr/bin/whisper",
            stderr: "",
            pid: 1,
            output: [],
            signal: null,
          };
        }
        // 'whisper ...' fails
        return {
          status: 1,
          stdout: "",
          stderr: "model not found",
          pid: 2,
          output: [],
          signal: null,
        };
      });

      const result = await transcribeAudio({ audioPath: "/audio/test.wav" });

      expect(result.ok).toBe(false);
      expect(result.error).toContain("model not found");
    });
  });

  describe("language option", () => {
    it('does not pass --language flag when language is "auto"', async () => {
      let spawnCallCount = 0;
      const capturedArgs: string[] = [];
      mockExistsSync.mockReturnValue(true);
      mockSpawnSync.mockImplementation((_cmd: string, args?: readonly string[]) => {
        spawnCallCount++;
        if (spawnCallCount === 1) {
          return {
            status: 0,
            stdout: "/usr/bin/whisper",
            stderr: "",
            pid: 1,
            output: [],
            signal: null,
          };
        }
        capturedArgs.push(...(args ?? []));
        return { status: 0, stdout: "", stderr: "", pid: 2, output: [], signal: null };
      });
      mockReadFileSync.mockReturnValue("text" as never);

      await transcribeAudio({ audioPath: "/audio/test.wav", language: "auto" });

      expect(capturedArgs).not.toContain("--language");
    });

    it("passes --language flag when language is set to a specific locale", async () => {
      let spawnCallCount = 0;
      const capturedArgs: string[] = [];
      mockExistsSync.mockReturnValue(true);
      mockSpawnSync.mockImplementation((_cmd: string, args?: readonly string[]) => {
        spawnCallCount++;
        if (spawnCallCount === 1) {
          return {
            status: 0,
            stdout: "/usr/bin/whisper",
            stderr: "",
            pid: 1,
            output: [],
            signal: null,
          };
        }
        capturedArgs.push(...(args ?? []));
        return { status: 0, stdout: "", stderr: "", pid: 2, output: [], signal: null };
      });
      mockReadFileSync.mockReturnValue("text" as never);

      await transcribeAudio({ audioPath: "/audio/test.wav", language: "en" });

      expect(capturedArgs).toContain("--language");
      expect(capturedArgs).toContain("en");
    });
  });
});
