---
name: GitHub push authentication
description: Publishing from this workspace requires an explicitly authenticated GitHub CLI or SSH credential.
---

Verify GitHub authentication before attempting the final push. A public HTTPS clone can succeed while `git push` still fails with “Invalid username or token”; if `gh auth status` reports no logged-in host and SSH has no key, the code can be committed locally but cannot be published without user-provided authentication.

**Why:** The repository’s clone and fetch credentials are not evidence that this environment has write access.

**How to apply:** Run `gh auth status` early in tasks that require pushing, and never print or request a token in chat.