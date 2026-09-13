# KB Ingestion & Embeddings

Steps to ingest a document into the KB:

1. Normalize content to plain text and extract metadata (source_url, author, published_at).
2. Create a canonical KB doc record with fields: id, title, content_text, tags, related_entities.
3. Generate embeddings (store vector metadata: model, dims, vector_id).
4. Store doc + embeddings provenance (ingested_at, source_doc_id).
5. Periodically re-embed high-traffic docs weekly; update on-doc change.

Provenance and GDPR: mark any PII and set retention metadata. Keep raw-source links for audit.
