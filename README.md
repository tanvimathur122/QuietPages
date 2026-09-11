# Quiet Pages

A calm, accessible full-stack journaling platform for honest thoughts.

## Phase 4
- Pen names and profile bio
- Edit and delete journal pages
- Drafts
- Public, private and anonymous visibility
- Bookmarks / saved pages
- Writing streaks
- Light, dark and system themes
- Adjustable text size and reduced motion
- Mood and category filters
- Guided prompts
- Admin moderation, reports and analytics

## Run locally
1. Install Node.js.
2. Copy `.env.example` to `.env`.
3. Set a strong `JWT_SECRET` and your `ADMIN_EMAIL`.
4. Run `npm install`.
5. Run `npm run dev`.
6. Open `http://localhost:3000`.

The SQLite database is created automatically. Existing Quiet Pages databases are migrated when the server starts.

## Privacy
Private pages are excluded from public APIs. Anonymous pages show `Anonymous` publicly while the owner relationship remains available to the protected admin system for moderation.

## GitHub
Do not commit `.env`, `quiet-pages.db`, `node_modules`, or generated local files.
