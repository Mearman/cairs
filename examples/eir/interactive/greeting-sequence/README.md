# Greeting Sequence

Demonstrates: **0 inputs → many outputs** pattern

## Description

Prints multiple greeting messages in a sequence, with no input processing. This program demonstrates how to chain multiple output effects together using the `seq` (sequencing) construct to ensure they execute in order.

## Input Pattern

- No input effects (no `readLine` or `readInt`)

## Output Pattern

- Three `print` effects in sequence:
  1. "Welcome to CAIRS!"
  2. "This is a demonstration."
  3. "Goodbye!"

## Running

```bash
pnpm run-example eir/interactive/greeting-sequence
```

## Expected Output

```
Welcome to CAIRS!
This is a demonstration.
Goodbye!
```

## Learning Objectives

- Understand how `seq` chains multiple effects in order
- See the difference between single-output and multi-output programs
- Learn how output-only programs structure their operations
