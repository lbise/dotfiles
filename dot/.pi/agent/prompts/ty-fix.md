---
description: Run Ty for a component, fix reported errors properly, and avoid checker-gaming workarounds
argument-hint: "<component> [extra instructions]"
---
Run Ty for component `$1` using:

```bash
ty.py --component $1
```

## Primary objective

Fix the reported Ty errors **correctly**.
Do not merely silence diagnostics.
Do not optimize for “Ty passes” at the expense of truthful types or sound code.
If you are unsure what the correct fix is, stop and ask the user instead of guessing.

## Hard rules: do NOT game the checker

When fixing Ty errors, follow these rules strictly:

- **Do not change a type hint to something less accurate just to make Ty stop complaining.**
- **Do not add `Any`, `cast(Any, ...)`, broad unions, or weaker annotations unless they are actually true at runtime.**
- **Do not add ignores or suppressions unless there is no reasonable modeling alternative.**
- **Do not preserve a broken or ambiguous API contract just because a local annotation hack makes the error disappear.**
- **Do not treat “no Ty errors” as success if the resulting typing is misleading, weaker, or less maintainable.**
- **If multiple fixes are plausible and you are not confident which one is correct, stop and ask the user before making a speculative change.**

Prefer a real fix even if it requires:
- a better type model,
- a more accurate function signature,
- a small refactor,
- a local narrowing step,
- a wrapper/helper,
- or a small API cleanup.

A small rework that makes the code and types honest is **better** than a minimal checker workaround.

## General approach

When enabling or fixing a Ty rule, use this order of preference:

1. **Fix the model**: make the type or API contract accurate.
2. **Narrow locally**: use `assert`, `isinstance`, or a local variable before use.
3. **Adapt the boundary**: normalize the value before calling another API.
4. **Use `cast(Any, ...)` only for genuinely dynamic / generated / third-party behavior.**
5. **Avoid broad ignores** unless there is no reasonable modeling option.

A good rule of thumb:
- if the code is dynamic by design, isolate that dynamism in one place;
- if the code is merely ambiguous, narrow it before use.
- if the existing type hints are inaccurate, fix them truthfully instead of weakening them.
- if a correct fix needs a small refactor, do the refactor rather than gaming the checker.

## Preferred workflow

1. If no component was provided, ask the user for the component name instead of guessing.
2. Run `ty.py --component $1`.
3. Group diagnostics by repeated rule/pattern.
4. Fix shared abstractions first:
   - base classes,
   - protocol types,
   - helper wrappers,
   - overload boundaries,
   - inaccurate function signatures,
   - misleading attribute annotations.
5. Fix file-local leftovers afterward.
6. Re-run Ty until the component is clean or you hit a real blocker.
7. Create a separate git commit for each Ty rule fixed.
8. Group all fixes for the same Ty rule into the same commit.
9. Do not mix multiple Ty rules into one commit.
10. Keep fixes minimal **but correct** and aligned with existing code patterns.
11. If the smallest possible change would merely silence Ty while leaving the code model inaccurate, do the slightly larger correct fix instead.
12. If you are in doubt about the correct fix, stop and ask the user rather than guessing.
13. End with a concise summary of:
   - what you changed,
   - whether Ty is now clean,
   - any remaining blockers,
   - and whether any fix required a small rework or type-model cleanup.

## Rule-fixing playbook

This playbook is meant to help another agent enable Ty rules in a repository.
It focuses on:

- what each rule usually means,
- the preferred way to fix it,
- why that fix is preferable,
- and a small example.

The intent is to stay factual and reusable, not tied to a specific commit history.

---

### 1. `dataclass-field-order`

#### What it means
A dataclass field with a default value appears before a required field.

#### Preferred fix
Move all required fields before fields with defaults.

#### Why
This matches Python dataclass construction rules directly and keeps generated `__init__` signatures valid.

#### Example
```python
# Bad
@dataclass
class Config:
    timeout: int = 10
    host: str

# Good
@dataclass
class Config:
    host: str
    timeout: int = 10
```

---

### 2. `no-matching-overload`

#### What it means
A call does not match any declared overload.

#### Preferred fix
Narrow the argument type before the call, or broaden the overload only if the API truly supports the broader shape.

#### Why
Overloads are only useful if the call boundary is explicit. Narrowing at the call site usually keeps the API cleaner.

#### Example
```python
# Bad
value: str | Path
open_file(value)  # overloads only accept str

# Good
value: str | Path
path_str = str(value)
open_file(path_str)
```

---

### 3. `call-non-callable`

#### What it means
Something is being called even though Ty cannot prove it is callable.

#### Preferred fix
Split callable and non-callable cases explicitly.

#### Why
This removes ambiguity without weakening the type system globally.

#### Example
```python
# Bad
handler: Callable[[int], None] | str
handler(3)

# Good
handler: Callable[[int], None] | str
if callable(handler):
    handler(3)
else:
    raise TypeError(f"Unsupported handler: {handler}")
```

---

### 4. `not-iterable`

#### What it means
Code assumes a value is iterable, but it may be scalar or `None`.

#### Preferred fix
Normalize the value to a sequence, or branch between scalar and iterable cases.

#### Why
This prevents accidental scalar-vs-container bugs.

#### Example
```python
# Bad
items: int | list[int]
for item in items:
    ...

# Good
items: int | list[int]
normalized = items if isinstance(items, list) else [items]
for item in normalized:
    ...
```

---

### 5. `unsupported-operator`

#### What it means
An operator is used on types that do not safely support it.

#### Preferred fix
Convert the value to the intended type before applying the operator.

#### Why
This makes the operation explicit and avoids relying on accidental runtime behavior.

#### Example
```python
# Bad
value: str | int
result = value + 1

# Good
value: str | int
result = int(value) + 1
```

---

### 6. `invalid-method-override`

#### What it means
A subclass method signature is incompatible with the parent method.

#### Preferred fix
Align the child signature with the base class contract, or broaden the base contract if the broader behavior is intentional and already relied upon.

#### Why
This is about substitutability: a subclass must still be usable everywhere the base class is expected.

#### Example
```python
# Bad
class Base:
    def send(self, data: bytes) -> None: ...

class Child(Base):
    def send(self, data: str) -> None: ...
        ...

# Good
class Base:
    def send(self, data: bytes | bytearray) -> None: ...

class Child(Base):
    def send(self, data: bytes | bytearray) -> None:
        ...
```

---

### 7. `missing-argument`

#### What it means
A required argument is not passed.

#### Preferred fix
Pass the argument explicitly, or make the callee optional only if that matches real runtime usage.

#### Why
This usually indicates a real contract mismatch, not just a typing detail.

#### Example
```python
# Bad
sock.connect()

# Good
sock.connect(address)
```

---

### 8. `not-subscriptable`

#### What it means
Code indexes or slices a value that Ty cannot prove is subscriptable.

#### Preferred fix
Convert to a concrete sequence or mapping first, or narrow the type before indexing.

#### Why
This makes the container shape explicit.

#### Example
```python
# Bad
payload: bytes | int
first = payload[0]

# Good
payload: bytes | int
if isinstance(payload, bytes):
    first = payload[0]
else:
    first = payload
```

---

### 9. `invalid-return-type`

#### What it means
A function returns something outside its declared return type.

#### Preferred fix
Make every return path match the annotation, or change the annotation if the API genuinely returns multiple shapes.

#### Why
Return types are one of the strongest contracts in the code.

#### Example
```python
# Bad
def get_name(flag: bool) -> str:
    if flag:
        return "ok"
    return None

# Good
def get_name(flag: bool) -> str | None:
    if flag:
        return "ok"
    return None
```

---

### 10. `possibly-unresolved-reference`

#### What it means
A variable may be used on a path where it was never assigned.

#### Preferred fix
Initialize it before the conditional, or restructure the branches so it is always assigned before use.

#### Why
This removes path-sensitive ambiguity and avoids runtime `UnboundLocalError`-style bugs.

#### Example
```python
# Bad
if use_cache:
    value = cache.get("x")
print(value)

# Good
value = None
if use_cache:
    value = cache.get("x")
print(value)
```

---

### 11. `invalid-assignment`

#### What it means
A variable or attribute is assigned a value that does not match its annotation.

#### Preferred fix
Adjust the annotation to match the real lifecycle, or change the stored value to match the existing annotation.

#### Why
A lot of legacy code initializes with `None` and later stores richer objects; the type should reflect that honestly.

#### Example
```python
# Bad
self.worker: Thread = None

# Good: if it is truly optional during lifecycle
self.worker: Thread | None = None

# Good: if it is intentionally dynamic / third-party driven
self.worker: Any = None
```

---

### 12. `invalid-argument-type`

#### What it means
A call passes an argument whose type is broader or different than what the callee expects.

#### Preferred fix
Convert, narrow, or normalize before the call.

#### Why
This keeps the receiving API simpler and makes the caller’s intent explicit.

#### Example
```python
# Bad
port: str | int
connect(port)

# Good
port: str | int
connect(int(port))
```

---

### 13. `unresolved-attribute`

#### What it means
Code accesses an attribute that Ty cannot prove exists.

#### Preferred fix
Use one of these, in order:
1. add the missing attribute or method to the base class / protocol,
2. assert the object is not `None` before access,
3. annotate a truly dynamic field as `Any`.

#### Why
This keeps real object contracts explicit and isolates dynamic behavior to the places where it actually exists.

#### Example
```python
# Bad
self.client = None
...
self.client.send(data)

# Good: normal optional lifecycle
self.client: Socket | None = None
...
assert self.client is not None
self.client.send(data)

# Good: intentionally dynamic third-party object
self.client: Any = None
```

---

## Rule-specific notes that are especially useful

### Dynamic / generated code
For generated protocols, XML wrappers, RPC clients, instrument drivers, and similar code:
- prefer **small local `Any` annotations** on the dynamic handle,
- do **not** turn the whole module into `Any`,
- keep the rest of the code strongly typed.

### Legacy compatibility APIs
If a repo has legacy aliases, backward-compatibility methods, or mixed runtime contracts:
- add a tiny wrapper or alias method on the base class,
- document it with a short docstring,
- and let callers use the explicit compatibility surface instead of monkey-patched behavior.

### Optional attributes
If an attribute really is optional during object lifetime:
- annotate it as optional,
- assert before dereference,
- and reset it consistently in cleanup paths.

### `cast(Any, ...)`
Use it only when all of these are true:
- the object really is dynamic,
- the type is controlled outside the repo (generated code, third-party, RPC, etc.),
- and modeling the exact shape would be disproportionately expensive.

## Anti-pattern reminders

These are usually **bad fixes** unless the runtime behavior truly justifies them:

- changing `Foo | None` to `Any` only because dereferences fail,
- widening a parameter type without confirming the function really accepts it,
- weakening a return type to hide inconsistent return paths,
- adding a giant union where a local narrowing would be clearer,
- changing annotations to match one call site instead of the real API contract,
- adding ignores where a short wrapper or assertion would solve the issue,
- keeping a misleading interface and pushing casts to every caller.

If the code and the types disagree, prefer making them agree truthfully, even if that means a small local redesign.

## Extra instructions from the user

${@:2}
