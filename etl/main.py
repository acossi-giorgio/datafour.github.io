# website/etl/main.py
from pathlib import Path
import pandas as pd

def main():
    base = Path(__file__).resolve().parents[1]
    raw = base / "raw_datasets"
    out = base / "datasets"
    out.mkdir(exist_ok=True)

    mea = pd.read_csv(raw / "mea_country.csv", sep=";")
    allowed = set(mea["Country"].astype(str).str.strip().str.lower())

    for p in raw.glob("*.csv"):
        if p.name == "mea_country.csv":
            continue
        df = pd.read_csv(p, sep=";")
        mask = df["COUNTRY"].astype(str).str.strip().str.lower().isin(allowed)
        df_filtered = df[mask]
        df_filtered.to_csv(out / f"mea_{p.name}", index=False)

if __name__ == "__main__":
    main()
