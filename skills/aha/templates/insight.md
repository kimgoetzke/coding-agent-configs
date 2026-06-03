---
date: {yyyy-mm-dd}
repo: {repo name, or `n/a` if not in a repo}
category: {freeform short tag in kebab-case, e.g. `spring-boot`, `pg-locking`, `git-internals`, `rust-borrow-checker`}
tags: [{optional extra tags in kebab-case}]
---

# {Title — short, declarative, what the insight is}

<!-- Write everything below to stand alone. A reader with no knowledge of the PR,
     conversation, or task that produced this note must fully understand it. No "in this PR",
     "the change above", "the bug we just fixed". Reference code only via the Example or
     Permalink sections, never by assuming the reader can see a diff. -->

## Summary

{One or two sentences. The shortest possible statement of the insight — what you now know that you didn't before. If a reader only reads this section, they should still get the point. State it in general, timeless terms — not relative to the task that produced it.}

## Details

{The fuller explanation. Why it's true, how it works, when it applies, what surprised you. Keep it tight — a few paragraphs at most. Use bullets where they help. Cover any caveats or "this only applies when…" conditions. Assume no knowledge of the originating context.}

## Example

{Code, command, config snippet, or scenario that illustrates the insight. Omit the section or write `_n/a_` if no example fits.}

```{language}
{code}
```

## Permalink

{GitHub/GitLab permalink to a representative line(s), or path:line ref like `src/foo/bar.rs:42`. Omit or `_n/a_` if not applicable.}

## References

- {URL — docs, blog post, RFC, Stack Overflow answer, etc., with a short note on what it covers}
- {Add more as needed; remove section if empty}

## Related insights

- {Optional: link to other `.ai/insight/` files this connects to, by filename}
