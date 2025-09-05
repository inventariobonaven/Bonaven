# Bonaven / Inventario-Producción

## Backend
1) Copia `backend/.env.example` a `backend/.env` y completa variables.
2) `cd backend && npm ci && npm run dev` (o `npm start` en producción).

## Frontend
1) Copia `frontend/.env.example` a `frontend/.env`.
2) `cd frontend && npm ci && npm run dev` (build: `npm run build`).

## Deploy (resumen)
- Backend: Render/Railway — build: `npm ci && npm run postinstall` y start: `npm start` (root: backend).
- Frontend: Vercel/Netlify — build: `npm ci && npm run build` (root: frontend), output: `dist`.
- Configura `VITE_API_URL` apuntando al backend desplegado.
