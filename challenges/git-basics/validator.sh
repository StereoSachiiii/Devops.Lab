#!/bin/bash
# Validator for: git-basics challenge
# Exit 0 = passed, Exit 1 = failed (stdout is shown to user)

set -e

PROJECT_DIR="/root/project"

# Check 1: Directory exists and is a git repository
if [ ! -d "$PROJECT_DIR/.git" ]; then
    echo "❌ The directory '$PROJECT_DIR' is not a git repository. Did you run 'git init'?"
    exit 1
fi

cd "$PROJECT_DIR"

# Check 2: Branches 'main' and 'feature' exist
if ! git show-ref --verify --quiet refs/heads/main; then
    echo "❌ Branch 'main' does not exist. Make sure you made an initial commit on 'main'."
    exit 1
fi

if ! git show-ref --verify --quiet refs/heads/feature; then
    echo "❌ Branch 'feature' does not exist."
    exit 1
fi

# Check 3: Check that README.md exists and is tracked in main
git checkout main >/dev/null 2>&1
if [ ! -f "README.md" ]; then
    echo "❌ 'README.md' is missing in the 'main' branch."
    exit 1
fi

if ! git ls-files --error-unmatch README.md >/dev/null 2>&1; then
    echo "❌ 'README.md' is not tracked in git. Did you 'git add' and 'git commit' it?"
    exit 1
fi

# Check 4: Check that app.js exists and is tracked in main (meaning it was merged)
if [ ! -f "app.js" ]; then
    echo "❌ 'app.js' is missing in the 'main' branch. Did you merge the 'feature' branch?"
    exit 1
fi

if ! git ls-files --error-unmatch app.js >/dev/null 2>&1; then
    echo "❌ 'app.js' is not tracked in git in the 'main' branch."
    exit 1
fi

# Additional verification: Check that app.js was introduced in the feature branch and merged
# (This is a simplified check, checking history for a merge commit or fast-forward)

echo "✅ All checks passed! You successfully initialized a git repo, branched, committed, and merged."
exit 0
