# GitHub Marketplace Publish Checklist

## One-time setup

1. Create a new public GitHub repo: github.com/bmcghee98/seed-lr-action
2. Push the contents of seed-lr-action-repo/ to that repo
3. Tag the initial release: git tag v1 && git push origin v1
4. Go to the repo on GitHub
5. Click on action.yml
6. GitHub will show a "Publish this Action to the Marketplace" banner
7. Click it, fill in the category (choose "Code quality" or "Testing")
8. Publish

## Every update

1. Make changes in github-action/ in the main SEED repo
2. Run npm run build in github-action/
3. Copy updated files to seed-lr-action-repo/
4. Push to bmcghee98/seed-lr-action
5. Tag new version: git tag v1.x.x && git push origin v1.x.x
6. Update the @v1 tag to point to latest: git tag -f v1 && git push -f origin v1

## Marketplace category

Recommended: "Code quality"
Keywords to add during publish: language-risk, compliance, ai-safety, fintech, llm, guardrails
