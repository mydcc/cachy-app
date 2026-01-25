# **Master Configuration and Working Instructions for SvelteKit**

This document defines the binding rules, processes, and context for all interactions. It serves as the primary instruction basis for the development of SvelteKit web applications. Always answer in English! Write analyses, plans, and walkthroughs in English!

## **1\. Primary Work Process: The 5-Phase Process**

Every request that involves analysis, creation, or modification of code **must** be strictly processed according to the following 5-phase process.

### **Phase 1: Problem Definition and Analysis**

- **Ensure Understanding:** The reported problem or goal is summarized in your own words to validate understanding.
- **Query Context:** All potentially missing information is proactively requested via a fixed checklist:
  - SvelteKit version used (from package.json).
  - Relevant configuration files (svelte.config.js, vite.config.js).
  - The exact code of the affected route, component, or module.
  - The complete output from svelte-check and eslint for the affected files.

### **Phase 2: Development and Presentation of Solution Proposals**

- **Develop Options:** Internally develop **at least four** conceptually different solution approaches. These must consider the design principles of Svelte (reactivity, encapsulation) and SvelteKit (routing, data-loading conventions).
- **Present Proposals:** The four approaches are presented with their respective advantages and disadvantages. Evaluation criteria are: Performance (SSR/CSR impacts), complexity of state management, maintainability, and bundle size.
- **Make Recommendation:** A reasoned recommendation for the preferred approach is given.

### **Phase 3: Detailed Implementation Planning**

- **Create Plan:** After the user chooses an approach, a detailed step-by-step plan for implementation is created.
- **Impact Analysis:** For each step in the plan, the exact change, the reason, and the expected impacts on the SvelteKit application are described (e.g., "Modifying the load function in route /profile", "Creating a new API route +server.js for form actions", "Adjusting the global store").

### **Phase 4: Step-by-Step Implementation with Verification**

- **Sequential Execution:** The plan is executed exactly one step at a time.
- **Quality Gate After Each Step:** After each individual implementation step, a verification **must** be performed using svelte-check and eslint --fix for the changed files. If unit or E2E tests are affected (Vitest, Playwright), their necessary adjustments are pointed out. The next step is only started after a completely error-free run of these tools.

### **Phase 5: Completion**

- **Present Results:** The final, clean code is presented. The code is provided in a form optimized for direct processing by the Jules platform (e.g., as complete, copyable code blocks per file to be changed).
- **Summary:** The implemented solution and the solved problem are summarized at the end.

## **2\. SvelteKit Development Principles**

In addition to the work process, the following development principles apply:

- **Tooling Conformity:** Code must always be compliant with svelte-check and the configured ESLint rules. These tools define the minimum standard for code quality.
- **Convention over Configuration:** The standard file structure and conventions of SvelteKit (e.g., for routing, layouts, API endpoints) must be strictly adhered to.
- **Accessibility (A11Y):** All created UI components must meet web accessibility standards. The rules of eslint-plugin-svelte-a11y must be followed.
- **Performance by Design:** Solution approaches should leverage SvelteKit's strengths for high performance (e.g., loading data in +page.server.js to avoid client-side waterfalls; efficient use of stores).
- **Test Coverage:** For reusable functions or complex business logic, the creation of unit tests with Vitest is recommended and included in the implementation plan.

## **3\. Security Policy: Defensive Deletion**

Deleting code is a critical operation and is subject to strict rules:

- **Check Avoidance:** Always check first whether the goal can be achieved without deletion.
- **Request Approval:** If deletion is unavoidable, the reason and full consequences are explained in detail.
- **Explicit Consent:** The user is explicitly asked for consent. Deletion only occurs after clear confirmation.

## **4\. General Behavioral Rules**

- **Language:** Communication is exclusively in English.
- **Commits:** Git commit messages are written exclusively in English.
- **Tone:** The style is plain text – direct, down-to-earth, in complete sentences, and without filler questions.
- **Fact-Based:** Answers are based only on verified facts. Sources are cited. Knowledge gaps are clearly communicated.
- **Error Culture:** Errors are not apologized for, but directly corrected.
- **Precision:** Answers are short, precise, and have high information density.
- **User Context:** Already known information about the user (interests, etc.) is not repeated in answers.

## 5. Environment for UI Verification (Playwright)

To ensure the reliability of automated UI tests with Playwright and avoid the problems encountered, the following conventions must be observed:

1. **Use Playwright `webServer` Configuration:** For any task that requires UI verification, Playwright **must** be configured to automatically manage the development server.
    - **Action:** Create or edit the configuration file `playwright.config.ts` in the root directory.
    - **Content:** Add a `webServer` configuration. This starts the `npm run dev` command, waits until the URL is reachable, and automatically terminates the server after the tests.
    - **Example Configuration:**

      ```typescript
      import { defineConfig } from "@playwright/test";

      export default defineConfig({
        webServer: {
          command: "npm run dev",
          url: "http://localhost:5173",
          reuseExistingServer: !process.env.CI,
        },
        testDir: "./tests/e2e", // Example test directory
      });
      ```

2. **Reliable Installation with `npm ci`:** In automated test runs or to ensure a consistent environment, `npm ci` should be used instead of `npm install`. This prevents "random" errors due to inconsistent dependencies.

3. **Robust Test Scripts:**
    - Use `click()` on an element to simulate the `:focus` state instead of relying on `:hover`, as this is more reliable in test environments.
    - Use `expect(locator).toBeVisible()` and other web-first assertions to explicitly wait for elements to appear, instead of using manual `waitForTimeout` delays.

## 6. Versioning and Automated Releases

The project uses `semantic-release` to fully automate the release process. This has direct implications for how commits must be created.

- **Automated Process:** On every push to the `main` branch, a GitHub Actions workflow analyzes the commit messages. Based on these messages, the following is automatically:
  - The next version number is determined (according to Semantic Versioning).
  - The `package.json` and `package-lock.json` are updated.
  - A `CHANGELOG.md` is created or updated.
  - A new Git tag and GitHub release are created.

- **Mandatory Commit Convention:** For this automation to work, **all commits must without exception** follow the [Conventional Commits](https://www.conventionalcommits.org/) standard. The agent is responsible for applying this convention with every code change.

- **Commit Types and Their Effects:**
  - `feat`: For new functionalities. Results in a **Minor** release (e.g., 1.2.3 -> 1.3.0).
  - `fix`: For bug fixes. Results in a **Patch** release (e.g., 1.2.3 -> 1.2.4).
  - **Breaking Change:** For changes that break backward compatibility. This is signaled by a `BREAKING CHANGE:` footer in the commit text and results in a **Major** release (e.g., 1.2.3 -> 2.0.0).
  - Other types (`docs`, `chore`, `refactor`, `test`, etc.) result in **no** release.

- **Example Commit:**

  ```markdown
  feat: implement user authentication via email

  Allows users to create an account and sign in.
  ```

- **Example Breaking Change Commit:**

  ```markdown
  refactor: revise API endpoints for consistency

  BREAKING CHANGE: The endpoint `/api/user` has been renamed to `/api/users`.
  ```

## **7. General development conventions**

- NEVER make changes the user hasn't asked for without checking.
- Always proof new or existing translations keys and values with for en and de locales.
- When making code changes, ALWAYS run svelte-check and eslint --fix on the changed files.
- If there are unit tests or E2E tests affected, ALWAYS mention them and whether they need to be updated. 
- Please modify files as minimally as possible to accomplish the task.
- Favour concise code with fewer lines, though not at the expense of readability.
- Make liberal use of debug statements with clear labels (e.g., `console.log('Processing data:', data)`) that identify location and context.
- Don't try to do too many things at once.
- Fix one thing at a time and test the code between every change.
- Build functionality in small steps, testing in between.
- Prototype with libraries to get them working before integrating them.
- Match the existing code style, naming conventions, and patterns unless specifically asked to change them.
- Think like you're making a clean git commit - changes should be focused, related, and minimal.
- Make patches and code replacement specifications as small, granular, and focused as possible.
- Restrict your changes to ONLY what was asked for. Ask before going beyond what was instructed.
- Don't make superfluous changes, whitespace changes, or changes to code that don't relate to the current goal.
- Do not add trailing whitespace to the end of lines. Maintain consistent indentation and line endings.
- Before implementing changes, consider how to make the code simpler and more concise.
- Break long lines of code at 80 characters.
- Look for opportunities to refactor repeated code patterns ONLY in the code you are changing or adding, not in existing code.
- Prefer built-ins to library calls wherever possible.
- When code blocks get nested too deeply refactor into smaller idempotent functions.
- Keep error handling simple and minimal:
  - Let underlying system and library errors pass through unchanged.
  - Don't catch and re-throw with new messages unless absolutely necessary.
  - Only add new error handling for logic in the code being modified.
  - Be consistent with error types and minimize the number of different exceptions.
  - Only handle the most essential errors relevant to the codebase.
- IMPORTANT: if the task is unreasonable of infeasible, or if any of the tests are incorrect, please tell the user.
- Do not hard-code any test cases. Tell the user if the problem is unreasonable instead of hardcoding passing tests.
- Never clean up any code unless the user asks you to.
- Favour small, functional, idempotent and immutable components.
- Decomplect. Break things out into smaller functions each with a single purpose.
- Just because you changed the code it doesn't mean the bug is fixed. Rely on empirical evidence and don't assume.
- Keep existing comments unless asked to modify them.
- Don't forget to chmod +x files you create that are intended to be run.

The user is a detail-oriented anal-retentive control freak. Only do things they specifically ask you to do.

## **8. Modifying code**

- Use the quoted code as the source of truth about the current state of the code in a file.
- Do not assume your previous patches have been applied.
- The user may modify the code between your changes so always check the original source.

## **9. Debugging process**

- Examine the program output or test output and the source code.
- Review both carefully and form one or more hypotheses about what we observe versus what we expect/want.
- Come up with debugging statements or other methods can we use to test the hypotheses.
- Finally, come up with potential fixes to try for each hypothesis IF it turns out to be true.

If the user asks you to follow "debugging process", perform the steps above and give answers in plain english.
When following the "debugging process" don't change any code until asked.

## **10. --- DEBUGGING (CRITICAL RULES) ---**

- Based on the code, start with one or more hypotheses about what's causing the bug. Do not jump to conclusions.
- If there is a test suite add one or more test cases that replicate the bug.
- Insert debugging statements liberally in order to confirm or falsify your hypotheses about the bug.
- Run & test the code again, check the logging output, or ask the user to do this.
- Iterate until you are sure you know how to fix the bug.
- Only once you know the cause of the bug should you issue a patch to fix it.
- Run the test cases, or ask the user to verify the bug is fixed.

## PRESERVING LOGS IS MANDATORY

This is a strict, non-negotiable rule.

1. **ALWAYS** keep all debugging and `console.log` statements that are added during the debugging process.
2. **NEVER** remove, comment out, or "clean up" these statements in any subsequent code patch.
3. The only exception is if the user **explicitly and verbatim** asks you to "remove the debugging statements". Do not infer this request.
4. If you believe the task is complete, present the code with the debugging statements still in place and wait for the user's next instruction. Do not move on to a "cleanup" step.

## **11. Comment guidelines**

- DO NOT add comments that explain changes made (like '// added x'). Comments should only explain what the code does.
- GOOD comment: `const x = 1; // set initial counter value`
- BAD comment:  `const x = 1; // added statement to set x to 1`
- Avoid adding comments unless they clarify non-obvious intent or complex logic.
- Do not add superfluous or verbose comments.

## **12. Markdown style**

- Always add one empty line after headings.

## **13. Command line tools**

If the user asks you to behave in an agentic manner, performing tasks, use the "```bash" block technique to run commands.

- You can use Linux CLI tools like these:
  - `grep STRING FILESPEC` to find STRING in files.
  - `cat FILE` to get a file's contents.
  - `echo "" > FILE` to zero out a file (useful for overwriting).
  - `ls PATH` to list files on a path.
  - `tree PATH` to display a tree of files.
  - `curl URL` to see the contents of a URL.
  - And you can call other Linux commands too like `find`.

For example, to find files in `./src` containing the string 'hello' you can output this:

```bash
rgrep src 'hello'
```

The user will then run this code and give you the response. You can also write more complex scripts to perform tasks and then run them with a bash block. Generally store these in `./bin`. NEVER split one-liners over multiple lines with a backslash ("\") as they won't be parsed correctly.

## **14. Communication style**

- The user is a senior software developer.
- You DO NOT need to tell the user (unless asked):
  - How to open index.html in the browser.
  - How to run a webserver to serve HTML.
  - To run the dev server.
  - To run `make watch`.

## **15. Reporting outputs**

A good general information heirarchy you should should use in Markdown reports and other outputs, is to show easy to read summary lists at the start and then more detailed content below.

## **16. Common bugs to avoid**

- You can't put comments in JSON importmaps.
- Avoid the string "data" with a colon directly after it. Assemble this string if you need it.
- In LISP code be very careful about matching braces and check brace counts twice.
- Don't name vars after built-ins like 'val'.

## **17. STRONGLY FAVOURED PARADIGMS**

- Immutability
- Idempotency
- Functional programming
- DRY
- Single source of truth
- Minimal deps
- YAGNI
- Under-engineering
- Root-cause fixes
- KISS
- Epistemic humility 👈️
