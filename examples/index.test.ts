/**
 * CAIRS Examples Test Runner
 *
 * Validates and evaluates all example files to ensure they work correctly.
 */

import { readdir, stat, readFile } from "node:fs/promises";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert";
import {
  validateAIR,
  validateCIR,
  createCoreRegistry,
  createBoolRegistry,
  createListRegistry,
  createSetRegistry,
  evaluateProgram,
  typeCheckProgram,
  registerDef,
  type AIRDocument,
  type CIRDocument,
  type Defs,
} from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = __dirname;

interface ExampleFile {
  path: string;
  fullPath: string;
  ir: "AIR" | "CIR";
}

async function findExampleFiles(dir: string, baseDir = dir): Promise<ExampleFile[]> {
  const examples: ExampleFile[] = [];
  const entries = await readdir(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const statResult = await stat(fullPath);

    if (statResult.isDirectory()) {
      const subExamples = await findExampleFiles(fullPath, baseDir);
      examples.push(...subExamples);
    } else if (entry.endsWith(".air.json")) {
      examples.push({
        path: relative(baseDir, fullPath),
        fullPath,
        ir: "AIR",
      });
    } else if (entry.endsWith(".cir.json")) {
      examples.push({
        path: relative(baseDir, fullPath),
        fullPath,
        ir: "CIR",
      });
    }
  }

  return examples;
}

async function loadExample(filePath: string): Promise<{ doc: AIRDocument | CIRDocument; ir: "AIR" | "CIR" }> {
  const content = await readFile(filePath, "utf-8");
  const doc = JSON.parse(content) as AIRDocument | CIRDocument;
  const ir: "AIR" | "CIR" = filePath.endsWith(".cir.json") ? "CIR" : "AIR";
  return { doc, ir };
}

function buildDefs(doc: AIRDocument | CIRDocument): Defs {
  let defs: Defs = new Map();
  if (doc.airDefs) {
    for (const airDef of doc.airDefs) {
      defs = registerDef(defs, airDef);
    }
  }
  return defs;
}

async function runExampleTests() {
  const examples = await findExampleFiles(EXAMPLES_DIR);
  // Merge all registries into one Map
  let registry = createCoreRegistry();
  registry = new Map([...registry, ...createBoolRegistry()]);
  registry = new Map([...registry, ...createListRegistry()]);
  registry = new Map([...registry, ...createSetRegistry()]);

  // Group examples by subdirectory for organized test output
  const byDir = examples.reduce(
    (acc, ex) => {
      const dir = ex.path.split("/").slice(0, -1).join("/");
      if (!acc[dir]) acc[dir] = [];
      acc[dir].push(ex);
      return acc;
    },
    {} as Record<string, ExampleFile[]>
  );

  // Create a test suite for each directory
  for (const [dir, dirExamples] of Object.entries(byDir)) {
    await test(dir, async (t) => {
      for (const example of dirExamples) {
        await t.test(example.path, async () => {
          const { doc, ir } = await loadExample(example.fullPath);

          // Test 1: Validation
          const validationResult = ir === "AIR" ? validateAIR(doc) : validateCIR(doc);
          assert.ok(
            validationResult.valid,
            `Validation failed: ${validationResult.errors.map((e) => e.message).join(", ")}`
          );

          // Test 2: Type checking
          const defs = buildDefs(doc);
          const typeCheckResult = typeCheckProgram(doc, registry, defs);
          assert.ok(typeCheckResult, "Type checking should complete");

          // Test 3: Evaluation
          const evalResult = evaluateProgram(doc, registry, defs);
          if (evalResult.kind === "error") {
            assert.fail(`Evaluation should not error: ${evalResult.code}`);
          }

          // Check expected result if present
          const expected = (doc as any).expected_result;
          if (expected !== undefined) {
            if (evalResult.kind === "int" || evalResult.kind === "float" || evalResult.kind === "bool") {
              assert.strictEqual(evalResult.value, expected, `Result should match expected value`);
            }
          }
        });
      }
    });
  }

  // Summary
  console.log(`\n✓ Tested ${examples.length} examples`);
}

// Run tests
runExampleTests().catch((err) => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
