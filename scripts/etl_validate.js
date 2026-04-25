#!/usr/bin/env node
/**
 * Simple ETL validator: validates CSV rows against a JSON Schema (Node.js).
 *
 * Usage:
 *   node scripts/etl_validate.js --csv data/templates/metrics.csv --schema data/schema/metrics.schema.json
 *
 * Exit codes: 0 = success, non-zero = validation errors.
 */

const fs = require("fs");
const path = require("path");
const Ajv = require("ajv");
const csv = require("csv-parser");

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--csv") result.csv = args[++i];
    if (args[i] === "--schema") result.schema = args[++i];
  }
  return result;
}

function loadSchema(schemaPath) {
  const content = fs.readFileSync(schemaPath, "utf-8");
  return JSON.parse(content);
}

function castValue(value, propSchema) {
  if (!value || value === "") return null;
  const types = Array.isArray(propSchema.type) ? propSchema.type : [propSchema.type];
  if (types.includes("array")) {
    if (typeof value === "string") {
      const sep = value.includes(";") ? ";" : ",";
      return value.split(sep).map((v) => v.trim()).filter((v) => v);
    }
    return value;
  }
  if (types.includes("integer")) {
    const parsed = parseInt(value, 10);
    return !isNaN(parsed) ? parsed : value;
  }
  if (types.includes("number")) {
    const parsed = parseFloat(value);
    return !isNaN(parsed) ? parsed : value;
  }
  return value;
}

async function validateCSV(csvPath, schemaPath) {
  const schema = loadSchema(schemaPath);
  const ajv = new Ajv();
  const validate = ajv.compile(schema);
  const errors = [];
  let rowCount = 0;

  return new Promise((resolve, reject) => {
    fs.createReadStream(csvPath)
      .pipe(csv())
      .on("data", (row) => {
        rowCount++;
        const obj = {};
        for (const [key, value] of Object.entries(row)) {
          const propSchema = schema.properties?.[key];
          obj[key] = propSchema ? castValue(value, propSchema) : value;
        }
        const valid = validate(obj);
        if (!valid) {
          errors.push({
            row: rowCount,
            errors: validate.errors,
            object: obj,
          });
        }
      })
      .on("end", () => {
        if (errors.length > 0) {
          console.log(JSON.stringify({ status: "failed", errors }, null, 2));
          process.exit(2);
        } else {
          console.log(JSON.stringify({ status: "ok", rows_validated: rowCount }, null, 2));
          process.exit(0);
        }
      })
      .on("error", (err) => {
        console.error(err);
        process.exit(1);
      });
  });
}

async function main() {
  const args = parseArgs();
  if (!args.csv || !args.schema) {
    console.error("Usage: node etl_validate.js --csv <path> --schema <path>");
    process.exit(1);
  }
  await validateCSV(args.csv, args.schema);
}

main();
