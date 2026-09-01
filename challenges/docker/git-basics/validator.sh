#!/bin/bash
# Validator for: git-basics challenge

passed_git=false
passed_branches=false
passed_readme=false
passed_app=false

msg_git="Directory '/root/project' is not an initialized git repository"
msg_branches="Branches 'main' and 'feature' do not both exist"
msg_readme="'README.md' is missing or untracked in the 'main' branch"
msg_app="'app.js' is missing or untracked in 'main' (branch was not merged)"

PROJECT_DIR="/root/project"

if [ -d "$PROJECT_DIR/.git" ]; then
    passed_git=true
    msg_git="Git repository initialized in '$PROJECT_DIR'"
    
    cd "$PROJECT_DIR" || exit 1
    
    if git show-ref --verify --quiet refs/heads/main 2>/dev/null && git show-ref --verify --quiet refs/heads/feature 2>/dev/null; then
        passed_branches=true
        msg_branches="Branches 'main' and 'feature' exist"
    fi
    
    git checkout main >/dev/null 2>&1
    if [ -f "README.md" ] && git ls-files --error-unmatch README.md >/dev/null 2>&1; then
        passed_readme=true
        msg_readme="'README.md' is committed and tracked in 'main'"
    fi
    
    if [ -f "app.js" ] && git ls-files --error-unmatch app.js >/dev/null 2>&1; then
        passed_app=true
        msg_app="'app.js' from 'feature' branch was successfully merged into 'main'"
    fi
fi

# Print structured JSON results
cat <<EOF
[
  {"check_id": "git_initialized", "passed": $passed_git, "message": "$msg_git"},
  {"check_id": "branches_created", "passed": $passed_branches, "message": "$msg_branches"},
  {"check_id": "readme_committed", "passed": $passed_readme, "message": "$msg_readme"},
  {"check_id": "feature_merged", "passed": $passed_app, "message": "$msg_app"}
]
EOF

if [ "$passed_git" = "true" ] && [ "$passed_branches" = "true" ] && [ "$passed_readme" = "true" ] && [ "$passed_app" = "true" ]; then
    exit 0
else
    exit 1
fi

