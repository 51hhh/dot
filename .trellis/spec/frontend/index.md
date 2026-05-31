# Frontend Development Guidelines

> Terminal UI and generated-script UX guidelines for this project.

## Overview

This project has no web frontend. The frontend layer is the terminal-facing interface: current Node.js CLI menus and future generated bash TUI inside self-contained `dot.sh` scripts.

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | CLI/menu and generated TUI organization | Filled |
| [Component Guidelines](./component-guidelines.md) | Terminal UI component patterns | Filled |
| [Hook Guidelines](./hook-guidelines.md) | Stateful interaction loop conventions | Filled |
| [State Management](./state-management.md) | Selection, prompt, and execution state | Filled |
| [Quality Guidelines](./quality-guidelines.md) | UI/output checks and forbidden patterns | Filled |
| [Type Safety](./type-safety.md) | Menu action types, Zod validation, safe ids | Filled |

## Pre-Development Checklist

- Read `directory-structure.md` before changing CLI/menu or generated TUI layout.
- Read `component-guidelines.md` before changing menu rendering or generated bash TUI helpers.
- Read `state-management.md` before changing selection, prompt, dependency display, or execution state.
- Read `type-safety.md` before changing config/menu data shapes.
- Read `quality-guidelines.md` before reporting completion.

## Language

Spec documentation is written in English so future agents can consume it consistently.
