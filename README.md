# DBStudio

A modern desktop database client for MySQL, PostgreSQL, and SQLite — built with Electron, React, and Monaco Editor.

![License](https://img.shields.io/badge/license-PolyForm%20Noncommercial-blue)
![Platform](https://img.shields.io/badge/platform-Windows-lightgrey)
![Version](https://img.shields.io/github/v/release/maxsheva888/dbstudio)

---

## Features

### Connections
- Connect to **MySQL**, **PostgreSQL**, and **SQLite** databases
- **SSH tunnel** support for remote servers
- Connection **tags** (local / dev / prod) with color-coded status bar
- Multiple simultaneous connections with quick switching
- Keepalive monitoring — detects lost connections and shows visual indicator

### SQL Editor
- **Monaco** editor with SQL syntax highlighting (same engine as VS Code)
- `Ctrl+Enter` to execute — runs selected text or full query
- **Safe mode** shield — blocks accidental write operations
- Virtual scrolling for up to **10,000 rows**
- **Pagination** for queries returning 10,000+ rows

### Script Library
- Save and organize SQL scripts with **automatic versioning**
- Full **version history** with diff viewer
- Run statistics, smart suggestions, full-text search
- Global and context-scoped scripts (per database or per table)

### Query Log
- Every query logged with duration, row count, and status
- **Smart hints** — detects missing indexes and full-table scans
- Grade system (A–F) based on performance
- Inline **EXPLAIN** and **CSV export**

### Table Viewer
- Browse tables with server-side pagination, filter, and sort
- **Inline cell editing** with JSON modal for JSON columns

### Schema Diagram (ERD)
- Auto-generated entity-relationship diagram for any database
- Pan, zoom, and minimap navigation

### Auto-Updates
- Checks for new versions on startup and installs them in one click

---

## Installation

Download the latest installer from the [Releases](https://github.com/maxsheva888/dbstudio/releases) page.

| Platform | File |
|---|---|
| Windows | `dbstudio-x.x.x-setup.exe` |

Run the installer — DBStudio will be added to your Start Menu and Desktop.

---

## Build from Source

**Requirements:** Node.js 20+, npm

```bash
git clone https://github.com/maxsheva888/dbstudio.git
cd dbstudio
npm install
npm run dev
```

**Build installer:**
```bash
npm run package
```

Output will be in the `dist/` directory.

---

## License

DBStudio is free to use and distribute under the
[PolyForm Noncommercial License 1.0.0](LICENSE).

**Commercial use and resale are not permitted.**
