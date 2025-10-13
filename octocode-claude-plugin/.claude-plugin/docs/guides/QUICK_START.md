# ⚡ Quick Start Guide

Get your first project generated in 5 minutes!

---

## Prerequisites

- ✅ Claude Code installed (version >= 1.0.0)
- ✅ Node.js installed (version >= 18.0.0)
- ✅ Git repository initialized in your project

---

## Installation

### Step 1: Install the Plugin

In Claude Code:
```
/plugin add bgauryy/octocode-mcp/octocode-vibe-plugin
/restart
```

Or from local directory:
```bash
git clone https://github.com/bgauryy/octocode-mcp.git
cd octocode-mcp/octocode-vibe-plugin
```

Then in Claude Code:
```
/plugin add .
/restart
```

### Step 2: Verify Installation

```
/plugin list
```

You should see "octocode" plugin listed with version 1.0.0.

---

## Your First Project

### Simple Todo App

```
/octocode-generate Build a todo app with React frontend and Express backend
```

**What happens next:**

#### Phase 1: Requirements (2-5 min)
The agent will ask you questions like:
- What features do you want?
- Who are the users?
- Any specific tech preferences?

Answer naturally, and when done, you'll see **Gate 1 approval**.

**Example interaction:**
```
Agent: What authentication methods would you like?
You: Email and Google OAuth

Agent: Any specific features for the todo items?
You: Yes, I need categories, due dates, and priority levels

Agent: ✅ PRD created!
[1] Approve  [2] Modify  [3] Review
```

Choose **[1] Approve** to continue.

---

#### Phase 2: Architecture & UX (5-10 min)
Two agents work in parallel:
- `agent-architect` designs the backend
- `agent-ux` designs the frontend

You'll see **Gate 2** with both designs.

**Review and approve** to continue.

---

#### Phase 3: Validation (2-3 min)
Task breakdown is created with dependencies identified.

**Gate 3** shows the plan. Approve to start implementation.

---

#### Phase 4: Research (3-5 min)
Agent researches best practices from GitHub (runs in background).

---

#### Phase 5-6: Implementation (15-40 min)
Multiple agents work in parallel building your app!

**Gate 4** shows live progress dashboard:
```
⚡ IMPLEMENTATION IN PROGRESS
Progress: [████████░░░░] 65% (23/35 tasks)

🤖 Active Agents:
  agent-implementation-1 → Task 4.2 [2min elapsed]
  agent-implementation-2 → Task 4.3 [5min elapsed]

[1] Pause  [2] Details  [3] Continue
```

Choose **[3] Continue** to keep watching.

---

#### Phase 7: Verification (3-5 min)
QA agent verifies everything:
- ✅ Build passes
- ✅ Tests pass
- ✅ All features implemented

**Gate 5** shows final report.

**Approve** and you're done! 🎉

---

## Expected Output

After completion, your project will have:

```
your-project/
├── frontend/              # React application
│   ├── src/
│   ├── public/
│   └── package.json
├── backend/               # Express server
│   ├── src/
│   ├── tests/
│   └── package.json
├── .octocode/            # Plugin state and logs
│   ├── requirements/
│   ├── designs/
│   ├── ux/
│   ├── context/
│   └── verification-report.md
└── README.md
```

---

## Running Your App

### Backend
```bash
cd backend
npm install
npm run dev
```

Server runs at: `http://localhost:3000`

### Frontend
```bash
cd frontend
npm install
npm run dev
```

App runs at: `http://localhost:5173`

---

## Next Steps

### Customize & Extend
```
Make the todo app support recurring tasks
```

The plugin will:
- Analyze existing code
- Design the feature
- Implement it
- Test it

### Resume Later
If interrupted:
```
/octocode-generate --resume
```

Continues from where you left off!

---

## Common Scenarios

### Web Dashboard
```
/octocode-generate Build an analytics dashboard with charts showing user metrics. Use Next.js and PostgreSQL.
```

### Mobile App
```
/octocode-generate Create a React Native fitness tracker with workout plans and progress charts
```

### API Service
```
/octocode-generate Build a RESTful API for managing a bookstore with authentication and payment integration
```

### Full-Stack E-commerce
```
/octocode-generate Create an e-commerce platform with product catalog, shopping cart, and Stripe payments
```

---

## Tips for Success

### 1. Be Specific
**Good:**
```
Build a blog platform with user authentication, rich text editor, comment system, and admin dashboard. Use Next.js and PostgreSQL.
```

**Too vague:**
```
Make me a website
```

### 2. Provide Context
Mention:
- Target users (who will use this?)
- Key features (what should it do?)
- Tech preferences (any specific frameworks?)
- Scale expectations (100 users? 100k users?)

### 3. Use Gates Wisely
- **Approve** when design looks good
- **Modify** to request changes
- **Ask Questions** to clarify

Don't rush through gates - review the designs!

### 4. Monitor Implementation
At Gate 4, check the dashboard:
- Are agents making progress?
- Any errors?
- Tasks completing?

### 5. Trust the Process
The 7-phase workflow is designed for quality:
- Phase 1-3: Planning (careful)
- Phase 4-6: Building (fast)
- Phase 7: Verifying (thorough)

---

## Troubleshooting

### MCP Tools Not Available
```bash
# Install octocode-mcp manually
npx octocode-mcp@latest --help

# Restart Claude Code
/restart
```

### Agent Fails
- Check error message
- Try again (agents can retry)
- Modify requirements if needed

### Implementation Stuck
- Check Gate 4 dashboard
- Look for blocked tasks
- Agents will report issues

### Build Fails
- Phase 7 will report issues
- Review verification report
- Fix issues and re-verify

---

## Getting Help

- **Documentation:** [Full Docs](../README.md)
- **FAQ:** [Common Questions](FAQ.md)
- **Issues:** [GitHub Issues](https://github.com/bgauryy/octocode-mcp/issues)
- **Discussions:** [GitHub Discussions](https://github.com/bgauryy/octocode-mcp/discussions)

---

## What's Next?

### Learn More
- [Workflow Guide](../workflow/WORKFLOW_GUIDE.md) - Understand the complete process
- [Agent Architecture](../agents/ARCHITECTURE.md) - How agents work together
- [Advanced Features](ADVANCED_FEATURES.md) - Power user tips

### Experiment
- Try different types of projects
- Customize generated code
- Add new features to existing projects

### Contribute
- [Contributing Guide](CONTRIBUTING.md) - Help improve the plugin
- [Development Setup](DEVELOPMENT.md) - Set up for development

---

**You're ready to generate production-ready applications! 🚀**

Start with a simple project, learn the workflow, then tackle more complex builds.

**Happy coding!** 💻✨
