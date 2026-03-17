# Contributing to Team X-Ray

Thanks for your interest in contributing! This guide will help you get started.

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [VS Code](https://code.visualstudio.com/) (latest stable)
- Git

## Development Setup

1. Fork and clone the repository:
   ```bash
   git clone https://github.com/<your-username>/teamxray.git
   cd teamxray
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Open in VS Code:
   ```bash
   code .
   ```
4. Press **F5** to launch the Extension Development Host.

## Project Structure

- `src/core/` — Main analysis logic
- `src/types/` — TypeScript type definitions
- `src/utils/` — Shared utilities
- `src/extension.ts` — Extension entry point

## Running Tests

```bash
npm test
```

Tests live alongside source files in `__tests__/` directories.

## Building

```bash
npm run compile    # TypeScript compilation
npm run package    # webpack bundle for production
```

## Pull Request Guidelines

1. Create a feature branch from `main` (`feat/`, `fix/`, `docs/`, `chore/`).
2. Keep PRs small and focused — one concern per PR.
3. Include a clear title and description.
4. Make sure `npm test` and `npm run compile` pass before opening.
5. Link any related issues in the PR body.

## Code Style

- TypeScript strict mode is enabled.
- Use `async/await` over raw Promises.
- Prefer descriptive variable names over abbreviations.
- Run the linter before committing:
  ```bash
  npm run lint
  ```

## Reporting Issues

Open an issue with steps to reproduce, expected vs. actual behavior, and your VS Code / Node version.

## License

By contributing you agree that your contributions will be licensed under the project's existing license.
