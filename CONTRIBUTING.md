# Contributing to eBay Bulk Lister

Thank you for your interest in contributing! This document provides guidelines for contributing to this project.

## 🐛 Reporting Bugs

If you find a bug, please open an issue with:
- Clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Screenshots (if applicable)
- Environment details (OS, browser, Node version)

## 💡 Feature Requests

We welcome feature requests! Please:
- Check existing issues first
- Describe the feature clearly
- Explain the use case
- Consider implementation complexity

## 🔧 Development Setup

1. Fork the repository
2. Clone your fork: `git clone https://github.com/yourusername/bulklister.git`
3. Install dependencies: `npm install`
4. Set up environment: Copy `.env.local.example` to `.env.local` and add your Supabase credentials
5. Run development server: `npm run dev`

## 📝 Code Style

- Follow existing code style
- Use TypeScript for type safety
- Run `npm run lint` before committing
- Format code with Prettier: `npm run format`

## 🧪 Testing

Before submitting a PR:
- Test all changes locally
- Verify ASIN scanning works
- Test product management features
- Verify CSV export functionality
- Check responsive design on mobile

## 📤 Pull Request Process

1. Create a feature branch: `git checkout -b feature/your-feature-name`
2. Make your changes
3. Commit with clear messages: `git commit -m "Add: feature description"`
4. Push to your fork: `git push origin feature/your-feature-name`
5. Open a Pull Request with:
   - Clear description of changes
   - Reference to related issues
   - Screenshots (for UI changes)

## 📋 Commit Message Guidelines

Use semantic commit messages:
- `Add:` New features
- `Fix:` Bug fixes
- `Update:` Updates to existing features
- `Refactor:` Code refactoring
- `Docs:` Documentation changes
- `Style:` Code style changes (formatting, etc.)

## 🎯 Areas for Contribution

Great places to start:
- Improve Amazon scraping reliability
- Add support for more product fields
- Enhance error handling
- Improve mobile UI/UX
- Add tests
- Update documentation
- Fix bugs from issues

## 📞 Questions?

Feel free to open an issue for questions or reach out to the maintainers.

Thank you for contributing! 🎉

