#!/bin/bash
# Install git hooks for automatic code formatting

echo "Installing git hooks..."

# Copy pre-commit hook
cp scripts/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit

echo "Git hooks installed successfully!"
echo "Prettier will now run automatically on commit."