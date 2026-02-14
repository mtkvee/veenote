# Cloud Notes (Next.js + Firebase)

Mobile-first note app with:
- Google sign-in
- Firestore real-time cloud sync
- Label dropdown filter
- Label management modal
- Search on note title/body
- Floating `+` button to open note editor

## 1. Install and run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## 2. Firebase setup

1. Create a Firebase project in Firebase Console.
2. Add a Web app and copy the Firebase config values.
3. Enable `Authentication -> Sign-in method -> Google`.
4. Create Firestore database (recommended: `Production mode`).
5. Copy `.env.example` to `.env.local` and fill values:

PowerShell:
```powershell
Copy-Item .env.example .env.local
```

macOS/Linux:
```bash
cp .env.example .env.local
```

6. Set the Firebase project ID in `.firebaserc`:

```json
{
  "projects": {
    "default": "your-firebase-project-id"
  }
}
```

7. Login and deploy Firestore rules/indexes:

```bash
npm run firebase:login
npm run firebase:deploy:firestore
```

## 3. Firestore security rules

Rules are versioned in `firestore.rules` and already scoped so each user can only read/write their own path:
- `users/{uid}/...`

Deploy updates with:
```bash
npm run firebase:deploy:firestore
```

## 4. Data model

- `users/{uid}/labels/{labelId}`
  - `name: string`
  - `createdAt: timestamp`
- `users/{uid}/notes/{noteId}`
  - `title: string`
  - `body: string`
  - `labelId: string`
  - `labelName: string`
  - `createdAt: timestamp`
  - `updatedAt: timestamp`
