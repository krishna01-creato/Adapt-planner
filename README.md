# Adapt — Adaptive Study Planner & Academic Tracker

An intelligent, distraction-aware study planner with automated timeline scheduling, 60/40 exam readiness tracking, DSA pattern tracker, lost-time recovery, and natural language quick-add.

![Adapt Screenshot](manifest.json) <!-- placeholder or preview -->

## Key Features

- **Automated Dynamic Timeline**: Generates balanced daily schedules taking into account fixed lectures, meals, energy curves, and deadlines.
- **Natural Language Quick Add**: Add tasks instantly using natural phrases like `oops file lab work by 18 sep med` or `Graphs BFS tomorrow high #dsa`.
- **Subject-Wise Syllabus & Exam Readiness**:
  - Live syllabus coverage calculation with smooth circular progress gauges.
  - 60/40 weighted readiness formula (60% syllabus mastery + 40% revision cycles).
  - Quick-cycle status (`○ Not Started` → `⚡ In Progress` → `✓ Mastered`) and topic revision tracker.
- **DSA Pattern & Problem Tracker**:
  - Track mastered algorithmic patterns with compact stepper controls.
  - Live problem count totals and coverage statistics.
- **Weekly Timetable & Overview**:
  - Clean day-by-day strip selector to inspect lectures, pending tasks, and logged study sessions.
- **Lost Time Recovery**:
  - Distraction logging and smart timetable recalibration to recover lost study hours without panic.
- **Offline & Mobile Ready (PWA)**:
  - Responsive design optimized for phones, tablets, and desktops.
  - Installable as a standalone app directly to mobile home screens.

## Quick Start

### 1. Run Locally

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Open `http://localhost:5173` in your browser.

### 2. Build for Production

```bash
npm run build
```

The optimized static production bundle will be generated in `dist/`.

## Deployment Options

### GitHub Pages
1. Push this repository to GitHub.
2. Go to **Settings** → **Pages** → Source: **Deploy from a branch** (`main` / root).
3. Your app is live with zero backend required!

### Vercel / Netlify
- Import the GitHub repository in [Vercel](https://vercel.com) or [Netlify](https://netlify.com).
- Build command: `npm run build`
- Output directory: `dist`

## Tech Stack
- **Structure**: Semantic HTML5 & Web App Manifest (PWA)
- **Styling**: Vanilla CSS with custom design tokens, dark navy theme, and responsive flex/grid layouts
- **Logic**: Vanilla JavaScript (ES Modules, zero heavy runtime dependencies)
- **Tooling**: Vite for fast bundling and hot reload
