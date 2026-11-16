# Catch Log

Fishing log built with React (Vite), Supabase (Postgres, auth), and GitHub Pages. Log trips and catches, review history, chart trends, and predict catch likelihood from conditions.

## Setup

1. Create a free project at supabase.com. In the SQL Editor, run `schema.sql`.
2. Copy `.env.example` to `.env.local` and fill in the project URL and anon key (Project Settings > API).
3. `npm install` then `npm run dev`.
4. For local testing, you can turn off email confirmation in Supabase under Authentication > Providers > Email.

## Deploy to GitHub Pages

1. Push this folder to a GitHub repo with a `main` branch.
2. Repo Settings > Pages > Source: GitHub Actions.
3. Repo Settings > Secrets and variables > Actions: add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. In Supabase, Authentication > URL Configuration: set the Site URL to your GitHub Pages address.

The anon key is designed to be public. Row-level security in `schema.sql` is what protects each user's data, so never put the `service_role` key in this project.

## Roadmap

1. Log trip form (trip, setups, catches), with weather auto-fill from Open-Meteo
2. Catch history table with filters (uses the `catch_history` view)
3. Charts (Recharts): monthly catches, average length, catch rate by hour, heatmap
4. Python model training and JSON export, then in-browser predictions
