// Next.js handles stylesheets at build time. TypeScript 5.9 needs a declaration
// for side-effect CSS imports before the generated types are available.
declare module "*.css";
declare module "*.scss";
