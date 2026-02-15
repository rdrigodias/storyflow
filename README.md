<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1f4uimU9d81xsvCEE6-GDQQIl_WcwsaK8

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Backend Local Setup

1. Start PostgreSQL (or run `docker compose up -d postgres`).
2. Create backend env from `backend/.env.example`.
3. Install backend deps:
   `cd backend && npm install`
4. Sync schema:
   `npm run prisma:push`
5. Run backend:
   `npm run dev`
6. Health checks:
   `GET /health` and `GET /ready`
7. Run backend integration tests:
   `cd backend && npm run test:integration`

## CI Checks

- `Backend Integration Tests`: `.github/workflows/backend-integration.yml`
- `Frontend Build`: `.github/workflows/frontend-build.yml`
- To enforce both checks on merge, configure branch protection rules in GitHub repository settings.

## Optimize Style Preview Assets

To regenerate lightweight `.webp` previews for style cards:

`npm run assets:optimize`

Behavior:
- Uses `.png` files from `src/assets` when available.
- If no `.png` exists in `src/assets`, it automatically falls back to the latest `_archive/original_png_*/src/assets`.
