# min-value

AIR hybrid example demonstrating mixed expression and block nodes.

## Structure

```
nodes:
  - a (expr): literal 25
  - b (expr): literal 17
  - minValue (blocks): CFG that returns the smaller value
```

## Control Flow

```
entry: is a < b?
  ├── true  → returnA (return a)
  └── false → returnB (return b)
```

## Result

Since a=25 and b=17, the comparison a<b is false, so returns b=17.
