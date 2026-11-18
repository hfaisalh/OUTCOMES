# Google Sheets setup (one time)

What this does: lets people use "Load from Google Sheet" in the Module 1 page. Each person signs in with their own Google account and gives one **read-only** permission (view Google Sheets). The page can never change a sheet. The sign-in token stays in memory and expires in about an hour.

Who can read a sheet is decided by the sheet's sharing. Someone who is not shared on the sheet gets "You don't have access to this sheet".

Google's screens change from time to time, so names below may differ a little.

## Steps (about 10 minutes, once)

1. Go to https://console.cloud.google.com and sign in with an MWF Google account. Create a project called **OUTCOMES**.
2. **Enable the API.** APIs and services, then Library, search **Google Sheets API**, click Enable.
3. **Consent screen** (Google Auth Platform, or "OAuth consent screen"):
   - App name: OUTCOMES. Support email: yours.
   - Audience: choose **Internal** if MWF uses Google Workspace (only MWF accounts can sign in). Otherwise choose External and add each person as a test user.
   - Add the scope `https://www.googleapis.com/auth/spreadsheets.readonly` (view your Google Sheets).
4. **Create the client ID.** Credentials, Create credentials, **OAuth client ID**, type **Web application**.
   - Authorised JavaScript origins: `http://localhost:5173` (and the real address later, when the developers host it).
   - No redirect address is needed.
5. Copy the **Client ID** (it ends in `.apps.googleusercontent.com`). It is public, not a secret.
6. In the page, open **Configuration** and paste it into **Google client ID**. Or put it in a file called `.env.local` in the OUTCOMES folder: `VITE_GOOGLE_CLIENT_ID=your-id-here`. Never commit that file.
7. **Share the sheet** with each person as **Viewer**.

## Using it

Paste the sheet link, type the tab name (blank means the tab the link points at, or the first tab), click **Load from Google Sheet**, and sign in the first time. After that it works the same as an upload file.

## Scheduled pick-up (for the developers)

A scheduled job cannot use this sign-in, because a person must click it. For DECISIONS 20 the developers should use a **service account** with read-only access: create one in the same project, share the sheet with its email address as Viewer, and call the same logic as `sheets-api.ts` with a token for the `spreadsheets.readonly` scope. Keep the service account key out of the repo.
