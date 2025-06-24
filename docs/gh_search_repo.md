# GitHub Repository Search

## 🚀 MOST EFFECTIVE PATTERNS

### 1. Quality Discovery
```typescript
{
  topic: ["react", "typescript"],
  stars: "1000..5000",
  limit: 10
}
```

### 2. Organization Research
```typescript
{
  owner: ["microsoft", "google", "facebook"],
  language: "python",
  limit: 10
}
```

### 3. Beginner-Friendly Projects
```typescript
{
  goodFirstIssues: ">=5",
  stars: "100..5000",
  limit: 10
}
```

### 4. Recent Quality Projects
```typescript
{
  stars: ">1000",
  created: ">2023-01-01",
  limit: 10
}
```

### 5. Community-Active Projects
```typescript
{
  helpWantedIssues: ">=3",
  license: ["mit", "apache-2.0"],
  limit: 10
}
```

## ✅ WHAT WORKS BEST

- **Topic Arrays**: `["react", "typescript"]` - Most effective for multiple topics
- **Owner Arrays**: `["microsoft", "google"]` - Perfect for organization research  
- **Stars Ranges**: `"1000..5000"`, `">1000"` - Excellent quality filtering
- **Simple OR**: `"tensorflow OR pytorch"` (without other filters)
- **Boolean AND**: `"javascript AND typescript"`

## ❌ AVOID THESE PATTERNS

- **OR + Language Filter**: `"api OR rest"` + `language: "typescript"` → 0 results
- **Multi-word OR**: `"machine learning OR deep learning"` → Poor quality results
- **Over-filtering**: 5+ filters simultaneously → Often 0 results
- **Complex Boolean**: `"(react OR vue) AND (typescript OR javascript)"` → Unreliable

## 🎯 BEST PRACTICES

1. **Start Simple**: Use 1-2 primary filters + limit
2. **Prefer Arrays**: `topic: ["x", "y"]` over `query: "x OR y"`
3. **Use Limit**: Increase `limit` instead of adding filters
4. **Quality First**: Always include stars filter for better results
5. **Test Incrementally**: Add filters one by one to avoid over-constraining

## 📊 SUCCESS RATES

| Pattern | Success Rate | Quality | Recommendation |
|---------|-------------|---------|----------------|
| Topic Arrays | 95% | Excellent | ✅ **BEST** |
| Owner Arrays | 95% | Excellent | ✅ **BEST** |  
| Simple OR | 90% | Good | ✅ Good |
| Boolean AND | 85% | Good | ✅ Good |
| OR + Filters | 10% | Poor | ❌ Avoid |
| Multi-word OR | 60% | Poor | ❌ Avoid |

## 🔧 PARAMETERS GUIDE

### High-Impact Filters
- `topic`: Arrays work best `["react", "typescript"]`
- `owner`: Arrays for orgs `["microsoft", "google"]`
- `stars`: Ranges `"1000..5000"` or thresholds `">1000"`

### Quality Indicators
- `goodFirstIssues`: Perfect for beginners `">=5"`
- `helpWantedIssues`: Active communities `">=3"`
- `created`: Recent projects `">2023-01-01"`

### Use Carefully
- `language`: Restrictive with other filters
- `query`: Simple terms or OR without filters only
- Multiple filters: Limit to 2-3 maximum

See examples
make sure the tool follows these instructions!!

Examples

# Search repositories matching set of keywords "cli" and "shell"
$ gh search repos cli shell

# Search repositories matching phrase "vim plugin"
$ gh search repos "vim plugin"

# Search repositories public repos in the microsoft organization
$ gh search repos --owner=microsoft --visibility=public

# Search repositories with a set of topics
$ gh search repos --topic=unix,terminal

# Search repositories by coding language and number of good first issues
$ gh search repos --language=go --good-first-issues=">=10"

# Search repositories without topic "linux"
$ gh search repos -- -topic:linux

# Search repositories excluding archived repositories
$ gh search repos --archived=false

filters:

 --topic <strings>
    Filter on topic
--updated <date>
    Filter on last updated at date
--visibility <strings>
    Filter based on visibility: {public|private|internal}
 --match <strings>
    Restrict search to specific field of repository: {name|description|readme}
--number-topics <number>
    Filter on number of topics
--order <string> (default "desc")
    Order of repositories returned, ignored unless '--sort' flag is specified: {asc|desc}
--owner <strings>
    Filter on owner
--size <string>
    Filter on a size range, in kilobytes
--sort <string> (default "best-match")
    Sort fetched repositories: {forks|help-wanted-issues|stars|updated}
--stars <number>
    Filter on number of stars
 --json <fields>
    Output JSON with the specified fields
--language <string>
    Filter based on the coding language
--license <strings>
    Filter based on license type
 --archived
    Filter based on the repository archived state {true|false}
--created <date>
    Filter based on created at date
--followers <number>
    Filter based on number of followers
--forks <number>
    Filter on number of forks
--good-first-issues <number>
    Filter on number of issues with the 'good first issue' label
--help-wanted-issues <number>
    Filter on number of issues with the 'help wanted' label
--include-forks <string>
    Include forks in fetched repositories: {false|true|only}