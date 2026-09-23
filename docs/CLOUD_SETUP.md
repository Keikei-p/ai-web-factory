# Cloud / smartphone setup with Firebase

AI Web Factory supports two modes.

- local: Windows + SQLite. All local production features remain available.
- cloud: Firebase Authentication + Cloud Firestore + Firebase Hosting.

The local mode is still the default. Switching cloud support on does not delete the existing SQLite database.

## Cloud mode supports now

- Email/password login
- PC and smartphone access to the same project list
- Project create/edit
- Search/filter
- Project detail/history
- Workflow status changes
- Production-start approval
- Final-delivery approval
- Per-user data isolation with Firestore Security Rules
- Home-screen friendly web app metadata

Local analysis, site generation, preview, quality checks and export are still PC/local operations for now.

## Firebase console setup

1. Create a Firebase project.
2. Add a Web App to that Firebase project.
3. Authentication → Sign-in method → enable Email/Password.
4. Authentication → Users → create the first user.
5. Firestore Database → create a database.
6. Copy the Firebase Web App configuration values.
7. Create frontend/.env.local from frontend/.env.example and fill the values.
8. Set VITE_APP_MODE=cloud.
9. Deploy Firestore rules/indexes and Hosting.

Example commands from the repository root:

    npm install
    npm run build
    npx firebase-tools login
    npx firebase-tools use --add
    npx firebase-tools deploy --only firestore,hosting

Firebase Hosting serves the web app over HTTPS.

## Environment variables

    VITE_APP_MODE=cloud
    VITE_FIREBASE_API_KEY=...
    VITE_FIREBASE_AUTH_DOMAIN=...
    VITE_FIREBASE_PROJECT_ID=...
    VITE_FIREBASE_STORAGE_BUCKET=...
    VITE_FIREBASE_MESSAGING_SENDER_ID=...
    VITE_FIREBASE_APP_ID=...

These are Firebase Web App configuration values. Do not add server credentials or service-account private keys to the frontend.

## Firestore structure

    projects/{projectId}
      ├ approvals/{approvalId}
      ├ history/{historyId}
      ├ analyses/{analysisId}
      ├ specifications/{specificationId}
      ├ site_builds/{buildId}
      ├ quality_checks/{checkId}
      └ revision_requests/{revisionId}

Each project has owner_id. Security Rules compare owner_id to request.auth.uid.

## Critical workflow safety

The browser cannot freely jump project status.

Firestore Security Rules verify:

- allowed status transitions
- production_start approval before 制作中
- final_delivery approval before 納品
- production_start can only be recorded in 制作待ち
- final_delivery can only be recorded in 最終確認
- ownership cannot be changed by normal users

The app also uses Firestore transactions so the project update and audit entries are written together.

## Smartphone

After Firebase Hosting deployment:

1. Open the Firebase Hosting URL on the smartphone.
2. Log in with the same account.
3. Add the site to the home screen if desired.

The current smartphone role is project management and approval. Site generation remains on the PC until generated files and preview execution are moved to cloud infrastructure.

## Existing local data

The SQLite database is intentionally left untouched.

Do not manually copy it into Firestore yet. A controlled migration tool should be added after the Firebase project is connected, so owner_id and history relationships can be assigned correctly.
