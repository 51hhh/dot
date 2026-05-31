# Backend Development Guidelines

> Project-specific backend/generator guidelines for the `dot` TypeScript CLI.

## Overview

In this project, “backend” means the TypeScript generator pipeline: config loading, validation, dependency graph handling, template rendering, script assembly, and generated shell validation.

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Module organization and file layout | Filled |
| [Database Guidelines](./database-guidelines.md) | Persistence/file-boundary rules; no database currently | Filled |
| [Error Handling](./error-handling.md) | Error propagation, CLI boundary, generated bash errors | Filled |
| [Quality Guidelines](./quality-guidelines.md) | Checks, tests, forbidden patterns | Filled |
| [Logging Guidelines](./logging-guidelines.md) | CLI/generator output conventions | Filled |

## Pre-Development Checklist

- Read `directory-structure.md` before adding or moving source files.
- Read `error-handling.md` before changing config loading, generation, validation, or CLI error paths.
- Read `quality-guidelines.md` before implementation and before reporting completion.
- Read `logging-guidelines.md` before changing stdout/stderr behavior or generated script output.
- Read `database-guidelines.md` when touching file IO or generated output paths.

## Language

Spec documentation is written in English so future agents can consume it consistently.
