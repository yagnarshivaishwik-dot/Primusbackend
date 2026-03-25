# Creating a Separate Git Repository for Backend

Since your current git repository is tracking the entire project (frontend + backend), here's how to create a separate repository just for the backend:

## Option 1: Create a New Repository (Recommended)

1. **Copy backend to a new location**:
```powershell
# From K:\lance directory
Copy-Item -Path "backend" -Destination "K:\lance-backend" -Recurse
```

2. **Navigate to the new directory**:
```powershell
cd K:\lance-backend
```

3. **Initialize a new git repository**:
```powershell
git init
```

4. **Add all files**:
```powershell
git add .
```

5. **Create initial commit**:
```powershell
git commit -m "Initial commit: Lance Backend API"
```

6. **Create repository on GitHub**:
   - Go to https://github.com/new
   - Name: `lance-backend`
   - Description: "Backend API for Lance gaming cafe management system"
   - Keep it private initially
   - Don't initialize with README (we already have one)

7. **Connect to remote repository**:
```powershell
git remote add origin https://github.com/YOUR-USERNAME/lance-backend.git
git branch -M main
git push -u origin main
```

## Option 2: Use Git Subtree (Advanced)

If you want to keep the monorepo but also have a separate backend repo:

```powershell
# From K:\lance directory
git subtree push --prefix=backend origin backend-only
```

Then create a new repository from that branch.

## Option 3: Clean History Export

To export backend with clean history:

```powershell
# From K:\lance directory
git filter-branch --subdirectory-filter backend -- --all
```

**Warning**: This rewrites history. Do this in a copy of your repository.

## Files to Review Before Pushing

1. **Remove sensitive files**:
   - `.env` (already in .gitignore)
   - `primus-7b360-firebase-adminsdk-fbsvc-4b41845f71.json` (Firebase credentials)
   - Any other API keys or secrets

2. **Ensure .gitignore is working**:
```powershell
git status
# Should not show .env, *.db, or other ignored files
```

3. **Remove cached sensitive files if needed**:
```powershell
git rm --cached .env
git rm --cached *.json
git rm --cached lance.db
```

## Repository Structure

Your backend repository will have:
```
lance-backend/
├── app/                    # Main application code
├── scripts/                # Utility scripts
├── main.py                # Entry point
├── requirements.txt       # Dependencies
├── env.example           # Environment template
├── .gitignore            # Git ignore rules
├── README.md             # Project documentation
├── DEPLOYMENT.md         # Deployment guide
└── DEPLOYMENT_CHECKLIST.md # Deployment checklist
```

## Next Steps

After creating the repository:

1. Set up GitHub Actions for CI/CD (optional)
2. Configure branch protection rules
3. Add collaborators if needed
4. Set up GitHub Secrets for deployment
5. Create releases/tags for version management

## Recommended GitHub Repository Settings

- **General**:
  - Default branch: `main`
  - Features: Enable Issues, Disable Wiki (use README)
  
- **Branches**:
  - Protect `main` branch
  - Require pull request reviews
  - Dismiss stale reviews
  - Include administrators

- **Secrets** (for CI/CD):
  - `DEPLOY_HOST`: Your server IP
  - `DEPLOY_USER`: primus
  - `DEPLOY_KEY`: SSH private key
  - `JWT_SECRET`: Production JWT secret
