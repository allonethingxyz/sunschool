# sunschool-deployed-private

Private deployment repo for Sunschool. This repo tracks the public upstream and adds deployment-specific configuration (env vars, secrets, private overrides).

## Relationship

```
allonethingxyz/sunschool              (public, upstream, open source)
        │
        ▼
allonethingxyz/sunschool-deployed-private  (private, deployed to Railway)
```

- **upstream** remote → `allonethingxyz/sunschool` (public)
- **origin** remote → `allonethingxyz/sunschool-deployed-private` (this repo)

## Syncing from upstream

Pull latest from the public repo:

```bash
git fetch upstream
git merge upstream/main
git push origin main
```

This triggers Railway auto-deploy if Railway is connected to this repo.

## Railway setup

1. In Railway project settings, change the source repo to `allonethingxyz/sunschool-deployed-private`
2. You may need to install the Railway GitHub App on the `allonethingxyz` org first:
   - Go to https://railway.com/account → GitHub → Configure
   - Or: GitHub.com → Settings → Applications → Railway → Configure → Add `allonethingxyz` org
3. All existing env vars (DATABASE_URL, JWT_SECRET, etc.) stay on the Railway service — they are not in the repo
4. Pushes to `main` on this private repo trigger deploys

## Adding private overrides

If you need deployment-specific changes that shouldn't be in the public repo:
1. Make changes on a branch in this repo
2. Merge to `main` here (not upstream)
3. When syncing from upstream, use `git merge upstream/main` — your local changes will be preserved via merge

## Files unique to this repo

- `DOWNSTREAM.md` — This file (not in upstream)
