# ETL Validator

This folder contains `scripts/etl_validate.py` — a small Python script to validate CSV files against the JSON Schemas in `data/schema/`.

Quick start (macOS / Linux):

1. Create a virtualenv and install requirements:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

2. Run validator on sample templates:

```bash
python3 scripts/etl_validate.py --csv data/templates/metrics.csv --schema data/schema/metrics.schema.json
python3 scripts/etl_validate.py --csv data/templates/campaigns.csv --schema data/schema/campaigns.schema.json
```

Exit codes: `0` = success, non-zero = validation errors.
