---
name: rust-standards
description: Write idiomatic Rust code. Use when writing Rust code.
---

## Testing

- Unit tests in `#[cfg(test)]` modules within each source file
- Integration tests in `tests/` directory

## Naming

- No `get_` prefix: `fn name()` not `fn get_name()`
- Iterator convention: `iter()` / `iter_mut()` / `into_iter()`
- Conversion naming: `as_` (cheap &), `to_` (expensive), `into_` (ownership)
- Static var prefix: `G_CONFIG` for `static`, no prefix for `const`

## Data Types

- Use newtypes: `struct Email(String)` for domain semantics
- Prefer slice patterns: `if let [first, .., last] = slice`
- Pre-allocate: `Vec::with_capacity()`, `String::with_capacity()`
- Avoid `Vec` abuse: use arrays for fixed sizes

## Strings

- Prefer `&str` over `String` in function parameters
- Use `String` for ownership: return `String` when transferring ownership
- Prefer bytes: `s.bytes()` over `s.chars()` when ASCII
- Use `Cow<str>` when you might need to modify borrowed data
- Use `format!` over string concatenation with `+`
- Avoid nested iteration: `contains()` on string is O(n\*m)

## Error Handling

- Use `?` for all fallible operations
- `unwrap()` in tests only, never production
- `expect()` only for provably impossible states; the message must justify why it can't fail e.g. `expect("regex is valid: validated at compile time")`
- `unwrap_or` / `unwrap_or_else` / `unwrap_or_default` for deliberate fallbacks
- Assertions for invariants: `assert!` at function entry

## Memory

- Meaningful lifetimes: `'src`, `'ctx` not just `'a`
- `try_borrow()` for RefCell to avoid panic
- Shadowing for transformation: `let x = x.parse()?`

## Concurrency

- Identify lock ordering to prevent deadlocks
- Atomics for primitives, not Mutex for bool/usize
- Choose memory order carefully: Relaxed/Acquire/Release/SeqCst

## Async

- Sync for CPU-bound; async is for I/O
- Don't hold locks across await: use scoped guards

## Macros

- Avoid unless necessary: prefer functions/generics
- Follow Rust syntax: macro input should look like Rust

## Deprecated → Better

- `lazy_static!` → `std::sync::OnceLock` (since 1.70)
- `once_cell::Lazy` → `std::sync::LazyLock` (since 1.80)
- `std::sync::mpsc` → `crossbeam::channel` only if you need multi-consumer or better performance under contention; `std::sync::mpsc` is fine for most use cases
- `failure`/`error-chain` → `thiserror`/`anyhow`
- `try!()` → `?` operator (since 2018)

## Docs

- All `pub` methods must have `///` doc comments
- All `///` doc comments must be extremely concise
- Imperative mood: `Returns the length` not `This function returns the length`
- Don't restate the name: `fn connect()` doesn't need "Connects to the server"
- Document the non-obvious: panics, errors, surprising edge cases; skip obvious params/returns
- No filler: no "This method...", "Note that...", "Please be aware..."
- `# Examples` only for non-trivial usage; doctests must compile and pass
- Don't write doctests purely for coverage; write them only when the example genuinely aids understanding

## Quick Reference

```
Naming: snake_case (fn/var), CamelCase (type), SCREAMING_CASE (const)
Format: rustfmt (just use it)
Docs: /// for public items, //! for module docs
Lint: #![deny(clippy::all, clippy::pedantic)]
```

## Miscellaneous

- Derive `Debug` on all public types; derive `Clone`, `PartialEq` only when needed
- Use clippy with `#![deny(clippy::all, clippy::pedantic)]` - fix all warnings
- No unsafe blocks
- Modules: one file per module, mod.rs only for re-exports
