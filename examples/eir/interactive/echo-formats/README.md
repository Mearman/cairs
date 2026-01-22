# Echo Formats

Demonstrates: **1 input → many outputs** pattern

## Description

Reads a single line of text from the user and echoes it back multiple times. This program shows how a single input can be used to produce multiple output effects, useful for scenarios where you want to display the same value in different contexts or formats.

## Input Pattern

- Single `readLine` effect to read user input

## Output Pattern

- Three `print` effects, each outputting the same input value
- The three outputs demonstrate the value being used in different "contexts"

## Running

### Interactive mode
```bash
pnpm run-example eir/interactive/echo-formats
```

### With fixture input
```bash
pnpm run-example eir/interactive/echo-formats --inputs "[\"hello\"]"
```

### With command-line input
```bash
pnpm run-example eir/interactive/echo-formats --inputs "hello"
```

## Expected Output

When given input `hello`:

```
hello
hello
hello
```

## Learning Objectives

- Understand how multiple outputs can be derived from a single input
- See how effects can reference the same value multiple times
- Learn the 1→many pattern useful for multi-format output or validation
