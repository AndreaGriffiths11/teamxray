# 🤝 Contributing to MCP Team X-Ray

> *"Just like our tool reveals the humans behind the code, we want to reveal the humans behind this project."*

Thank you for considering contributing to Team X-Ray! We're building something special — a tool that helps developers discover the brilliant minds on their teams. Every contribution, no matter how small, makes our community stronger.

## 🌟 **Our Philosophy**

We believe in **human-centered development**:
- **Code quality matters**, but so does developer experience
- **Technical excellence** should feel approachable and inclusive  
- **Documentation** should be clear, helpful, and encouraging
- **Community** grows through kindness and mutual support

## 🚀 **Quick Start for Contributors**

### **Prerequisites**

- **Node.js** 20.x or higher
- **VS Code** 1.100.0 or higher
- **Git** with a GitHub account
- **Docker** (optional, for MCP testing)

### **Development Setup**

1. **Fork & Clone**
   ```bash
   # Fork the repository on GitHub first
   git clone https://github.com/andreagriffiths11/mcp-team-xray.git
   cd mcp-team-xray
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Set Up Environment**
   ```bash
   # Copy environment template
   cp .env.example .env
   
   # Add your GitHub token for testing
   export GITHUB_TOKEN="your_development_token"
   ```

4. **Build & Test**
   ```bash
   # Compile TypeScript
   npm run compile
   
   # Run linting
   npm run lint
   
   # Run tests (when available)
   npm test
   ```

5. **Launch Development**
   ```bash
   # Open in VS Code
   code .
   
   # Press F5 to launch Extension Development Host
   # This opens a new VS Code window with your extension loaded
   ```

## 🎯 **How to Contribute**

### **1. 🐛 Bug Reports**

Found something that doesn't work as expected? Help us fix it!

**Before reporting:**
- Check [existing issues](https://github.com/AndreaGriffiths11/mcp-team-xray/issues)
- Try with the latest version
- Test with a minimal reproduction case

**Great bug reports include:**
- Clear description of what happened vs. what you expected
- Steps to reproduce the issue
- Your environment (VS Code version, OS, repository size)
- Screenshots or error messages
- Sample repository (if possible)

### **2. ✨ Feature Requests**

Have an idea for making Team X-Ray even better at revealing team expertise?

**Feature requests should:**
- Align with our human-centered mission
- Include specific use cases
- Consider the developer experience
- Explain the expected behavior

### **3. 🔧 Code Contributions**

Ready to dive into the code? Here's how to make impactful contributions:

#### **Good First Issues**

Look for issues labeled [`good first issue`](https://github.com/AndreaGriffiths11/mcp-team-xray/labels/good%20first%20issue):
- Documentation improvements
- UI/UX enhancements
- Error message improvements
- Test coverage additions

#### **Development Workflow**

1. **Create a Branch**
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b bugfix/issue-number
   ```

2. **Make Your Changes**
   - Follow our coding standards (see below)
   - Add tests for new functionality
   - Update documentation as needed
   - Test thoroughly with the Extension Development Host

3. **Commit Your Changes**
   ```bash
   # We use conventional commits
   git commit -m "feat: add expert communication style analysis"
   git commit -m "fix: handle empty repository gracefully"
   git commit -m "docs: update MCP setup instructions"
   ```

4. **Submit a Pull Request**
   - Push your branch to your fork
   - Open a PR against the `main` branch
   - Fill out the PR template completely
   - Link any related issues

## 📋 **Coding Standards**

### **Code Style**

We use **ESLint** and **Prettier** to maintain consistent code style:

```bash
# Check linting
npm run lint

# Auto-fix linting issues
npm run lint:fix

# Format code
npm run format
```

### **TypeScript Guidelines**

- **Use strict mode** — no `any` types without good reason
- **Prefer explicit types** for public APIs
- **Use meaningful variable names** — `expertiseAnalysis` over `data`
- **Document complex logic** with clear comments

### **VS Code Extension Best Practices**

- **Handle errors gracefully** — show helpful messages to users
- **Use progress indicators** for long-running operations
- **Respect VS Code theming** — use CSS variables for colors
- **Test in both light and dark themes**
- **Follow VS Code UX patterns** — use familiar icons and layouts

### **Human-Centered Code**

Since our tool focuses on humans, our code should too:

```typescript
// ✅ Good - reveals human insights
const communicationStyle = expert.commitMessages.length > averageLength 
  ? "Detailed and thorough" 
  : "Concise and focused";

// ❌ Avoid - just technical metrics  
const messageLength = expert.commitMessages.reduce(...);
```

## 🧪 **Testing Guidelines**

### **Test Categories**

1. **Unit Tests** — Test individual functions and classes
2. **Integration Tests** — Test MCP server integration
3. **Extension Tests** — Test VS Code extension functionality
4. **Manual Testing** — Test with real repositories

### **Writing Good Tests**

```typescript
// ✅ Good test - clear and focused
describe('ExpertiseAnalyzer', () => {
  it('should identify communication styles from commit patterns', async () => {
    const commits = createMockCommits({
      detailed: ['feat: add comprehensive error handling with user feedback'],
      concise: ['fix: typo']
    });
    
    const analysis = await analyzer.analyzeCommits(commits);
    
    expect(analysis.communicationStyle).toBe('Mixed - detailed for features, concise for fixes');
  });
});
```

## 📁 **Project Structure**

Understanding our codebase:

```
src/
├── core/                     # Core analysis logic
│   ├── expertise-analyzer.ts # Main analysis engine
│   ├── copilot-mcp-service.ts # MCP integration
│   ├── expertise-webview.ts  # Beautiful results UI
│   └── expertise-tree-provider.ts # Sidebar navigation
├── extension.ts              # VS Code extension entry point
├── types/                    # TypeScript definitions
└── utils/                    # Helper functions

.github/
├── workflows/                # CI/CD automation
├── ISSUE_TEMPLATE/          # Issue templates
└── PULL_REQUEST_TEMPLATE.md # PR template

docs/                        # Documentation
├── ARCHITECTURE.md          # Technical deep-dive
├── API.md                   # Extension API
└── images/                  # Screenshots & diagrams
```

## 🔍 **Key Areas for Contribution**

### **High Impact Areas**

1. **AI Prompt Engineering** — Improve how we analyze human patterns
2. **MCP Integration** — Enhance GitHub MCP server usage
3. **UI/UX Improvements** — Make insights more actionable
4. **Performance** — Handle large repositories gracefully
5. **Documentation** — Help others understand and contribute

### **Specialized Contributions**

- **AI/ML Background**: Enhance communication style analysis
- **VS Code Extension Experience**: Improve integration patterns  
- **Docker/DevOps**: Enhance MCP server automation
- **Design Skills**: Improve webview and UI components
- **Technical Writing**: Enhance documentation and guides

## 🎨 **Design Principles**

### **Human-Centered Design**
- **Reveal strengths**, not just metrics
- **Encourage discovery**, don't overwhelm
- **Show relationships**, not just data
- **Respect privacy** and team dynamics

### **Technical Design**
- **Progressive enhancement** — work offline, excel online
- **Graceful degradation** — handle failures elegantly  
- **Performance first** — respect developer time
- **Accessibility** — work for everyone

## 🚀 **Release Process**

### **Version Management**

We follow [Semantic Versioning](https://semver.org/):
- **PATCH** (1.0.1): Bug fixes, documentation updates
- **MINOR** (1.1.0): New features, backward compatible
- **MAJOR** (2.0.0): Breaking changes

### **Release Workflow**

1. **Development** happens on feature branches
2. **Integration** via pull requests to `main`
3. **Testing** with automated CI/CD pipeline
4. **Release** via GitHub Actions to VS Code Marketplace

## 🏆 **Recognition**

We believe in celebrating contributions:

- **Contributors** are listed in our README

## 💬 **Getting Help**

Stuck or have questions? We're here to help:

- **💬 Discussions**: [GitHub Discussions](https://github.com/AndreaGriffiths11/mcp-team-xray/discussions) for questions and ideas


## 📜 **Code of Conduct**

This project follows our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold this code. Please report unacceptable behavior to [andreagriffiths11@github.com](mailto:andreagriffiths11@github.com).

## 🙏 **Thank You**

Every contribution makes Team X-Ray better at revealing the brilliant minds on development teams. Whether you're fixing a typo, adding a feature, or sharing feedback — **you're helping teams discover their hidden talents**.



