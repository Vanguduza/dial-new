# Dial a Spare Hero-Image Queue Package

This package turns the existing Dial visual-family catalog into a repeatable, licensed candidate-image acquisition queue.

## Included

- `catalog_coverage_universe.csv` — 125-manufacturer coverage universe.
- `make_model_family_index.csv` — 137 unique make/model-family pairs across 65 makes in the initial transition queue.
- `transition_visual_family_manifest.csv` — all 145 visual-family records (P0/P1/P2).
- `dial_a_spare_catalog_manifest.json` — machine-readable combined catalog.
- `MAKE_MODEL_LIST.md` — human-readable grouped make/model-family list.
- `hero_batch_downloader.py` — standard-library Python downloader/searcher.

## Locked design rules

1. `VISUAL_FAMILY_ID` is independent from `FITMENT_ID`.
2. One hero/transition pack may be reused where the customer would reasonably recognise the same visible car, while exact parts fitment remains separate.
3. 7zap is used only as a coverage/reference source. **The downloader does not scrape or download images from 7zap.**
4. Candidate images are searched first on Wikimedia Commons and then Openverse.
5. Only conservative licenses suitable for commercial use **and modification** are admitted automatically: public-domain/CC0, CC BY, and CC BY-SA.
6. Every downloaded file retains source URL, landing page, creator, license, attribution, dimensions, query and SHA-256.
7. Every candidate remains `PENDING` until a human approves vehicle identity, body/generation/facelift match, angle/background quality and license provenance.

## Run on Windows

Open PowerShell in this folder:

```powershell
python .\hero_batch_downloader.py --priority P0
```

Process P0 and P1:

```powershell
python .\hero_batch_downloader.py --priority P0,P1
```

Process the entire 145-family seed queue:

```powershell
python .\hero_batch_downloader.py --priority P0,P1,P2
```

Search only without downloading image bytes:

```powershell
python .\hero_batch_downloader.py --priority P0 --dry-run
```

Use only Wikimedia Commons:

```powershell
python .\hero_batch_downloader.py --priority P0 --sources commons
```

## Openverse authentication (recommended for large runs)

The script works anonymously at lower rate limits. For larger jobs, set Openverse credentials:

```powershell
$env:OPENVERSE_CLIENT_ID="your_client_id"
$env:OPENVERSE_CLIENT_SECRET="your_client_secret"
python .\hero_batch_downloader.py --priority P0,P1,P2
```

You can also set a descriptive user agent:

```powershell
$env:DIAL_ASSET_USER_AGENT="DialASpareHeroAssetQueue/1.0 (contact: assets@your-domain.example)"
```

## Output tree

```text
hero_queue/
  candidate_review.csv
  run_summary.json
  P0/
    VF-.../
      provenance.json
      candidates/
        01_wikimedia_commons_....jpg
        02_openverse_....jpg
```

`candidate_review.csv` is the gate into transition-pack development. Do not CGI-transform a candidate until `review_status` is explicitly changed from `PENDING` to an approved state in your asset workflow.

## Recommended first run

Run the 45 P0 visual families first, manually review them, then move to P1. This gives the Zimbabwe/Southern-Africa launch set the fastest asset coverage while keeping the full catalog hierarchy intact.
