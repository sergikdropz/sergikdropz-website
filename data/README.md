# Data folder

This folder contains canonical JSON Schema files for primary entities, CSV import/export templates, example rows, and KB ingestion guidance.

Recommended usage:
- Use the JSON Schemas to validate incoming data before writing to the canonical store (Postgres/Supabase).
- Use CSV templates for analyst imports and bulk exports.
- Follow `kb/ingestion.md` for semantic indexing and embeddings.
