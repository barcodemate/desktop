import { writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * A fresh profile meets the first-run usage question, which sits in front of
 * the app until it is answered. Tests that are not about that question start
 * from a profile that has already answered it, and declined.
 */
export const settled = (userData: string) =>
  writeFile(path.join(userData, "usage.json"), JSON.stringify({ enabled: false, log: [] }));
