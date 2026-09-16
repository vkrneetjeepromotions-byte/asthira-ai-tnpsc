# ASTHIRA AI Mobile Web/PWA

This is the mobile-first web frontend for ASTHIRA AI.

## Vercel
Upload this folder/project to Vercel. It can be hosted as a static website.

## Important
The frontend expects a backend endpoint:
POST /ai/generate

After hosting the backend, set `API_URL` in index.html to the backend HTTPS URL.

The AI API key must stay on the backend, never in this frontend.
