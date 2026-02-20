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
  - `updatedAt: timestamp`
- `users/{uid}/notes/{noteId}`
  - `title: string`
  - `body: string`
  - `labelIds: string[]`
  - `labelNames: string[]`
  - `labelId: string` (legacy/primary label compatibility field)
  - `labelName: string` (legacy/primary label compatibility field)
  - `updatedAtMs: number`
  - `updatedAt: timestamp`

## 5. Production sync integration test plan

Goal: verify that create/update/delete changes on Device A appear on Device B automatically with no manual refresh.

### Preconditions

1. Both devices point to the same Firebase project (`.env.local` values match).
2. Firestore rules/indexes are deployed:
   ```bash
   npm run firebase:deploy:firestore
   ```
3. Start app:
   ```bash
   npm run dev
   ```
4. Open app on two browsers/devices and sign in with the same account.

### Test A: Create note propagation

1. On Device A, create a note with unique text like `sync-create-<timestamp>`.
2. Expected on Device B:
   - New note appears automatically.
   - No manual reload required.
   - Target propagation: typically under 1s on stable network.

### Test B: Update note propagation

1. On Device A, edit the note title/body and save.
2. Expected on Device B:
   - Updated fields appear automatically.
   - Note ordering updates if `updatedAtMs` changes.

### Test C: Delete note propagation

1. On Device A, delete the note.
2. Expected on Device B:
   - Note disappears automatically without refresh.

### Test D: Label create/update relationship propagation

1. On Device A, create a new label and assign it to an existing note.
2. Expected on Device B:
   - Label appears in label manager/filter.
   - Note shows assigned label(s).

### Test E: Label delete cascades to notes

1. On Device A, delete a label currently attached to one or more notes.
2. Expected on Device B:
   - Label is removed from label manager/filter.
   - Affected notes no longer include that label.

### Test F: Auth change cleanup/re-subscribe

1. On Device A, sign out and sign in again.
2. Expected:
   - Old user data is cleared on sign-out.
   - After sign-in, notes/labels rehydrate via live snapshots.
3. While Device A is signed out, create/edit notes from Device B.
4. Sign Device A back in.
5. Expected:
   - Device A receives latest remote state automatically.

### Test G: Offline -> online recovery

1. On Device A, disconnect network (airplane mode or devtools offline).
2. Try creating/updating a note.
3. Reconnect network.
4. Expected:
   - Failed write paths show an error prompt.
   - Retried action after reconnect commits successfully.
   - Device B reflects committed changes automatically.

### Pass criteria

1. All tests A-G pass with no manual refresh.
2. No stale notes/labels remain after auth transitions.
3. Cross-device state converges to identical notes/labels for the same user.

## 6. Production sync configuration checklist

Use this checklist before production deploys to keep write-to-read latency low.

1. Region:
   - Create Firestore in the region closest to your primary users.
   - Keep your web hosting and Firebase project in the same geography when possible.
2. Indexing:
   - Ensure `updatedAtMs` ordering queries are deployed with current Firestore rules/indexes:
     ```bash
     npm run firebase:deploy:firestore
     ```
   - Resolve any Firestore console index warnings before release.
3. Caching:
   - This app uses `getFirestore(app)` (memory cache only), not persistent local cache.
   - This avoids stale cross-tab cache behavior and prioritizes live server snapshots.
4. Listener model:
   - Keep `onSnapshot` subscriptions active for both labels and notes.
   - Do not reintroduce polling or interval-based sync loops.
5. Write path:
   - Keep writes immediate (`setDoc`/`deleteDoc`), no debounce/throttle on save.
   - Use `writeBatch` for related multi-document updates (e.g., label delete cascade).
