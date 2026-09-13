-- Database Admin Functions for SERGIK Website
-- Run this in Supabase SQL Editor to enable the database control panel

-- Function: get_database_tables_info
-- Returns metadata for all public tables including row counts and sizes
CREATE OR REPLACE FUNCTION get_database_tables_info()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(t ORDER BY t.row_count DESC)
  INTO result
  FROM (
    SELECT
      c.relname AS name,
      n.nspname AS schema,
      c.reltuples::bigint AS row_count,
      pg_total_relation_size(c.oid) AS size_bytes,
      pg_size_pretty(pg_total_relation_size(c.oid)) AS size_formatted,
      (
        SELECT json_agg(
          json_build_object(
            'name', a.attname,
            'type', pg_catalog.format_type(a.atttypid, a.atttypmod),
            'nullable', NOT a.attnotnull,
            'defaultValue', pg_get_expr(d.adbin, d.adrelid),
            'isPrimaryKey', EXISTS (
              SELECT 1 FROM pg_index i
              WHERE i.indrelid = c.oid
                AND i.indisprimary
                AND a.attnum = ANY(i.indkey)
            )
          )
          ORDER BY a.attnum
        )
        FROM pg_attribute a
        LEFT JOIN pg_attrdef d ON a.attrelid = d.adrelid AND a.attnum = d.adnum
        WHERE a.attrelid = c.oid
          AND a.attnum > 0
          AND NOT a.attisdropped
      ) AS columns
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
  ) t;

  RETURN COALESCE(result, '[]'::json);
END;
$$;

-- Function: exec_readonly_query
-- Executes a read-only SQL query and returns results as JSON
-- Only allows SELECT statements for safety
CREATE OR REPLACE FUNCTION exec_readonly_query(query_text TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
  trimmed TEXT;
  first_word TEXT;
BEGIN
  trimmed := btrim(query_text);
  first_word := upper(split_part(trimmed, ' ', 1));

  IF first_word NOT IN ('SELECT', 'WITH', 'EXPLAIN') THEN
    RAISE EXCEPTION 'Only SELECT, WITH, and EXPLAIN queries are allowed. Got: %', first_word;
  END IF;

  IF upper(trimmed) ~ '(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE)\s' THEN
    RAISE EXCEPTION 'Write operations are not allowed in read-only mode.';
  END IF;

  EXECUTE 'SELECT json_agg(row_to_json(t)) FROM (' || trimmed || ') t' INTO result;

  RETURN COALESCE(result, '[]'::json);
END;
$$;
