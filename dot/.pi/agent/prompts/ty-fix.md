---
description: Run Ty for a component, fix reported errors properly, avoid checker-gaming workarounds, prefer fixing real type hints and class contracts over Any or convenience Protocols, and treat Any as an extreme last resort
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
Using `Any` is **strongly discouraged**: fix inaccurate type hints, improve the real classes or base interfaces, add the right overload/helper, or narrow values locally instead.
**Never, ever use `Any` or `cast(Any, ...)` as a convenience fix.** Treat them as an extreme last resort only in the rare cases where the behavior is genuinely dynamic and there is no truthful, maintainable alternative.
Do not default to `Protocol` either. Prefer improving existing type hints, base classes, and shared class contracts when you control them; use a `Protocol` only for genuine structural typing boundaries, keep it minimal, and limit it to the real surface you need.
If you are unsure what the correct fix is, stop and ask the user instead of guessing.

## Hard rules: do NOT game the checker

When fixing Ty errors, follow these rules strictly:

- **Never use `Any` or `cast(Any, ...)` as a convenience fix. Fix the type hints, model the boundary correctly, or narrow the value instead.**
- **Treat `Any` as an extreme last resort only when the behavior is genuinely dynamic/untyped and every more precise option (better class/base annotations, `Protocol`, `TypedDict`, overloads, wrappers, concrete unions, `object` + narrowing, etc.) has been ruled out.**
- **Do not introduce a `Protocol` just to paper over incomplete parent/base class annotations or to avoid fixing the real class contract. Prefer improving the existing type hints, base classes, or shared APIs when you control them. If a `Protocol` is truly needed, keep it minimal and limited to the real structural surface.**
- **Do not add unjustified `cast(...)`. A cast must reflect a real runtime invariant that already exists; it must not invent one.**
- **Do not add fake narrowing checks (`assert`, `isinstance`, `hasattr`, `callable`, custom type guards/helpers, etc.) just to make Ty accept code. Narrowing must match a real runtime guarantee.**
- **Do not change a type hint to something less accurate just to make Ty stop complaining.**
- **Do not add broad unions or other weaker annotations unless they are actually true at runtime.**
- **Do not erase type information by removing annotations, replacing explicit parameters with `*args` / `**kwargs`, or broadening to `object`, `dict[str, object]`, `list[object]`, and similar catch-all shapes unless that is the real contract.**
- **Do not use `getattr` / `setattr` or other string-based attribute indirection as a checker workaround. If the attribute contract is real, model it explicitly with a base class or shared class contract first; use a `Protocol` only when the boundary is genuinely structural, or use a wrapper/local narrowing step.**
- **Do not add `__getattr__`, `__getattribute__`, `__setattr__`, direct `__dict__` manipulation, or other dynamic attribute magic as a checker workaround.**
- **Do not add over-permissive overloads, protocols, wrappers, or shims whose main purpose is to hide a mismatch instead of modeling the real contract.**
- **Do not hide issues behind `if TYPE_CHECKING:`, dead branches, platform/version guards, or other checker-only control flow that makes Ty see a different program than runtime.**
- **Do not relax Ty configuration, exclude files, add per-file suppressions, or lie in `.pyi` stubs just to get a clean run.**
- **Do not add ignores or suppressions unless there is no reasonable modeling alternative.**
- **Do not preserve a broken or ambiguous API contract just because a local annotation hack makes the error disappear.**
- **Do not treat “no Ty errors” as success if the resulting typing is misleading, weaker, or less maintainable.**
- **If multiple fixes are plausible and you are not confident which one is correct, stop and ask the user before making a speculative change.**

Prefer a real fix even if it requires:
- a better type model,
- more accurate class or base-interface annotations,
- a more accurate function signature,
- a small refactor,
- a local narrowing step,
- a small protocol or typed wrapper at a genuine structural boundary,
- or a small API cleanup.

A small rework that makes the code and types honest is **better** than a minimal checker workaround.

## General approach

When enabling or fixing a Ty rule, use this order of preference:

1. **Fix the real model**: improve existing type hints, classes, or API contracts so they match runtime truth.
2. **Narrow locally**: use truthful `assert`, `isinstance`, pattern matching, or a local variable before use.
3. **Adapt the boundary**: normalize the value before calling another API.
4. **Improve shared abstractions you own**: base classes, common helpers, attribute annotations, overload boundaries, and return types.
5. **Use a precise typing tool only when it is the truthful model**: `Protocol`, `TypedDict`, overloads, type aliases, generics, wrapper/helper objects, or `object` plus narrowing.
6. **Use `Any` or `cast(Any, ...)` only as an extreme last resort** for genuinely dynamic / generated / third-party behavior that cannot be modeled truthfully at reasonable cost.
7. **Avoid broad ignores** unless there is no reasonable modeling option.

A good rule of thumb:
- if the code is dynamic by design, isolate that dynamism in one place behind the smallest honest boundary;
- if the code is merely ambiguous, narrow it before use;
- if the existing type hints are inaccurate, fix them truthfully instead of weakening them;
- if you own the class hierarchy, improve the real class or base annotations before inventing a `Protocol`;
- if the type is unknown, prefer `object` plus narrowing, better class hints, or a small `Protocol` only at a genuine structural boundary over `Any`;
- if a correct fix needs a small refactor, do the refactor rather than gaming the checker.

When tempted to use `Any`, a broad annotation, or a cast, try one of these first:
- fixing the existing class, base-class, or shared function annotation at the source,
- the correct concrete type or optional type,
- a small `Protocol` for the behavior you actually use, but only if structural typing is truly the right model,
- a `TypedDict` for dict-like payloads,
- overloads or generics for polymorphic APIs,
- `object` plus a local narrowing step,
- a small refactor that makes the real invariant explicit,
- or a tiny wrapper/helper around an untyped boundary.

## Preferred workflow

1. If no component was provided, ask the user for the component name instead of guessing.
2. Run `ty.py --component $1`.
3. Group diagnostics by repeated rule/pattern.
4. Fix shared abstractions first:
   - base classes and shared class contracts,
   - existing type hints that should be corrected at the source,
   - protocol types only when structural typing is truly the right abstraction,
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
13. Before finishing, review your changes against the hard rules:
   - no convenience `Any`,
   - no unjustified `cast(...)`,
   - no fake narrowing,
   - no weakened or erased annotations,
   - no unnecessary ignores, config relaxations, or stub lies,
   - no `getattr` / `setattr` / dynamic attribute magic checker workarounds,
   - no checker-only control-flow tricks,
   - no over-permissive overloads / protocols / wrappers / shims,
   - and dynamic behavior isolated to the smallest honest boundary.
14. End with a concise summary of:
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
Adjust the annotation to match the real lifecycle, or change the stored value to match the existing annotation. If implementations vary but the used interface is stable and there is no truthful shared base class or existing annotation you can improve, model that interface with a small `Protocol` instead of falling back to `Any`.

#### Why
A lot of legacy code initializes with `None` and later stores richer objects; the type should reflect that honestly. When only a small surface is relied on and the boundary is truly structural, a protocol is usually more truthful and maintainable than `Any`.

#### Example
```python
from typing import Protocol

# Bad
self.worker: Thread = None

# Good: if it is truly optional during lifecycle
self.worker: Thread | None = None

# Good: if implementations vary but the used interface is stable
class SupportsJoin(Protocol):
    def join(self, timeout: float | None = None) -> None: ...

self.worker: SupportsJoin | None = None
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
1. add the missing attribute or method to the real base class or shared class hierarchy when you control it,
2. assert the object is not `None` before access,
3. isolate truly dynamic behavior behind a small `Protocol`, wrapper, or helper only when the boundary is genuinely structural or external,
4. use `Any` only as a last resort when the attribute surface is genuinely unknowable and external.

#### Why
This keeps real object contracts explicit and isolates dynamic behavior to the places where it actually exists, instead of letting `Any` erase guarantees across the codebase.

#### Example
```python
from typing import Protocol

class SupportsSend(Protocol):
    def send(self, data: bytes) -> object: ...

# Bad
self.client = None
...
self.client.send(data)

# Good: normal optional lifecycle
self.client: Socket | None = None
...
assert self.client is not None
self.client.send(data)

# Good: structurally typed boundary for variable implementations
self.client: SupportsSend | None = None
...
assert self.client is not None
self.client.send(data)
```

---

## Rule-specific notes that are especially useful

### Dynamic / generated code
For generated protocols, XML wrappers, RPC clients, instrument drivers, and similar code:
- prefer improving existing boundary annotations or adding a small typed wrapper/adapter; use a small `Protocol`, `TypedDict`, or `object` + local narrowing only when that is the truthful model for the dynamic handle,
- keep any unavoidable escape hatch at the narrowest possible boundary,
- do **not** turn the whole module into `Any`,
- and if `Any` is truly unavoidable, document briefly why the boundary cannot be modeled more precisely.

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

### `Any`, casts, and narrowing
Avoid `Any`. Use it only when all of these are true:
- the object really is dynamic,
- the type is controlled outside the repo (generated code, third-party, RPC, etc.),
- a precise model using `Protocol`, `TypedDict`, overloads, concrete unions, generics, wrapper/helper code, or `object` + narrowing is not practical,
- the `Any` is isolated to the smallest possible boundary,
- and a short comment explains why no more precise type is reasonable.

If you know the runtime type, cast to that concrete type instead of `Any`.
Use `cast(ConcreteType, ...)` only when a real nearby invariant already proves the concrete type and Ty simply cannot follow it.
Do **not** use `cast(...)`, `assert`, `isinstance`, `hasattr`, `callable`, or custom type-guard helpers to manufacture a type fact that is not truly guaranteed at runtime.
If any of the conditions above are false, do **not** use `Any`.

### Config, stubs, and checker-only branches
Do not:
- relax Ty config, disable rules, exclude files, or add suppressions just to get green;
- add or edit `.pyi` stubs so the checker sees a nicer API than runtime actually provides;
- hide issues in `if TYPE_CHECKING:`, dead branches, or platform/version guards unless that split is genuinely part of the runtime design.

## Anti-pattern reminders

These are usually **bad fixes** unless the runtime behavior truly justifies them:

- changing `Foo | None` to `Any` only because dereferences fail,
- replacing a missing protocol, typed wrapper, or local narrowing step with `Any`,
- introducing a `Protocol` for a class hierarchy you own just to avoid fixing incomplete base-class or parent type hints,
- adding `cast(Foo, x)` when no real invariant proves `x` is a `Foo`,
- using `cast(Any, ...)` where `assert`, `isinstance`, or `cast(ConcreteType, ...)` would be truthful,
- adding fake `assert` / `isinstance` / `hasattr` / `callable` / custom TypeGuard-style logic purely to convince Ty,
- replacing an explicit attribute contract with `getattr` / `setattr`, `__getattr__`, `__getattribute__`, `__setattr__`, or `__dict__` tricks just to silence the checker,
- removing annotations or replacing an explicit API with `*args` / `**kwargs` to erase the mismatch,
- broadening to catch-all shapes like `object`, `dict[str, object]`, or `list[object]` when that is not the real contract,
- adding fallback overloads, permissive protocols, wrappers, or shims that “accept everything” instead of modeling the real boundary,
- hiding problems in `if TYPE_CHECKING:`, dead branches, or checker-only platform/version guards,
- relaxing Ty config, excluding files, or adding per-file suppressions instead of fixing the code,
- adding or editing `.pyi` stubs that misrepresent runtime behavior,
- widening a parameter type without confirming the function really accepts it,
- weakening a return type to hide inconsistent return paths,
- adding a giant union where a local narrowing would be clearer,
- changing annotations to match one call site instead of the real API contract,
- adding ignores where a short wrapper or assertion would solve the issue,
- keeping a misleading interface and pushing casts to every caller.

If the code and the types disagree, prefer making them agree truthfully, even if that means a small local redesign.

## Extra instructions from the user

${@:2}
