# Calculator

Demonstrates: **many inputs → many outputs** pattern

## Description

Reads two integers from input, performs multiple arithmetic operations (addition, subtraction, multiplication), and outputs all three results. This example combines computational logic with the multiple-input, multiple-output pattern.

## Input Pattern

- Two `readInt` effects to read two operands

## Computation

- Addition (sum)
- Subtraction (difference)
- Multiplication (product)

## Output Pattern

- Three `printInt` effects, one for each computed result

## Running

### Interactive mode
```bash
pnpm run-example eir/interactive/calculator
```

### With fixture inputs
```bash
pnpm run-example eir/interactive/calculator --inputs "[10, 3]"
```

### With command-line inputs
```bash
pnpm run-example eir/interactive/calculator --inputs "10,3"
```

## Expected Output

When given inputs `10` and `3`:

```
13
7
30
```

(sum, difference, product)

## Learning Objectives

- Understand how multiple inputs are processed together
- See computation stages between input and output
- Learn the many→many pattern common in data processing pipelines
- Compare with simpler patterns (0→1, 0→many, 1→many, many→1)
