import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { MOTION_PROFILES } from "../../contracts/src/index.js";
import { stableStringify } from "../../pipeline-core/src/hash.js";
import { confinedExisting, digest, makeConfinedDirectory, readAsset } from "./assets.js";
import { SCENE_ENGINE_VERSION, SCENE_GATES } from "./contracts.js";

/** Content-addressed render checkpoints. Never trust cached bytes without rehashing them. */
export async function frameCache(output: string, sceneHash: string, heroHash: string) {
  const key = digest(stableStringify({ sceneHash, heroHash, engine: SCENE_ENGINE_VERSION, gates: SCENE_GATES, motion: MOTION_PROFILES, encoder: sharp.versions }));
  const root = await makeConfinedDirectory(output, `.frame-cache/${key}`);
  const name = (progress: number) => digest(progress.toPrecision(17));
  return {
    key,
    async get(progress: number) {
      try {
        const meta = JSON.parse(await readFile(await confinedExisting(root, `${name(progress)}.json`), "utf8"));
        if (meta.key !== key || meta.progress !== progress) return null;
        return await readAsset(root, { file: `${name(progress)}.webp`, sha256: meta.sha256 });
      } catch { return null; }
    },
    async put(progress: number, bytes: Buffer) {
      // A crash between these writes leaves an untrusted receipt and triggers a safe rerender.
      await writeFile(join(root, `${name(progress)}.webp`), bytes);
      await writeFile(join(root, `${name(progress)}.json`), JSON.stringify({ key, progress, sha256: digest(bytes) }));
    },
  };
}
