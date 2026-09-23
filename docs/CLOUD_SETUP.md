# Cloud / smartphone setup

AI Web Factory supports two modes.

- local: existing Windows + SQLite mode
- cloud: Supabase Auth + Supabase Postgres management mode

The local mode remains the default, so adding cloud support does not delete the existing SQLite database.

## What cloud mode supports now

- Email/password login
- PC and smartphone access to the same project list
- Project create/edit
- Search/filter
- Project detail/history
- Workflow status changes
- Production-start approval
- Final-delivery approval
- User-by-user data isolation with Row Level Security

Local analysis, static-site generation, preview, quality checks and export still run on the Windows/local mode for now. Cloud mode intentionally shows them as PC-side production features until generated site files are moved to cloud storage.

## Supabase setup

1. Create a Supabase project.
2. Open SQL Editor and run:
   supabase/migrations/20260923_cloud_auth.sql
3. Create the first user in Authentication.
4. Copy the Project URL and Publishable Key.
5. Create frontend/.env.local from frontend/.env.example.
6. Set:
   VITE_APP_MODE=cloud
   VITE_SUPABASE_URL=...
   VITE_SUPABASE_PUBLISHABLE_KEY=...
7. Run npm install and npm run dev.

Do not put a service_role key in Vite/frontend environment variables.

## Security

Every cloud table has owner_id and Row Level Security. Policies compare owner_id with auth.uid(), so authenticated users can only select/update rows that belong to their account.

Critical workflow changes use Postgres functions instead of direct status updates. The database verifies:

- status transition order
- production_start approval before 制作中
- final_delivery approval before 納品
- approval stage requirements

The browser does not receive permission to directly update the project status column.

## Smartphone

After the frontend is deployed to an HTTPS host, open the same URL from the smartphone and log in with the same account.

A later phase will move site generation and preview artifacts to cloud storage. Until then, production generation remains a PC-side operation while management and approvals can be done from mobile.
