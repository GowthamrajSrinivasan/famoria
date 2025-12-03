# GitHub Actions Deployment Setup

Follow these steps to set up automated deployment to Firebase Hosting:

## 1. Create Firebase Service Account

1. Go to [Firebase Console](https://console.firebase.google.com/project/XX-app/settings/serviceaccounts/adminsdk)
2. Click on **Service accounts** tab
3. Scroll down and click **Generate new private key**
4. Download the JSON file (keep it secure!)
5. Open the JSON file and copy its entire contents

## 2. Set up GitHub Repository Secrets

Go to your GitHub repository: `https://github.com/userName/appName/settings/secrets/actions`

Add the following secrets:

### Required Secrets:

1. **FIREBASE_SERVICE_ACCOUNT**
   - Value: Paste the entire JSON content from the service account file you downloaded
   - This is used to authenticate GitHub Actions with Firebase

2. **VITE_FIREBASE_API_KEY**
   - Value: `XX`

3. **VITE_FIREBASE_AUTH_DOMAIN**
   - Value: `XX`

4. **VITE_FIREBASE_PROJECT_ID**
   - Value: `XX`

5. **VITE_FIREBASE_STORAGE_BUCKET**
   - Value: `XX`

6. **VITE_FIREBASE_MESSAGING_SENDER_ID**
   - Value: `XX`

7. **VITE_FIREBASE_APP_ID**
   - Value: `XX`

8. **VITE_GEMINI_API_KEY**
   - Value: `XX`

## 3. How the Workflow Works

### On Push to Main Branch:
- Builds the app
- Deploys to Firebase Hosting live channel
- Your app goes live at: https://XX-app.web.app

### On Pull Requests:
- Builds the app
- Creates a preview deployment
- Adds a comment to the PR with the preview URL

## 4. Test the Deployment

1. Commit and push your changes:
   ```bash
   git add .
   git commit -m "Add GitHub Actions deployment"
   git push origin main
   ```

2. Go to GitHub Actions tab: `https://github.com/userName/repoName/actions`

3. Watch the workflow run

4. Once complete, your app will be live at: https://XX-app.web.app

## 5. Workflow Features

✅ Automatic deployment on every push to main
✅ Preview deployments for pull requests
✅ Caching for faster builds
✅ Environment variables injected at build time
✅ Optimized caching headers for assets
✅ SPA routing support with rewrites

## Need Help?

If the workflow fails:
1. Check the GitHub Actions logs
2. Verify all secrets are set correctly
3. Ensure the Firebase service account has proper permissions
