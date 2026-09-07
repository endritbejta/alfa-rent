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
    /*
     * eslint-config-next turns on six jsx-a11y rules, all as warnings, so
     * they could not fail anything even when they fired — and the suite
     * reporting zero warnings read as "accessibility is clean" while two
     * selects had no label, a duplicate id pointed one at the wrong control,
     * and a table row was wearing role="button" with buttons inside it.
     *
     * These are the rules that would have caught those, as errors. Where an
     * exception is genuinely right — a row that is the pointer target but
     * not itself a control — it is disabled in place with the reason.
     */
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      // `assert: "either"` because the shared Label is generic: callers
      // point it at a control with htmlFor, and the filter panels nest the
      // control inside instead. Both are correct; the default insists on
      // nesting.
      "jsx-a11y/label-has-associated-control": ["error", { assert: "either" }],
      "jsx-a11y/interactive-supports-focus": "error",
      "jsx-a11y/click-events-have-key-events": "error",
      "jsx-a11y/no-static-element-interactions": "error",
      "jsx-a11y/anchor-is-valid": "error",
      "jsx-a11y/heading-has-content": "error",
      "jsx-a11y/no-autofocus": "error",
      "jsx-a11y/tabindex-no-positive": "error",
      "jsx-a11y/no-noninteractive-element-interactions": "error",
      "jsx-a11y/role-has-required-aria-props": "error",
      "jsx-a11y/aria-props": "error",
      "jsx-a11y/alt-text": "error",
    },
  },
  {
    // The shared layers may not reach back into a route. Six imports had
    // grown the other way, which meant an admin route module could not be
    // renamed without breaking a "shared" component, and those components
    // could not be read or reused without the route coming along. Anything
    // a route needs to hand a shared component is a prop or a module that
    // belongs in the shared layer to begin with.
    files: ["src/components/**", "src/lib/**", "src/services/**"],
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
