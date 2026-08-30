"""Local transport/guard tests only; not evidence of real-vehicle reconstruction quality."""
import base64
import copy
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import trimesh
from PIL import Image
import pilot


def contract():
    return {"named_endpoints": {name: {"parameters": [{"parameter_name": p} for p in params]}
                                for name, params in pilot.EXPECTED_PARAMETERS.items()}}


class PilotTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.hero = self.root / "hero.png"
        Image.new("RGB", (128, 72), "white").save(self.hero)
        self.spec = {"pilotVersion": "1.0.0", "visualFamilyId": "VF-TEST-ONLY",
                     "hero": {"file": "hero.png", "sha256": pilot.digest(self.hero.read_bytes())},
                     "source": {"license": "synthetic test"}, "seed": 0, "resolution": "512"}

    def test_path_confinement(self):
        for path in ("..", "../secret", str(self.root.parent / "outside"), "."):
            with self.assertRaises(ValueError):
                pilot.confined(self.root, path)
        self.assertEqual(pilot.confined(self.root, "inside/result"), self.root / "inside/result")

    def test_hash_before_network(self):
        self.spec["hero"]["sha256"] = "0" * 64
        (self.root / "job.json").write_text(json.dumps(self.spec))
        with self.assertRaisesRegex(ValueError, "hash mismatch"):
            pilot.read_input(self.root, "job.json")

    def test_small_budget_and_strict_contract(self):
        for field, value in (("resolution", "1536"), ("seed", True), ("seed", -1), ("pilotVersion", "2")):
            changed = {**self.spec, field: value}
            (self.root / "job.json").write_text(json.dumps(changed))
            with self.assertRaises(ValueError):
                pilot.read_input(self.root, "job.json")

    def test_api_drift(self):
        api = contract()
        pilot.inspect_contract(api)
        api["named_endpoints"]["/extract_glb"]["parameters"].reverse()
        with self.assertRaisesRegex(ValueError, "API changed"):
            pilot.inspect_contract(api)

    def test_reject_provider_local_file_escape(self):
        with self.assertRaises(ValueError):
            pilot.returned_file(str(self.root.parent / "secret"), self.root)
        with self.assertRaises(ValueError):
            pilot.returned_file("https://untrusted.example/a.glb", self.root)

    def test_preview_extraction_never_executes_html(self):
        parser = pilot.PreviewImages()
        raw = b"\xff\xd8test"
        parser.feed('<script>alert(1)</script><img src="https://untrusted.example/a.jpg">' +
                    '<img id="view-m3-s0" src="data:image/jpeg;base64,' + base64.b64encode(raw).decode() + '">')
        self.assertEqual(parser.images, {"view-m3-s0": raw})
        with self.assertRaises(ValueError):
            parser.feed('<img id="view-m3-s0" src="data:image/jpeg;base64,' + base64.b64encode(raw).decode() + '">')

    def test_real_mesh_load(self):
        file = self.root / "test.glb"
        file.write_bytes(trimesh.creation.box().export(file_type="glb"))
        self.assertEqual(pilot.validate_glb(file)["triangles"], 12)
        file.write_bytes(b"<html>error</html>")
        with self.assertRaises(ValueError):
            pilot.validate_glb(file)

    def test_failure_categories(self):
        self.assertEqual(pilot.failure_kind(RuntimeError("quota exceeded")), "QUOTA_WAIT")
        self.assertEqual(pilot.failure_kind(RuntimeError("Please sign in")), "AUTH_REQUIRED")
        self.assertEqual(pilot.failure_kind(TimeoutError()), "REMOTE_TIMEOUT")

    def test_quota_failure_preserves_evidence_without_retry(self):
        test = self
        calls = []
        class Job:
            def __init__(self, result=None, error=None):
                self.value, self.error = result, error
            def result(self, timeout):
                if self.error:
                    raise self.error
                return self.value
        class Client:
            def __init__(self, downloads):
                self.downloads = downloads
            def view_api(self, **kwargs):
                return contract()
            def close(self):
                pass
            def submit(self, api_name, **kwargs):
                calls.append(api_name)
                if api_name == "/start_session":
                    return Job()
                if api_name == "/preprocess_image":
                    path = self.downloads / "prepared.png"
                    path.write_bytes(test.hero.read_bytes())
                    return Job(str(path))
                return Job(error=RuntimeError("quota exceeded; secret hf_DO_NOT_PERSIST"))
        with patch.object(pilot, "connect", side_effect=lambda downloads: (Client(downloads), False)), \
             patch.object(pilot, "public_metadata", return_value={"spaceId": pilot.SPACE_ID}):
            output, state = pilot.generate(self.root, self.spec, self.hero)
        self.assertEqual(calls, ["/start_session", "/preprocess_image", "/image_to_3d"])
        self.assertEqual(state["state"], "QUOTA_WAIT")
        self.assertFalse(state["customerReady"])
        self.assertIsNone(state["registeredScene"])
        self.assertEqual(state["events"][-1]["state"], "FAILED")
        self.assertTrue((output / "model-input.png").is_file())
        self.assertNotIn("hf_DO_NOT_PERSIST", (output / "receipt.json").read_text())


if __name__ == "__main__":
    unittest.main()
