// Ambient declaration so `tsc` accepts the CSS imports in the 'use dom' bundle.
// Metro handles the actual CSS at web-bundle time; TypeScript just needs the
// module to exist. Scoped to the editor's fenced dir.
declare module "*.css";
