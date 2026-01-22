# abs-value

EIR hybrid example demonstrating absolute value computation with mixed nodes.

## Structure

```
nodes:
  - input (expr): literal -42
  - zero (expr): literal 0
  - absValue (blocks): CFG that returns absolute value
```

## Control Flow

```
entry: is input < 0?
  ├── true  → negate (compute -input, return it)
  └── false → returnInput (return input as-is)
```

## Result

Since input=-42 is negative, the block negates it and returns 42.
