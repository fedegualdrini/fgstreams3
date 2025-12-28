# GitHub Repository Setup

## Step 1: Create Repository on GitHub

1. Go to https://github.com/new
2. Repository name: `sports-streaming-mirror` (or your preferred name)
3. Description: "Clean, reliable sports streaming web application built with Next.js"
4. Visibility: Choose Public or Private
5. **DO NOT** initialize with README, .gitignore, or license (we already have these)
6. Click "Create repository"

## Step 2: Connect Local Repository to GitHub

After creating the repository, GitHub will show you commands. Use these:

```bash
# Add the remote repository (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/sports-streaming-mirror.git

# Rename default branch to main (if needed)
git branch -M main

# Push your code
git push -u origin main
```

## Alternative: Using SSH

If you prefer SSH:

```bash
git remote add origin git@github.com:YOUR_USERNAME/sports-streaming-mirror.git
git branch -M main
git push -u origin main
```

## Step 3: Verify

After pushing, verify your code is on GitHub by visiting:
`https://github.com/YOUR_USERNAME/sports-streaming-mirror`

## Optional: Add Repository Topics

On GitHub, you can add topics like:
- `nextjs`
- `typescript`
- `tailwindcss`
- `sports-streaming`
- `streamed-api`

## Optional: Add License

Consider adding a license file (MIT, Apache 2.0, etc.) if you want to open source this project.

