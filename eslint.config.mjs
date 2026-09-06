import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // The shared layers may not reach back into a route. Six imports had
    // grown the other way, which meant an admin route module could not be
    // renamed without breaking a "shared" component, and those components
    // could not be read or reused without the route coming along. Anything
    // a route needs to hand a shared component is a prop or a module that
    // belongs in the shared layer to begin with.
    files: [
      "src/components/**",
      "src/lib/**",
      "src/services/**",
      "src/utils/**",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/app/*", "@/app/**", "**/app/(dashboard)/**"],
              message:
                "Shared code must not import from src/app. Move the module into the shared layer, or the component next to its route.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
