#!/usr/bin/env python3
"""
Simple ETL validator: validates CSV rows against a JSON Schema.

Usage:
  python3 scripts/etl_validate.py --csv data/templates/metrics.csv --schema data/schema/metrics.schema.json

Exits with code 0 on success, non-zero if any validation errors occur.
"""
import argparse
import json
import sys
from jsonschema import validate, ValidationError
import pandas as pd
import yaml


def load_schema(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def cast_value(value, prop_schema):
    if value is None:
        return None
    if isinstance(value, float) and pd.isna(value):
        return None
    # handle arrays encoded as semicolon-separated
    if prop_schema.get("type") == "array" or (isinstance(prop_schema.get("type"), list) and "array" in prop_schema.get("type")):
        if isinstance(value, str):
            sep = ";" if ";" in value else ","
            return [v.strip() for v in value.split(sep) if v.strip()]
        if pd.isna(value):
            return []
        return value
    types = prop_schema.get("type")
    if isinstance(types, list):
        if "integer" in types:
            try:
                return int(value)
            except Exception:
                pass
        if "number" in types:
            try:
                return float(value)
            except Exception:
                pass
    else:
        if types == "integer":
            try:
                return int(value)
            except Exception:
                return value
        if types == "number":
            try:
                return float(value)
            except Exception:
                return value
    # fallback: return as-is (strings remain strings)
    return value


def validate_csv(csv_path, schema_path, delimiter=","):
    schema = load_schema(schema_path)
    df = pd.read_csv(csv_path, dtype=str, keep_default_na=False)
    errors = []
    props = schema.get("properties", {})
    for idx, row in df.iterrows():
        obj = {}
        for col, val in row.items():
            if val == "":
                v = None
            else:
                v = val
            if col in props:
                try:
                    v_cast = cast_value(v, props[col])
                except Exception:
                    v_cast = v
            else:
                v_cast = v
            obj[col] = v_cast
        try:
            validate(instance=obj, schema=schema)
        except ValidationError as e:
            errors.append({"row": idx + 1, "error": str(e), "object": obj})

    if errors:
        print(json.dumps({"status": "failed", "errors": errors}, indent=2))
        return 2
    print(json.dumps({"status": "ok", "rows_validated": len(df)}))
    return 0


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--csv", required=True, help="Path to CSV file")
    p.add_argument("--schema", required=True, help="Path to JSON Schema file")
    args = p.parse_args()
    rc = validate_csv(args.csv, args.schema)
    sys.exit(rc)


if __name__ == "__main__":
    main()
