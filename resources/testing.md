# Testing Best Practices Resources

> Testing strategies, frameworks, and best practices for Node.js/TypeScript applications

**🎯 Purpose:** Testing resources for AI agents using octocode-mcp to generate Node.js/TypeScript applications
**🤖 For:** AI agents and developers implementing tests for Node.js applications
**🌐 Focus:** Vitest, Jest, Playwright - JavaScript/TypeScript testing
**📱 Mobile:** React Native testing with Jest, Testing Library, Detox
**⚙️ Runtime:** All tests run on Node.js (unit, integration, E2E)

**Last Updated:** October 13, 2025

---

## 🎯 Best for Application Generation

This file provides **testing guidance** to help AI agents:
1. **Choose framework** - Vitest vs Jest for unit/integration tests
2. **E2E testing** - Playwright vs Cypress for end-to-end tests
3. **Test React** - React Testing Library, React Native Testing Library
4. **Apply strategies** - Testing pyramid, TDD, mutation testing
5. **Test mobile** - Same testing patterns for web and React Native

**Generation Priorities:**
- ⚡ **Vitest** - Modern, fast, Vite-native testing (2025 default)
- ⚡ **Playwright** - Best E2E testing with cross-browser support
- ⚡ **React Testing Library** - User-centric component testing
- ⚡ **Testing Pyramid** - More unit tests, fewer integration, minimal E2E

---

## Testing Best Practices

**⭐ goldbergyoni/javascript-testing-best-practices** (24,528 stars) ⚡ ESSENTIAL
- 📗🌐 🚢 Comprehensive and exhaustive JavaScript & Node.js testing best practices (August 2025)
- 🔗 https://github.com/goldbergyoni/javascript-testing-best-practices
- **Use Case:** The #1 resource for complete testing best practices guide covering unit, integration, E2E, and advanced topics like mutation testing and property-based testing
- **Key Topics:** AAA pattern, behavior-driven testing, test naming conventions, mocking strategies, CI/CD integration

**⭐ goldbergyoni/nodejs-testing-best-practices** (4,176 stars)
- Beyond the basics of Node.js testing. Including a super-comprehensive best practices list and an example app (April 2025)
- 🔗 https://github.com/goldbergyoni/nodejs-testing-best-practices
- **Use Case:** Advanced Node.js testing practices and patterns

**⭐ testing-library/eslint-plugin-testing-library** (1,035 stars)
- ESLint plugin to follow best practices and anticipate common mistakes when writing tests with Testing Library
- 🔗 https://github.com/testing-library/eslint-plugin-testing-library
- **Use Case:** Enforce testing best practices and catch common testing anti-patterns

---

## Unit Testing

### Vitest (Modern Jest Alternative - Recommended for 2025)

**⭐ vitest-dev/vitest** (12,000+ stars) ⚡ TRENDING
- ⚡️ Next generation testing framework powered by Vite
- 🔗 https://github.com/vitest-dev/vitest
- **Use Case:** Modern, blazing-fast unit testing framework with native ESM, TypeScript, and JSX support
- **Why Vitest in 2025:**
  - Built on Vite for lightning-fast test execution
  - Drop-in replacement for Jest with compatible API
  - Native ES modules, TypeScript, and JSX support out of the box
  - No separate build pipeline configuration needed
  - Parallel test execution by default
  - Released v3 in January 2025 with powerful CLI features
- **When to Choose:** New projects, Vite-based apps, modern TypeScript/ESM codebases
- **Comparison:** https://vitest.dev/guide/comparisons

### Jest (Industry Standard)

**⭐ jestjs/jest** (44,000+ stars)
- Delightful JavaScript Testing Framework with a focus on simplicity
- 🔗 https://github.com/jestjs/jest
- **Use Case:** Mature, widely-adopted testing framework with extensive ecosystem
- **Why Jest:**
  - 40+ million weekly npm downloads
  - Rich feature set with built-in mocking, code coverage, and snapshot testing
  - Massive ecosystem and community support
  - Better support for React Native and legacy projects
  - Parallel test execution and built-in watch mode
- **When to Choose:** React Native projects, legacy codebases, teams already using Jest
- **Recommendation:** Use Vitest for new projects unless your framework/library has better Jest support

---

## Integration Testing

**⭐ testdouble/testdouble.js** (1,500+ stars)
- A minimal test double library for TDD with JavaScript
- 🔗 https://github.com/testdouble/testdouble.js
- **Use Case:** Sophisticated mocking and stubbing for integration tests

**⭐ sinonjs/sinon** (9,600+ stars)
- Test spies, stubs and mocks for JavaScript
- 🔗 https://github.com/sinonjs/sinon
- **Use Case:** Comprehensive mocking library for integration testing
- **Features:** Spies, stubs, mocks, fake timers, fake XMLHttpRequest

---

## E2E Testing

### Playwright (Recommended for 2025)

**⭐ microsoft/playwright** (65,000+ stars) ⚡ TRENDING
- Playwright is a framework for Web Testing and Automation
- 🔗 https://github.com/microsoft/playwright
- **Use Case:** Modern, powerful E2E testing across all major browsers
- **Why Playwright in 2025:**
  - Native support for Chrome, Firefox, and Safari (WebKit)
  - Multi-language support (JavaScript, TypeScript, Python, C#, Java)
  - Built-in parallel execution for fast test suites
  - Advanced network interception and API mocking
  - Seamless cross-origin testing
  - Mobile device emulation
  - Auto-wait and retry mechanisms for flake-free tests
  - Screenshot and video capture on failures
- **When to Choose:** Cross-browser testing, large-scale projects, need for speed and stability
- **Best Practices:**
  - Use data-test attributes for selectors
  - Mock API requests for deterministic tests
  - Keep tests independent
  - Integrate into CI/CD (GitHub Actions, GitLab CI)
  - Run essential tests for quick feedback, full suites on schedule

### Cypress (Alternative for SPA-focused Testing)

**⭐ cypress-io/cypress** (46,000+ stars)
- Fast, easy and reliable testing for anything that runs in a browser
- 🔗 https://github.com/cypress-io/cypress
- **Use Case:** Developer-friendly E2E testing with excellent DX
- **Why Cypress:**
  - Runs directly in browser for native DOM access
  - Superior debugging experience with time-travel
  - Real-time reloads and interactive test runner
  - Powerful dashboard for visualizing test runs
  - Excellent for Single-Page Applications (SPAs)
- **Limitations:**
  - JavaScript/TypeScript only
  - Chromium and Firefox only (no Safari)
  - Requires paid plan for parallel execution
  - Same-origin policy limitations
- **When to Choose:** SPA-focused projects, teams prioritizing DX, fast setup requirements

### Comparison: Playwright vs Cypress

| Feature | Playwright | Cypress |
|---------|-----------|---------|
| **Browser Support** | Chrome, Firefox, Safari | Chrome, Firefox only |
| **Languages** | JS, TS, Python, C#, Java | JS, TS only |
| **Parallel Execution** | Native & free | Paid plan required |
| **Cross-Origin** | Seamless | Limited |
| **Speed** | Faster for large suites | Fast for SPAs |
| **DX** | Automation-focused | Developer-focused |

---

## React Testing

**⭐ testing-library/react-testing-library** (19,000+ stars) ⚡ ESSENTIAL
- 🐐 Simple and complete React DOM testing utilities that encourage good testing practices
- 🔗 https://github.com/testing-library/react-testing-library
- **Use Case:** Industry standard for testing React components (72% developer adoption in 2025)
- **Philosophy:** "The more your tests resemble the way your software is used, the more confidence they can give you"
- **Key Principles:**
  - Test behavior, not implementation details
  - Query components as users would (by text, role, label)
  - Avoid testing internal component state
  - Promote accessibility-friendly selectors
- **Best Practices:**
  - Use `screen` queries for better error messages
  - Prefer `getByRole` and `getByLabelText` queries
  - Use `userEvent` over `fireEvent` for realistic interactions
  - Test user workflows, not isolated components
- **Works With:** Jest, Vitest, and any test runner

**⭐ testing-library/react-hooks-testing-library** (5,277 stars)
- 🐏 Simple and complete React hooks testing utilities
- 🔗 https://github.com/testing-library/react-hooks-testing-library
- **Use Case:** Testing React hooks in isolation
- **Note:** Now integrated into React Testing Library for React 18+

**⭐ testing-library/user-event** (2,100+ stars)
- Simulate user interactions for Testing Library
- 🔗 https://github.com/testing-library/user-event
- **Use Case:** More realistic user interaction simulation than fireEvent
- **Features:** Keyboard navigation, click sequences, clipboard operations

---

## Testing Strategies & TDD

### Core Testing Principles (2025)

1. **Arrange-Act-Assert (AAA) Pattern**
   - Arrange: Set up test data and conditions
   - Act: Execute the code being tested
   - Assert: Verify the expected outcome
   - Benefits: Clear structure, easy debugging, consistent format

2. **Test Behavior, Not Implementation**
   - Focus on what code does, not how it works
   - Makes tests resilient to refactoring
   - Tests serve as effective documentation
   - Use descriptive test names that explain expected behavior

3. **Keep Tests Simple and Readable**
   - Short, flat, and delightful to work with
   - One assertion concept per test
   - Avoid complex setup with beforeEach/beforeAll
   - Use descriptive names for test scenarios

4. **Test Independence**
   - Each test should set up its own state
   - No dependencies between tests
   - Tests should pass in any order
   - Prevents flaky test results

5. **Avoid Overusing Mocks**
   - Mock only external dependencies
   - Prefer real implementations when possible
   - Too many mocks = testing mock behavior
   - Balance between isolation and realism

### The Testing Pyramid

```
        /\
       /E2E\         Small number (10-20%)
      /------\
     /INTEGR.\      Moderate number (20-30%)
    /----------\
   /   UNIT     \   Large number (50-70%)
  /--------------\
```

**Target Coverage:** 70-80% overall (industry benchmark 2025)

### TDD Cycle (Red-Green-Refactor)

1. **Red:** Write a failing test first
2. **Green:** Write minimal code to pass the test
3. **Refactor:** Clean up code without changing behavior

**Benefits:**
- Reduces bugs by up to 40%
- Identifies issues early in development
- Improves code design and testability
- Living documentation through tests

### Modern Testing Stack (2025)

**Recommended Stack:**
- **Unit Tests:** Vitest (or Jest for legacy projects)
- **React Components:** React Testing Library + Vitest
- **E2E Tests:** Playwright (or Cypress for SPAs)
- **API Tests:** Vitest with MSW (Mock Service Worker)
- **CI/CD:** GitHub Actions, GitLab CI, or Jenkins

**Emerging Trends:**
- AI-powered test generation and maintenance
- Unified frameworks blending unit/integration/E2E
- Visual and behavioral regression testing
- Component testing in real browsers (Vitest Browser Mode, Playwright Component Tests)

---

## Additional Testing Tools

**⭐ mochajs/mocha** (22,836 stars)
- ☕️ Simple, flexible, fun JavaScript test framework
- 🔗 https://github.com/mochajs/mocha
- **Use Case:** Flexible testing framework with simple setup
- **Note:** Consider Vitest or Jest for new projects

**⭐ avajs/ava** (20,700+ stars)
- Node.js test runner that lets you develop with confidence
- 🔗 https://github.com/avajs/ava
- **Use Case:** Minimal and fast Node.js test runner with isolated test processes

**⭐ mswjs/msw** (15,000+ stars)
- Seamless REST/GraphQL API mocking library for browser and Node.js
- 🔗 https://github.com/mswjs/msw
- **Use Case:** Mock APIs at network level for realistic testing
- **Why MSW:** Works in both tests and browser, no code changes needed

---

## Quick Reference

### Testing Strategy Guide

**Choose Your Tools:**
- **Unit Testing:** Vitest (new projects) or Jest (existing/legacy)
- **React Testing:** React Testing Library + Vitest/Jest
- **E2E Testing:** Playwright (cross-browser, scale) or Cypress (SPA, DX)
- **API Mocking:** MSW (Mock Service Worker)

**Best Practices Checklist:**
- ✅ Follow goldbergyoni/javascript-testing-best-practices
- ✅ Use AAA (Arrange-Act-Assert) pattern
- ✅ Test behavior, not implementation
- ✅ Keep tests simple and independent
- ✅ Aim for 70-80% coverage
- ✅ Mock only external dependencies
- ✅ Use descriptive test names
- ✅ Integrate tests into CI/CD
- ✅ Capture screenshots/videos on E2E failures
- ✅ Run essential tests for quick feedback

**Top 3 Testing Tools for 2025:**
1. **Vitest** - Modern, fast unit testing framework
2. **Playwright** - Powerful cross-browser E2E testing
3. **React Testing Library** - User-centric component testing

---

*Part of octocode-mcp resources collection*
