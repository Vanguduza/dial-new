"""Image-to-mesh pilot, NOT a registered-parts provider or production pack builder."""
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import re
import struct
import time
import uuid
from concurrent.futures import TimeoutError as FutureTimeout
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import urlopen

SPACE_ID = "microsoft/TRELLIS.2"
SPACE_URL = "https://microsoft-trellis-2.hf.space"
VERSION = "0.1.0"
EXPECTED_PARAMETERS = {
    "/start_session": [],
    "/preprocess_image": ["input"],
    "/image_to_3d": [
        "image", "seed", "resolution", "ss_guidance_strength", "ss_guidance_rescale",
        "ss_sampling_steps", "ss_rescale_t", "shape_slat_guidance_strength",
        "shape_slat_guidance_rescale", "shape_slat_sampling_steps", "shape_slat_rescale_t",
        "tex_slat_guidance_strength", "tex_slat_guidance_rescale", "tex_slat_sampling_steps",
        "tex_slat_rescale_t",
    ],
    "/extract_glb": ["decimation_target", "texture_size"],
}
STAGE_TIMEOUT = 600
MAX_FILE = 128 * 1024 * 1024


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def confined(root: Path, value: str) -> Path:
    path = (root / value).resolve()
    if not path.is_relative_to(root.resolve()) or path == root.resolve():
        raise ValueError("Path must stay inside the workspace")
    return path


def write_json(path: Path, value: object) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    temporary.replace(path)


def read_input(workspace: Path, input_file: str) -> tuple[dict, Path]:
    spec = json.loads(confined(workspace, input_file).read_text(encoding="utf-8"))
    required = {"pilotVersion", "visualFamilyId", "hero", "source", "seed", "resolution"}
    if not isinstance(spec, dict) or set(spec) != required or spec["pilotVersion"] != "1.0.0":
        raise ValueError("Invalid pilot input contract")
    if not re.fullmatch(r"VF-[A-Z0-9-]+", spec["visualFamilyId"]):
        raise ValueError("Invalid visual-family ID")
    if spec["resolution"] not in ("512", "1024"):
        raise ValueError("The free pilot supports only 512 and 1024 resolutions")
    if type(spec["seed"]) is not int or not 0 <= spec["seed"] <= 2147483647:
        raise ValueError("Seed must be an integer between 0 and 2147483647")
    hero = spec["hero"]
    if not isinstance(hero, dict) or set(hero) != {"file", "sha256"}:
        raise ValueError("Hero must contain file and sha256")
    path = confined(workspace, hero["file"])
    if not path.is_file() or path.stat().st_size > 20 * 1024 * 1024:
        raise ValueError("Hero is missing or exceeds 20 MB")
    if digest(path.read_bytes()) != hero["sha256"]:
        raise ValueError("Hero hash mismatch; no upload attempted")
    return spec, path


def inspect_contract(api: dict) -> None:
    endpoints = api.get("named_endpoints", {})
    for name, expected in EXPECTED_PARAMETERS.items():
        actual = [item.get("parameter_name") for item in endpoints.get(name, {}).get("parameters", [])]
        if name not in endpoints or actual != expected:
            raise ValueError("Public Space API changed: " + name)


def public_metadata() -> dict:
    # Fixed official endpoint: no arbitrary URL, private repo or catalog fetch.
    with urlopen("https://huggingface.co/api/spaces/" + SPACE_ID, timeout=45) as response:
        raw = response.read(1024 * 1024 + 1)
    if len(raw) > 1024 * 1024:
        raise ValueError("Space metadata exceeds limit")
    info = json.loads(raw)
    runtime = info.get("runtime", {})
    if info.get("id") != SPACE_ID or info.get("host") != SPACE_URL:
        raise ValueError("Unexpected provider identity")
    if runtime.get("stage") != "RUNNING" or runtime.get("hardware", {}).get("current") != "zero-a10g":
        raise ValueError("Public demo is not currently running on ZeroGPU")
    return {"spaceId": SPACE_ID, "url": SPACE_URL, "revision": info.get("sha"),
            "runtimeRevision": runtime.get("sha"), "hardware": "zero-a10g", "stage": "RUNNING"}


def returned_file(value: object, downloads: Path) -> Path:
    if isinstance(value, (list, tuple)):
        if not value:
            raise ValueError("Provider returned no file")
        value = value[0]
    if isinstance(value, dict):
        value = value.get("path")
    if not isinstance(value, str):
        raise ValueError("Provider did not return a downloaded file")
    path = confined(downloads, value)
    if not path.is_file() or path.stat().st_size > MAX_FILE:
        raise ValueError("Provider file is missing or too large")
    return path


class PreviewImages(HTMLParser):
    """Extract only known embedded JPEGs. Never persist/execute provider HTML or scripts."""
    def __init__(self) -> None:
        super().__init__()
        self.images: dict[str, bytes] = {}

    def handle_starttag(self, tag: str, attrs: list) -> None:
        attrs = dict(attrs)
        name = attrs.get("id", "")
        if tag != "img" or not re.fullmatch(r"view-m[0-5]-s[0-7]", name):
            return
        prefix = "data:image/jpeg;base64,"
        src = attrs.get("src", "")
        if not src.startswith(prefix) or len(src) > 8 * 1024 * 1024 or name in self.images:
            raise ValueError("Invalid or duplicate preview image")
        data = base64.b64decode(src[len(prefix):], validate=True)
        if not data.startswith(b"\xff\xd8"):
            raise ValueError("Invalid JPEG preview")
        self.images[name] = data


def validate_glb(path: Path) -> dict:
    import numpy as np
    import trimesh
    data = path.read_bytes()
    if len(data) < 20 or len(data) > MAX_FILE:
        raise ValueError("Invalid GLB size")
    magic, version, length = struct.unpack_from("<4sII", data)
    if magic != b"glTF" or version != 2 or length != len(data):
        raise ValueError("Invalid GLB header")
    json_length, chunk_type = struct.unpack_from("<II", data, 12)
    if chunk_type != 0x4E4F534A or json_length > len(data) - 20:
        raise ValueError("Missing GLB JSON")
    document = json.loads(data[20:20 + json_length])
    # A result must be self-contained. Do not let mesh loaders resolve external paths/URLs.
    if any("uri" in item for key in ("buffers", "images") for item in document.get(key, [])):
        raise ValueError("GLB contains external resource references")
    scene = trimesh.load(io.BytesIO(data), file_type="glb", force="scene", process=False)
    geometries = list(scene.geometry.values())
    if not geometries or any(not isinstance(mesh, trimesh.Trimesh) for mesh in geometries):
        raise ValueError("No triangle mesh in GLB")
    faces = sum(len(mesh.faces) for mesh in geometries)
    vertices = sum(len(mesh.vertices) for mesh in geometries)
    if faces == 0 or vertices == 0:
        raise ValueError("Empty mesh")
    for mesh in geometries:
        if not np.isfinite(mesh.vertices).all() or not np.isfinite(mesh.bounds).all():
            raise ValueError("Non-finite mesh coordinates")
        if mesh.faces.min() < 0 or mesh.faces.max() >= len(mesh.vertices):
            raise ValueError("Invalid mesh face indices")
    return {"status": "PASS", "geometryCount": len(geometries), "vertices": vertices,
            "triangles": faces, "materials": len(document.get("materials", [])),
            "embeddedImages": len(document.get("images", [])),
            "detail": "Nonempty finite mesh; geometry groups are NOT semantic vehicle parts"}


def failure_kind(error: Exception) -> str:
    text = str(error).lower()
    if "quota" in text or "rate limit" in text or "429" in text:
        return "QUOTA_WAIT"
    if any(term in text for term in ("sign in", "sign up", "log in", "login", "unauthorized", "401", "403")):
        return "AUTH_REQUIRED"
    if isinstance(error, FutureTimeout) or "timed out" in text:
        return "REMOTE_TIMEOUT"
    return "REMOTE_OR_VALIDATION_FAILURE"


def call(client, name: str, events: list, receipt: Path, state: dict, **kwargs):
    start = time.monotonic()
    event = {"endpoint": name, "state": "SUBMITTED"}
    events.append(event)
    write_json(receipt, state)
    print(json.dumps({"stage": name, "state": "SUBMITTED"}), flush=True)
    try:
        job = client.submit(api_name=name, **kwargs)
        result = job.result(timeout=STAGE_TIMEOUT)
    except FutureTimeout:
        if "job" in locals():
            try:
                job.cancel()  # best effort; never submit a replacement here
            except Exception:
                pass
        event["state"] = "TIMEOUT_CANCELLATION_REQUESTED"
        raise
    except Exception:
        event["state"] = "FAILED"
        raise
    finally:
        event["wallSeconds"] = round(time.monotonic() - start, 3)
        write_json(receipt, state)
    event["state"] = "RETURNED"
    write_json(receipt, state)
    print(json.dumps({"stage": name, "state": "RETURNED", "wallSeconds": event["wallSeconds"]}), flush=True)
    return result


def connect(downloads: Path):
    from gradio_client import Client
    from huggingface_hub import get_token
    token = get_token()
    # No paid-provider API, provisioning, credit purchase, quota extension or retry loop.
    client = Client(SPACE_ID, token=token if token else False, verbose=False, max_workers=1,
                    download_files=str(downloads), httpx_kwargs={"timeout": 60})
    return client, bool(token)


def generate(workspace: Path, spec: dict, hero: Path) -> tuple[Path, dict]:
    from PIL import Image, ImageOps
    from gradio_client import handle_file
    Image.MAX_IMAGE_PIXELS = 20_000_000
    output = confined(workspace, "output/reconstruction-pilots/" + spec["visualFamilyId"] + "/" + uuid.uuid4().hex)
    output.mkdir(parents=True, exist_ok=False)
    downloads = output / "downloads"
    downloads.mkdir()
    receipt = output / "receipt.json"
    state = {"pilotVersion": "1.0.0", "clientVersion": VERSION, "state": "STARTING",
             "visualFamilyId": spec["visualFamilyId"], "heroSha256": spec["hero"]["sha256"],
             "source": spec["source"], "settings": {"seed": spec["seed"], "resolution": spec["resolution"],
             "samplingSteps": 12, "decimationTarget": 100000, "textureSize": 1024},
             "customerReady": False, "registeredScene": None, "productionPack": None,
             "semanticParts": "NOT_MEASURED", "wheelMultiplicity": "NOT_MEASURED",
             "heroCameraRegistration": "NOT_MEASURED", "epcMapping": "NOT_MEASURED",
             "humanReview": "PENDING", "events": [], "assets": [],
             "externalProcessing": [SPACE_ID, "briaai/BRIA-RMBG-2.0 (upstream background removal for opaque input)"],
             "limits": {"automaticRetries": 0, "maxGpuCalls": 2, "stageTimeoutSeconds": STAGE_TIMEOUT}}
    write_json(receipt, state)
    client = None
    try:
        # Normalize orientation and strip EXIF before upload. Keep the original hash, never replace source.
        with Image.open(hero) as source:
            if source.format not in ("PNG", "JPEG", "WEBP") or getattr(source, "n_frames", 1) != 1:
                raise ValueError("Pilot accepts a single PNG/JPEG/WebP image")
            if source.width * source.height > Image.MAX_IMAGE_PIXELS:
                raise ValueError("Image exceeds pixel limit")
            clean = ImageOps.exif_transpose(source).convert("RGBA")
            clean.info.clear()
            clean.save(output / "hero-upload.png")
        state["provider"] = public_metadata()
        client, state["authenticated"] = connect(downloads)
        api = client.view_api(return_format="dict", print_info=False)
        inspect_contract(api)
        write_json(output / "api-contract.json", api)
        call(client, "/start_session", state["events"], receipt, state)
        preprocessed = call(client, "/preprocess_image", state["events"], receipt, state,
                            input=handle_file(str(output / "hero-upload.png")))
        prepared_path = returned_file(preprocessed, downloads)
        with Image.open(prepared_path) as prepared:
            if prepared.width > 2048 or prepared.height > 2048:
                raise ValueError("Unexpected preprocessing dimensions")
            prepared.load()
        (output / "model-input.png").write_bytes(prepared_path.read_bytes())
        state["state"] = "PREPROCESSED"
        write_json(receipt, state)
        # One Client instance keeps Gradio's private server-side latent state across both GPU calls.
        html = call(client, "/image_to_3d", state["events"], receipt, state,
            image=handle_file(str(output / "model-input.png")), seed=spec["seed"], resolution=spec["resolution"],
            ss_guidance_strength=7.5, ss_guidance_rescale=0.7, ss_sampling_steps=12, ss_rescale_t=5.0,
            shape_slat_guidance_strength=7.5, shape_slat_guidance_rescale=0.5, shape_slat_sampling_steps=12,
            shape_slat_rescale_t=3.0, tex_slat_guidance_strength=1.0, tex_slat_guidance_rescale=0.0,
            tex_slat_sampling_steps=12, tex_slat_rescale_t=3.0)
        if not isinstance(html, str) or len(html) > 100 * 1024 * 1024:
            raise ValueError("Invalid preview response")
        parser = PreviewImages()
        parser.feed(html)
        if len(parser.images) != 48:
            raise ValueError("Expected 48 same-mesh render previews")
        preview = output / "previews"
        preview.mkdir()
        for name, data in parser.images.items():
            with Image.open(io.BytesIO(data)) as image:
                image.verify()
            (preview / (name + ".jpg")).write_bytes(data)
        state["state"] = "PREVIEW_SAVED"
        write_json(receipt, state)
        result = call(client, "/extract_glb", state["events"], receipt, state,
                      decimation_target=100000, texture_size=1024)
        glb = returned_file(result, downloads)
        destination = output / "reconstruction.glb"
        destination.write_bytes(glb.read_bytes())
        state["meshValidation"] = validate_glb(destination)
        state["state"] = "MESH_CANDIDATE_REVIEW_PENDING"
    except Exception as error:
        state["state"] = failure_kind(error)
        # Do not persist provider error strings: these can contain tokens, URLs or server paths.
        state["failure"] = {"type": type(error).__name__, "stage": state["events"][-1]["endpoint"] if state["events"] else "CONNECT",
                            "message": "Request did not complete; no automatic retry or paid fallback was attempted."}
    finally:
        for file in sorted(output.rglob("*")):
            if file.is_file() and file.name != "receipt.json" and "downloads" not in file.relative_to(output).parts:
                data = file.read_bytes()
                state["assets"].append({"file": file.relative_to(output).as_posix(), "sha256": digest(data), "bytes": len(data)})
        write_json(receipt, state)
        if client is not None:
            try:
                client.close()
            except Exception:
                state["cleanup"] = "CLIENT_CLOSE_FAILED"
                write_json(receipt, state)
    return output, state


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("inspect", "generate"))
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--input")
    parser.add_argument("--allow-upload", action="store_true", help="Explicitly consent to sending this one hero to the public demo and its preprocessing service")
    args = parser.parse_args()
    workspace = args.workspace.resolve(strict=True)
    if args.action == "inspect":
        metadata = public_metadata()
        scratch = confined(workspace, ".dvtg/trellis-inspection")
        scratch.mkdir(parents=True, exist_ok=True)
        client, authenticated = connect(scratch)
        try:
            api = client.view_api(return_format="dict", print_info=False)
            inspect_contract(api)
            metadata.update({"apiCompatible": True, "authenticated": authenticated, "gpuCalls": 0,
                             "endpoints": list(EXPECTED_PARAMETERS)})
            write_json(scratch / "connection.json", metadata)
            print(json.dumps(metadata, indent=2))
        finally:
            client.close()
        return 0
    if not args.input or not args.allow_upload:
        parser.error("generate requires --input and --allow-upload; nothing was uploaded")
    spec, hero = read_input(workspace, args.input)
    output, result = generate(workspace, spec, hero)
    print(json.dumps({"state": result["state"], "output": str(output), "customerReady": False}, indent=2))
    return 0 if result["state"] == "MESH_CANDIDATE_REVIEW_PENDING" else 2


if __name__ == "__main__":
    raise SystemExit(main())
