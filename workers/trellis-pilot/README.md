# DIAL — public ZeroGPU reconstruction pilot

This is a **local client of the existing `microsoft/TRELLIS.2` Space**, not a newly
hosted DIAL Space. It creates a whole-object 3D mesh candidate. It does not yet
separate semantic vehicle parts, align a reconstructed camera to the hero, build
an exploded transition, or enable EPC clicks. No production readiness changes.

## Use

From the repository root, with `uv` installed:

```powershell
./workers/trellis-pilot/run.ps1 -Action inspect
./workers/trellis-pilot/run.ps1 -Action test
./workers/trellis-pilot/run.ps1 -Action generate -InputFile workers/trellis-pilot/acura-cl.pilot.json -AllowUpload
```

`inspect` fetches the provider identity/runtime and validates the public API; it
does not submit images or spend GPU quota. `generate` requires explicit upload
consent. Input files and output paths must stay inside the workspace. The sample
uses the original public-domain Acura photograph, not any rejected generated
Acura views. Its appearance scope is only the photographed generation.

The input photo is checked against its SHA-256, orientation-normalized and
stripped of EXIF. Only that image and inference settings are transmitted; no
catalog, project folder, vehicle-owner details, or local credential is put into
the upload. Microsoft's current opaque-image preprocessing forwards the image
to `briaai/BRIA-RMBG-2.0` on Hugging Face. Do not use private customer images in
this public pilot. That preprocessing dependency has separate production terms;
this pilot does not establish its suitability for commercial deployment.

Both GPU stages use the **same Gradio client session** so extraction uses the
latents produced during generation. No browser cookies, private latent state or
session tokens are extracted. A legitimate Hugging Face CLI login under
`.dvtg/huggingface/auth` (or an explicitly configured `HF_TOKEN`) is used if
available. Otherwise the supported anonymous API is attempted. Browser sign-in
does not automatically authenticate this local client.

## Limits and artifacts

- Fixed public provider and ZeroGPU hardware check; no provisioning or paid fallback.
- One vehicle per invocation; two GPU calls at most; no automatic retries.
- Fixed seed, explicit sampler settings, 512 default / 1024 optional resolution.
- 10-minute client wait bound per stage, including queue time. Timeout cancellation
  is best-effort and does not prove that a remote GPU task stopped immediately.
- Quota/auth failures are saved, not retried or bypassed. The free service is not
  a production capacity or uptime guarantee. Do not automate the entire catalog
  against this shared demo.
- `output/reconstruction-pilots/<visualFamilyId>/<unique-attempt>/receipt.json`
  records source hash, upstream revision, settings, stage times and artifact hashes.
- Preprocessing is saved before generation; previews are saved before extraction.
  A failed later stage therefore does not discard earlier evidence.
- Provider HTML is not executed or saved as a page. Only validated embedded JPEG
  previews are extracted. The GLB is checked for a valid header, self-contained
  resources, real nonempty triangle meshes and finite coordinates.
- Download the model locally before the public demo's transient session expires.
  Generated latent state is server-owned and cannot be durably resumed by this
  client; a future self-hosted worker is needed for full stage checkpointing.
- `MESH_CANDIDATE_REVIEW_PENDING` is not a usable transition pack. Wheel count,
  vehicle identity, camera registration and EPC geometry remain unmeasured;
  human approval remains pending. Trimesh geometry count is not a parts count.

To feed the scene engine later, decompose and label the model, register a single
camera, export the engine's full-canvas component layers and foreground mask,
then supply a valid scene job to the existing guarded factory. Do not fabricate
seven categories from one mesh or register this pilot as a completed
`ReconstructionProvider` before that conversion exists.

Source references: [official Space](https://huggingface.co/spaces/microsoft/TRELLIS.2),
[current app](https://huggingface.co/spaces/microsoft/TRELLIS.2/blob/main/app.py),
[API](https://microsoft-trellis-2.hf.space/gradio_api/info),
[ZeroGPU quotas](https://huggingface.co/docs/hub/spaces-zerogpu).

Local unit tests check client guards and artifact handling, not the hosted GPU
or real-vehicle visual quality. Live verification must be reported separately.
