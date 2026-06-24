---
name: OpenAPI codegen multipart and barrel export quirks
description: Multipart/form-data endpoints break codegen due to browser File/Blob types; barrel export conflicts between zod schemas and TypeScript types.
---

## Rule
Never add multipart/form-data endpoints to the OpenAPI spec. Handle them as raw Express routes with manual TypeScript types on the frontend.

**Why:** Orval generates `File`/`Blob` references for binary uploads, which aren't available in the Node.js tsconfig (`lib: ["es2022"]`). Adding `dom` to the api-zod tsconfig alone doesn't fully solve it — the generated const `UploadCsvBody` (zod schema) and type `UploadCsvBody` (TypeScript type) create an ambiguous re-export conflict in the barrel.

**How to apply:** For any file-upload endpoint (CSV, images, etc.):
1. Keep the response schema in OpenAPI (it generates correctly)
2. Remove the endpoint path + request body from the spec
3. Implement the Express route manually with `multer`
4. Define the response type manually in the frontend (a small interface)
5. Use raw `fetch` + `FormData` on the frontend — no generated hook needed

## Barrel export fix
`lib/api-zod/src/index.ts` must use:
```ts
export * from "./generated/api";
export type * from "./generated/types";
```
(not `export *` for both — using `export type *` for types prevents const/type name conflicts)
