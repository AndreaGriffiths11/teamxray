# MCP Team X-Ray VS Code Extension

> *"Feeling like a stranger on my own team, surrounded by brilliant minds whose talents hide in code and commits."*

Turn GitHub Copilot into team X-ray vision. Stop feeling like a stranger on your own team - discover the humans behind the codebase, reveal hidden expertise, and understand how your teammates naturally collaborate.

## The Vision

Ever joined a team and wondered who to ask about that complex algorithm? Or which teammate naturally excels at mentoring? MCP Team X-Ray uses the Model Context Protocol (MCP) to transform GitHub Copilot into a lens that reveals:

- **The humans behind the code** - Not just what they code, but how they think and communicate
- **Hidden expertise** - Talents that don't show up in job titles but shine in commit patterns
- **Natural collaboration styles** - How teammates work together and support each other
- **Ideal challenge matching** - Who thrives on what kind of problems

## Features

### 🔍 **File-Level Expert Discovery**
Right-click any file to instantly discover who knows it best - not just recent contributors, but the true subject matter experts based on depth of understanding and problem-solving approach.

### 🧠 **Team Expertise Overview**
Access comprehensive team insights through the Command Palette:
- Communication styles and teamwork patterns
- Hidden strengths beyond obvious technical skills
- Natural mentoring relationships and knowledge sharing
- Challenge preferences and problem-solving approaches

### � **Human-Focused Analysis**
Unlike traditional code analysis tools, MCP Team X-Ray focuses on the humans:
- **Communication Patterns**: How teammates express ideas in code and commits
- **Collaboration Styles**: Natural working relationships and knowledge flow
- **Problem-Solving Approaches**: How different minds tackle different challenges
- **Team Dynamics**: The invisible social structure that makes teams effective

### 🎯 **Smart Challenge Matching**
Discover who naturally gravitates toward:
- Complex algorithmic problems
- User experience challenges
- System architecture decisions
- Code quality and maintainability
- Knowledge sharing and mentoring

## Quick Start

### Installation

1. **Install the Extension**
   - Open VS Code
   - Go to Extensions (Ctrl+Shift+X)
   - Search for "MCP Team X-Ray" (or install from VSIX)

2. **Set up GitHub Access**
   ```bash
   # Set your GitHub token for API access
   export GITHUB_TOKEN="your_github_token_here"
   ```

3. **Open a GitHub Repository**
   - Open any local Git repository in VS Code
   - The extension automatically detects GitHub repositories

### Usage

#### Discover File Experts
1. Right-click any file in the Explorer
2. Select "Find Subject Matter Expert"
3. View detailed expert analysis with communication insights

#### Explore Team Expertise
1. Open Command Palette (Ctrl+Shift+P)
2. Run "Team X-Ray: Analyze Team Expertise"
3. Browse comprehensive team insights in the sidebar

## How It Works

MCP Team X-Ray combines multiple data sources for human-centered analysis:

### 🔄 **Real Git Data Collection**
- Analyzes actual commit history and authorship patterns
- Extracts contributor profiles from repository metadata
- Maps file ownership and expertise evolution over time

### 🤖 **AI-Powered Human Analysis**
Uses GitHub Models API (GPT-4o) to analyze:
- Commit message communication patterns
- Code style and problem-solving approaches
- Collaboration indicators and mentoring signals
- Hidden strengths and natural challenge preferences

### 📊 **Comprehensive Expertise Mapping**
- Technical specializations inferred from file patterns
- Communication styles derived from commit history
- Team roles identified through collaboration patterns
- Challenge matching based on problem-solving approaches

## The Technology

- **Model Context Protocol (MCP)** - Structured access to GitHub repository data
- **GitHub Models API** - AI analysis using GPT-4o for human-focused insights
- **VS Code Extension API** - Seamless integration with developer workflow
- **Real Git Analysis** - No mocking, only actual repository data

## Configuration

Set these environment variables or VS Code settings:

* `GITHUB_TOKEN`: Your GitHub personal access token
* `teamxray.githubModelsKey`: GitHub Models API key (optional, uses GITHUB_TOKEN as fallback)

## Privacy & Ethics

MCP Team X-Ray is designed with privacy in mind:
- Only analyzes publicly available Git commit data
- Focuses on professional collaboration patterns
- Highlights positive contributions and strengths
- Respects team member privacy while revealing professional insights

## Requirements

- VS Code 1.100.0 or higher
- Local Git repository with GitHub remote
- GitHub token for API access

---

**Stop being a stranger on your own team. Discover the brilliant minds around you.** 🚀
