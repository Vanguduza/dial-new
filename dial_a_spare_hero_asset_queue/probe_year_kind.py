"""Pure probe: model-year vs photo-date classification on real Commons titles."""
import hero_batch_downloader as h

CASES = [
    ("File:2016 Toyota Hilux double cab.jpg", "model", 2016),
    ("File:2024 Toyota HiLux SR 4X4 mild hybrid front (1).jpg", "model", 2024),
    ("File:Suzuki Swift (2024) hybrid IMG 9683.jpg", "model", 2024),
    ("File:Ford Ranger Raptor (2022) (52571404923).jpg", "model", 2022),
    ("File:Toyota Hilux Rogue 2nd facelift 2020 rear.jpg", "model", 2020),
    ("File:2012 Isuzu D-Max (MY12) SX 4x4 4-door utility (2012-10-26) 01.jpg", "model", 2012),
    ("File:Moscow, Toyota Hilux blue, Sept 2025 01.jpg", "photo", 2025),
    ("File:ELMŰ-ÉMÁSZ Toyota Hilux, 2021 Sátoraljaújhely.jpg", "photo", 2021),
    ("File:Suzuki Swift Sport Genf 2018.jpg", "photo", 2018),
    ("File:Toyota Hilux Invincible 50 (38438265462).jpg", "", None),
    ("File:Toyota Corolla Cross GR Sport (front).jpg", "", None),
]

fails = 0
for title, want_kind, want_year in CASES:
    year, kind = h.title_year_kind(title)
    ok = (kind == want_kind) and (year == want_year)
    fails += not ok
    print(f"{'ok  ' if ok else 'FAIL'} {kind or '-':6} {str(year):6} want={want_kind or '-'}/{want_year}  {title}")
print(f"\n{len(CASES) - fails}/{len(CASES)} pass")
