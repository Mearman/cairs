# Cross-Implementation Compliance Testing

This directory contains shared fixtures for testing spec compliance between the TypeScript and Python implementations of SPIRAL.

## Overview

SPIRAL is JSON-first, which means the same `.air.json`, `.cir.json`, `.eir.json`, and `.lir.json` files can be executed by both implementations. The compliance test suite verifies that both implementations produce identical results.

## Architecture

```
test/fixtures/
├── cross-compliance.fixtures.ts   # Shared fixture definitions (TypeScript)
├── README.md                       # This file
└── (future) expected/              # Expected output files (optional)
```

```
test/
├── cross-compliance.test.ts        # TypeScript compliance tests
└── (existing) *.test.ts            # Implementation-specific tests
```

```
src/pyspiral/test/
└── compliance_test.py              # Python compliance tests
```

## Fixture Definition

A `ComplianceFixture` defines:

1. **Document path** - Path to the SPIRAL JSON document
2. **Inputs path** (optional) - Path to inputs file for interactive examples
3. **Expected output** - Normalized result value
4. **Metadata** - Layer, category, description

Example from `cross-compliance.fixtures.ts`:

```typescript
{
  id: "air-arithmetic-add",
  documentPath: "examples/air/basics/arithmetic/arithmetic.air.json",
  expected: {
    value: { kind: "int", value: 42 },
    structural: true,
  },
  metadata: {
    layer: "AIR",
    category: "basics",
    description: "Arithmetic operations (add, sub, mul, div)",
  },
}
```

## Running Tests

### TypeScript

```bash
# Run all compliance tests
tsx --test test/cross-compliance.test.ts

# Run specific layer tests
tsx --test test/cross-compliance.test.ts --grep "AIR Compliance"
tsx --test test/cross-compliance.test.ts --grep "CIR Compliance"
tsx --test test/cross-compliance.test.ts --grep "EIR Compliance"
tsx --test test/cross-compliance.test.ts --grep "LIR Compliance"
```

### Python

```bash
# Run all compliance tests
python -m pyspiral.test.compliance_test

# From project root
python src/pyspiral/test/compliance_test.py
```

## Value Normalization

Implementations may have differences in:
- **Closure IDs** - Each implementation generates unique IDs
- **Task IDs** - Async tasks have different IDs
- **Internal state** - Environment representations differ

The `normalizeValue()` function removes implementation-specific artifacts before comparison:

```typescript
// Before normalization
{ kind: "closure", fnId: "fn_123", params: ["x"], body: {...}, env: {...} }

// After normalization
{ kind: "closure", params: ["x"], body: {...}, env: "<env>" }
```

## Structural vs String Comparison

Fixtures support two comparison modes:

1. **Structural** (`structural: true`) - Deep equality with type awareness
   - Handles set ordering (unordered comparison)
   - Handles floating-point tolerance
   - Recommended for most fixtures

2. **String** (`structural: false`) - JSON string comparison
   - Exact match required
   - Useful for debugging failures

## Adding New Fixtures

To add a new compliance fixture:

1. **Choose an example** from `examples/` that produces deterministic output
2. **Run the example** to get the expected output
3. **Add to `COMPLIANCE_FIXTURES`** in both:
   - `test/fixtures/cross-compliance.fixtures.ts`
   - `src/pyspiral/test/compliance_test.py`

```typescript
// TypeScript
{
  id: "my-new-test",
  documentPath: "examples/my-category/my-test/my-test.air.json",
  expected: {
    value: { kind: "int", value: 42 },
    structural: true,
  },
  metadata: {
    layer: "AIR",
    category: "my-category",
    description: "My test description",
  },
}
```

```python
# Python
ComplianceFixture(
    id="my-new-test",
    document_path="examples/my-category/my-test/my-test.air.json",
    expected=ExpectedOutput(
        value={"kind": "int", "value": 42},
        structural=True,
    ),
    metadata=FixtureMetadata(
        layer="AIR",
        category="my-category",
        description="My test description",
    ),
)
```

4. **Run tests** in both implementations to verify

## Current Coverage

| Layer | Fixtures | Status |
|-------|----------|--------|
| AIR   | 7        | ✅     |
| CIR   | 3        | ✅     |
| EIR   | 3        | ✅     |
| LIR   | 3        | ✅     |
| **Total** | **16** | |

## Future Work

1. **Increase coverage** - Add fixtures for more examples
2. **Automatic fixture generation** - Scan examples/ and auto-generate fixtures
3. **Expected output files** - Store expected outputs in `test/fixtures/expected/`
4. **Continuous integration** - Run compliance tests in CI/CD pipeline
5. **Performance benchmarks** - Compare execution time between implementations

## Troubleshooting

### Fixture fails in one implementation but not the other

1. Check the fixture definition matches in both implementations
2. Verify the document paths are correct
3. Run the example directly to see actual output
4. Check for implementation-specific behavior (e.g., async scheduling)

### Set comparison failures

Sets are unordered, so different orderings should pass. If they don't:
1. Check `deepEqual()` function handles sets correctly
2. Verify set normalization is working

### Floating-point comparison failures

Add tolerance to the fixture:

```typescript
expected: {
  value: { kind: "float", value: 3.14159 },
  structural: true,
  tolerance: 0.00001,  // Allow small differences
}
```

## Related Documentation

- [SPIRAL Architecture](../../wiki/Architecture.md)
- [Examples Guide](../../wiki/Examples.md)
- [Type System](../../wiki/Specification.md#type-system)
