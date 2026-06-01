# Frontend Development Guidelines

> Terminal UI and generated-script UX guidelines for this project.

## Overview

The frontend layer includes terminal-facing interfaces and the developer-side Plan Canvas Studio:

- current Node.js CLI menus
- generated bash TUI inside self-contained `dot.sh` scripts
- React Flow Studio under `src/studio/` for editing and reviewing `InstallationPlan`

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | CLI/menu and generated TUI organization | Filled |
| [Component Guidelines](./component-guidelines.md) | Terminal UI and Plan Canvas component patterns | Filled |
| [Hook Guidelines](./hook-guidelines.md) | Stateful interaction loop conventions | Filled |
| [State Management](./state-management.md) | Selection, prompt, and execution state | Filled |
| [Quality Guidelines](./quality-guidelines.md) | UI/output checks and forbidden patterns | Filled |
| [Type Safety](./type-safety.md) | Menu action types, Zod validation, safe ids | Filled |

## Pre-Development Checklist

- Read `directory-structure.md` before changing CLI/menu or generated TUI layout.
- Read `component-guidelines.md` before changing menu rendering, generated bash TUI helpers, or Plan Canvas layout.
- Read `state-management.md` before changing selection, prompt, dependency display, or execution state.
- Read `type-safety.md` before changing config/menu data shapes or `InstallationPlan` graph contracts.
- Read `quality-guidelines.md` before reporting completion.

## Language

Spec documentation is written in English so future agents can consume it consistently.
