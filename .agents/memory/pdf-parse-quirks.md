---
name: pdf-parse startup crash workaround
description: pdf-parse@1.1.1 runs a file-system self-test at import time; import the internal lib path to avoid it.
---

## Rule
Never import `pdf-parse` via its package root (`import pdfParse from "pdf-parse"`).
Always import from the internal lib path:

```typescript
import pdfParse from "pdf-parse/lib/pdf-parse.js";
```

**Why:** `pdf-parse@1.1.1` `index.js` unconditionally calls `readFileSync('./test/data/05-versions-space.pdf')` at module load time. In a bundled ESM server (esbuild) the CWD is the dist directory and the file does not exist → `ENOENT` crash on startup. The internal `lib/pdf-parse.js` exports the same function with no self-test.

**How to apply:** Any time pdf-parse is added to a server package, use the internal import. Add `// @ts-ignore` above the import since `@types/pdf-parse` only types the root export.

## Do NOT use pdf-parse v2
`pdf-parse@2.x` depends on `pdfjs-dist` canvas features (`DOMMatrix`, `@napi-rs/canvas`) that are unavailable in a plain Node.js server environment without extra native bindings. Stick to `pdf-parse@1.1.1`.
