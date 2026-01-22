# double-value

LIR hybrid example demonstrating expression nodes alongside block nodes.

## Structure

```
nodes:
  - multiplier (expr): literal 2
  - input (expr): literal 21
  - result (blocks): CFG that multiplies input by multiplier
```

## Control Flow

```
entry: compute input * multiplier, return result
```

## Result

input=21 multiplied by multiplier=2 equals 42.
