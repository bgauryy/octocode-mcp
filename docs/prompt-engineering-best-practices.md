# Prompt Engineering Best Practices Guide

## 🎯 Core Principles

### 1. **Information Hierarchy**
Structure information from most to least critical:
```markdown
**PURPOSE:** (What it does - 1 line)
**WHEN TO USE:** (Clear triggers)
**KEY FEATURES:** (Main capabilities)
**WORKFLOW:** (Step-by-step process)
**RESULT TARGETS:** (Success metrics)
**ERROR HANDLING:** (Common issues + solutions)
**INTEGRATION:** (Cross-tool workflows)
```

### 2. **Clarity Over Cleverness**
- **Clear** - Direct, unambiguous language
- **Concrete** - Specific examples vs abstract concepts
- **Actionable** - Tells AI exactly what to do
- **Scannable** - Easy to find relevant information quickly

### 3. **Progressive Disclosure**
Start with essentials, add detail progressively:
- **Level 1** - Core functionality (PURPOSE)
- **Level 2** - Usage triggers (WHEN TO USE)
- **Level 3** - Implementation details (WORKFLOW)
- **Level 4** - Edge cases and integration (ERROR HANDLING)

## 📋 Structural Templates

### **Standard Tool Description Template**
```markdown
**[Tool Name]** - Brief, compelling description

**PURPOSE:**
Single sentence explaining core functionality.

**WHEN TO USE:**
- Specific trigger scenario 1
- Specific trigger scenario 2
- Clear usage context

**KEY FEATURES:**
- **Feature 1** - Brief explanation
- **Feature 2** - Brief explanation
- **Feature 3** - Brief explanation

**WORKFLOW:**
1. **Step 1** - Action with context
2. **Step 2** - Next action
3. **Step 3** - Final action

**RESULT TARGETS:**
- **X results** - Interpretation and next action
- **Y results** - Different interpretation
- **Z results** - Edge case handling

**ERROR HANDLING:**
- **Error Type** - Cause → Solution
- **Common Issue** - Symptom → Recovery action

**INTEGRATION:** Works with [Tool X] for [specific workflow].
```

### **Search Strategy Template**
```markdown
**SEARCH STRATEGY:**
1. **Start Simple** - Single terms: `"keyword1"`, `"keyword2"`
2. **Add Specificity** - Combined terms: `"keyword1 keyword2"`
3. **Avoid Complexity** - Don't use phrases that are too complex

**SEARCH PATTERNS:**
- ✅ **Good** - `"simple term"` → `"specific combination"`
- ❌ **Poor** - `"overly complex multi-word phrase"`
```

## 🎨 Content Best Practices

### **Use Concrete Examples**
❌ **Vague:** "Search for code patterns"
✅ **Specific:** Search for `"useState"`, `"React.createElement"`, `"export default"`

❌ **Abstract:** "Handle errors appropriately"
✅ **Actionable:** "Rate limits → Use tool X first for discovery"

### **Provide Clear Success Metrics**
```markdown
**RESULT TARGETS:**
- **1-10 results** - IDEAL for deep analysis
- **11-30 results** - GOOD, manageable scope
- **31-100 results** - ACCEPTABLE, may need refinement
- **100+ results** - TOO BROAD, apply filters
```

### **Include Recovery Strategies**
```markdown
**FALLBACK STRATEGIES:**
- **No Results** - Remove filters, try broader terms
- **Too Many Results** - Add specific filters, narrow scope
- **Wrong Context** - Add qualifiers, change approach
```

### **Use Consistent Formatting**
- **Bold** for section headers and key terms
- `Code blocks` for exact examples and parameters
- **Bullets** for lists and options
- **Numbers** for sequential steps
- ✅❌ for good/bad examples (sparingly)

## 🧠 Cognitive Load Reduction

### **Chunking Information**
Break complex information into digestible pieces:

❌ **Wall of Text:**
```markdown
This tool performs advanced GitHub code search with intelligent pattern matching, mandatory repository scoping, automatic Boolean operators, smart fallback strategies, enterprise-grade accuracy, language-aware filtering, and sophisticated search intelligence that supports complex query patterns with battle-tested accuracy including single terms, auto-Boolean multi-terms, function patterns, powerful Boolean operators, and technical implementations.
```

✅ **Chunked Information:**
```markdown
**SEARCH INTELLIGENCE:**
- **Single Terms** - `useState`, `scheduleCallback`, `workLoopConcurrent`
- **Auto-Boolean** - `"concurrent rendering"` → `"concurrent AND rendering"`
- **Manual Boolean** - `"hooks AND state"`, `"(useState OR useEffect)"`
- **Function Patterns** - `"useEffect(() =>"`, `"React.createElement"`
```

### **Progressive Detail**
Start broad, get specific:
```markdown
**PURPOSE:** Find code implementations with precision

**KEY FEATURES:**
- Automatic repository scoping
- Smart Boolean logic
- Multiple fallback strategies

**SEARCH INTELLIGENCE:**
[Detailed breakdown of capabilities]

**FALLBACK STRATEGIES:**
[Specific recovery approaches]
```

## 🔄 Integration Patterns

### **Cross-Tool Workflows**
```markdown
**MANDATORY WORKFLOW:**
1. **ALWAYS** Use [Tool A] first for [specific purpose]
2. Find [resource] with [Tool B]
3. Extract [result] with this tool
4. Follow [dependency] chains to [related resources]

**INTEGRATION:** Use after [Tool X] for [context].
```

### **Conditional Logic**
```markdown
**WHEN TO USE (Priority Order):**
1. **Primary Method** - [Tool A] when [condition]
2. **Secondary Method** - [Tool B] if [Tool A] fails
3. **Last Resort** - This tool only when [specific condition]
```

## ⚠️ Error Prevention Patterns

### **Critical Requirements**
```markdown
**CRITICAL REQUIREMENT:** 
**NEVER** [action] without [prerequisite]. [Consequence of violation].
```

### **Clear Boundaries**
```markdown
**DO:**
- Specific positive action
- Another positive action

**DO NOT:**
- Specific action to avoid
- Consequence of wrong action
```

### **Error Recovery**
```markdown
**ERROR HANDLING:**
- **Error Type** - Symptom → Diagnosis → Solution
- **Access denied** → Check permissions with [Tool Y]
- **Rate limited** → Implement retry with exponential backoff
```

## 📊 Result Interpretation

### **Outcome-Based Guidance**
```markdown
**RESULT OPTIMIZATION:**
- **0 results** - [Specific action]: Try broader terms, remove filters
- **1-20 results** - [Interpretation]: IDEAL for thorough analysis
- **100+ results** - [Problem]: TOO BROAD, [Solution]: apply filters
```

### **Quality Indicators**
```markdown
**SUCCESS INDICATORS:**
- Repository information retrieved successfully
- Default branch clearly identified
- Active repository with recent commits
- Repository accessibility confirmed
```

## 🎯 Advanced Patterns

### **Context Switching**
```markdown
**FALLBACK STRATEGY:**
1. [Primary approach] with [specific parameters]
2. If [condition], switch to [alternative approach]
3. If all fail → [final fallback] with [different parameters]
```

### **Adaptive Behavior**
```markdown
**ADAPTIVE TACTICS:**
- Start broad with [category] keywords, narrow based on findings
- Use [parameter] when [context] is known
- Apply [filter] only after [broader searches] confirm patterns
```

### **Multi-Phase Workflows**
```markdown
**SEARCH METHODOLOGY:**
- **Phase 1** - Core discovery: `"term1"`, `"term2"` → understand patterns
- **Phase 2** - Context expansion: `"term1 context"`, `"term2 handling"`
- **Phase 3** - Solution focus: `"term1 resolved"`, `"term2 implemented"`
```

## 🚫 Common Anti-Patterns

### **What to Avoid:**

❌ **Emoji Overuse**
```markdown
🔥🎯 POWERFUL SEARCH 🚀 with AMAZING 💫 features!!!
```

❌ **Redundant Information**
```markdown
**AUTO-BOOLEAN:** Multi-word become AND operations
**BOOLEAN LOGIC:** Multi-term searches use AND automatically  
**AND OPERATIONS:** Multiple terms automatically become AND
```

❌ **Vague Instructions**
```markdown
"Use this tool appropriately when needed for relevant scenarios"
```

❌ **Walls of Text**
```markdown
This tool is a comprehensive solution that provides advanced capabilities for complex scenarios with intelligent features and sophisticated algorithms that enable powerful functionality through innovative approaches and cutting-edge technology...
```

❌ **Missing Context**
```markdown
**SEARCH STRATEGY:**
1. Search for things
2. Filter results
3. Get output
```

## ✅ Quality Checklist

Before finalizing any prompt, verify:

### **Structure**
- [ ] Clear information hierarchy (PURPOSE → WHEN → HOW)
- [ ] Consistent formatting throughout
- [ ] Logical flow from general to specific
- [ ] Scannable sections with clear headers

### **Content**
- [ ] Concrete examples with exact syntax
- [ ] Specific success/failure criteria
- [ ] Clear error handling and recovery
- [ ] Integration guidance with other tools

### **Clarity**
- [ ] No ambiguous language
- [ ] Actionable instructions
- [ ] Appropriate level of detail
- [ ] No redundant information

### **Completeness**
- [ ] All major use cases covered
- [ ] Edge cases addressed
- [ ] Fallback strategies provided
- [ ] Cross-references included

## 📚 Reference Examples

### **Excellent Tool Description (GITHUB_SEARCH_CODE)**
```markdown
**Precision code search** - Advanced GitHub code search with intelligent pattern matching.

**PURPOSE:**
Find specific code implementations with surgical precision using automatic Boolean operators.

**KEY FEATURES:**
- **Automatic Repository Scoping** - Every search includes "repo:owner/repository"
- **Auto-Boolean Logic** - Multi-term queries become AND operations automatically
- **Smart Fallbacks** - Multiple recovery strategies for failed searches

**SEARCH INTELLIGENCE:**
- **Single Terms** - `useState`, `scheduleCallback`, `workLoopConcurrent`
- **Auto-Boolean** - `"concurrent rendering"` → `"concurrent AND rendering"`
- **Manual Boolean** - `"hooks AND state"`, `"(useState OR useEffect)"`

**RESULT OPTIMIZATION:**
- **1-10 Results** - IDEAL for deep analysis
- **11-30 Results** - GOOD, manageable scope
- **100+ Results** - TOO BROAD, apply filters

**ERROR HANDLING:**
- Rate limits → Use npm_search first for repo discovery
- Access denied → Use get_user_orgs for permissions
- Outdated results → Add date filters (`created:>2022-01-01`)

**INTEGRATION:** Use after get_repository for branch discovery.
```

### **Clear Workflow Example (NPM_GET_PACKAGE)**
```markdown
**WORKFLOW:**
1. Extract repository URL from package.json
2. Parse owner/repo from GitHub URL formats  
3. Chain to get_repository for branch discovery
4. Continue to search_code for implementations

**ERROR HANDLING:** 
- Package not found → Try npm_search_packages
- No repository URL → Search GitHub topics/repositories
- Private repositories → Use get_user_organizations
```

This guide provides the framework for creating clear, actionable, and effective prompts that guide AI behavior precisely while remaining maintainable and easy to understand. 