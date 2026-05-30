import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Validate a shell script using `bash -n`.
 * Returns null if valid, or error message if invalid.
 */
export function validateScript(content: string): string | null {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dot-validate-"));
  const tmpFile = path.join(tmpDir, "script.sh");
  try {
    fs.writeFileSync(tmpFile, content, "utf-8");
    execFileSync("bash", ["-n", tmpFile], { encoding: "utf-8", stdio: "pipe" });
    return null;
  } catch (err: any) {
    return err.stderr?.trim() ?? err.message;
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true });
    } catch {}
  }
}
