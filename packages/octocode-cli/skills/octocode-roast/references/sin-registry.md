# The Sin Registry

Complete classification of code sins with detection patterns and roast templates.

---

## Severity Levels

| Level | Icon | Meaning |
|-------|------|---------|
| CAPITAL OFFENSES | 💀 | Career-ending, fix NOW |
| FELONIES | ⚖️ | Fix today |
| CRIMES | 🚨 | Fix this week |
| SLOP | 🤖 | AI hallucinations & filler |
| MISDEMEANORS | 📝 | Judge silently |
| PARKING TICKETS | 🅿️ | Mention if bored |

---

## 💀 CAPITAL OFFENSES (Career-Ending)

### Security Sins

| Sin | Pattern | Roast |
|-----|---------|-------|
| Hardcoded secrets | `password=`, `api_key=`, `secret=`, `token=` | "Congratulations, you've pre-authorized every script kiddie on Earth." |
| `eval()` usage | `eval(`, `new Function(` | "Running `eval()`? Let me know when you start accepting TCP connections from strangers too." |
| SQL injection | String concat in queries | "Bobby Tables sends his regards." |
| XSS vectors | `innerHTML =`, `dangerouslySetInnerHTML` without sanitization | "XSS delivery mechanism deployed. Hackers can now run a casino in your DOM." |
| No input validation | Direct user input to DB/shell/file | "You trust user input like I trust gas station sushi." |
| Path traversal | User input in file paths without sanitization | "`../../../etc/passwd` has entered the chat." |
| Insecure deserialization | `JSON.parse(userInput)`, `pickle.loads()` | "Deserializing untrusted data. Congratulations, you've built a remote code execution feature." |
| Disabled security | `verify=False`, `rejectUnauthorized: false` | "SSL verification disabled. Man-in-the-middle attackers thank you for your hospitality." |

### Architecture Sins

| Sin | Pattern | Roast |
|-----|---------|-------|
| God function (200+ lines) | Manual count | "This function has more responsibilities than a startup CEO during a funding round." |
| God class (1000+ lines) | Class line count | "This class does everything. It's not a class, it's a company." |
| Circular dependencies | A imports B imports A | "Circular dependency detected. Your code is having an existential crisis." |

---

## ⚖️ FELONIES (Fix Today)

### Type & Safety Sins

| Sin | Pattern | Roast |
|-----|---------|-------|
| `any` abuse (5+ instances) | `: any`, `as any` | "TypeScript saw this and asked to be called JavaScript again." |
| Force unwrap spam | `!.`, `!!` | "Using `!` like you've never been null-referenced before. Spoiler: you will be." |
| Empty catch blocks | `catch { }` | "Swallowing exceptions like you're being paid per suppressed error." |
| `var` declarations | `var ` | "Time traveler detected. Welcome to the future, we have `const` now." |

### Performance Sins

| Sin | Pattern | Roast |
|-----|---------|-------|
| N+1 queries | Loop containing DB/API calls | "N+1 query in a loop. Your database is crying. I can hear it from here." |
| Sync I/O in async context | `readFileSync` in async, blocking event loop | "Blocking the event loop like it owes you money." |
| Memory leak patterns | Unbounded arrays, listeners not cleaned | "Memory leak detected. Your app is a hoarder." |
| Missing pagination | Fetching all records | "`SELECT * FROM users` — Bold choice for a table with 10 million rows." |
| Unbounded loops | No limit on iterations | "Infinite loop potential. Enjoy your frozen browser tab." |

### Structure Sins

| Sin | Pattern | Roast |
|-----|---------|-------|
| Callback hell (4+ levels) | Nested `.then(` or callbacks | "This indentation is legally classified as a geological formation." |
| 500+ line files | Line count | "This file needs a table of contents and possibly a bibliography." |
| Global state mutation | `window.`, mutable globals | "Globals everywhere. Bold choice for someone who clearly hates debugging." |
| Tight coupling | Direct instantiation, no DI | "These classes are so tightly coupled they need couples therapy." |

---

## 🚨 CRIMES (Fix This Week)

### Code Quality Sins

| Sin | Pattern | Roast |
|-----|---------|-------|
| Magic numbers | Unexplained numeric literals | "42? Is this the answer to life or just the first number you thought of?" |
| Copy-paste code | Duplicate blocks | "Ctrl+C, Ctrl+V — the WET design pattern. Write Everything Twice." |
| 10+ function args | Argument count | "This function signature reads like a legal contract." |
| Nested ternaries | `? : ? :` | "Ternary inception. We need to go deeper... said no one ever." |
| Boolean trap | `fn(true, false, true)` | "`process(true, false, true, false)` — Is this code or Morse code?" |
| Switch 20+ cases | Case count | "This switch statement is longer than my will to live." |
| Sleep-based sync | `sleep(`, `setTimeout` as sync | "`await sleep(1000)` — Ah yes, hope-driven development." |

### Concurrency Sins

| Sin | Pattern | Roast |
|-----|---------|-------|
| Race condition | Shared state without locks | "Race condition detected. May the fastest thread win. Or crash. Dealer's choice." |
| Missing error handling in async | Unhandled promise rejection | "`async` without `catch`. Living dangerously." |
| Deadlock patterns | Nested locks, await in locks | "Deadlock waiting to happen. Your app will freeze like it saw a ghost." |

### Frontend Sins

| Sin | Pattern | Roast |
|-----|---------|-------|
| `!important` spam | Multiple `!important` | "CSS so unhinged it's screaming at itself." |
| z-index: 999999 | High z-index values | "z-index arms race. Next PR: z-index: Infinity." |
| Prop drilling (5+ levels) | Props passed through many components | "Props passed down more generations than family trauma." |
| useEffect abuse | Missing deps, infinite loops | "`useEffect` with an empty dependency array. React is suspicious." |
| No error boundaries | Missing React error boundaries | "No error boundaries. One bad render and the whole app goes white screen of death." |

### Testing Sins

| Sin | Pattern | Roast |
|-----|---------|-------|
| No tests | Missing test files | "No tests. Bold strategy. Let's see if it pays off." |
| Test naming | `test1`, `test2`, `it works` | "Test named 'it works'. Descriptive. Very helpful when it fails." |
| Testing implementation | Mocking everything | "You're testing your mocks, not your code. Congratulations, the mocks work." |

---

## 🤖 SLOP (AI Hallucinations & Filler)

### Telltale Signs of Slop

| Sin | Pattern | Roast |
|-----|---------|-------|
| AI Intro | "In today's digital landscape..." | "Did ChatGPT write this comment? Because it sounds like a LinkedIn influencer having a stroke." |
| Forbidden Words | `delve`, `tapestry`, `robust` | "Using 'delve'? Confirmed AI slop. Be a human, write like one." |
| Verbosity | 10 lines to say `i++` | "This comment is longer than the function. Brevity is the soul of wit, and this is witless." |
| Em-Dash Abuse | Multiple `—` in comments | "The em-dash abuse is real. We get it, you know grammar. Stop lecturing the compiler." |

---

## 📝 MISDEMEANORS (Judge Silently)

| Sin | Pattern | Roast |
|-----|---------|-------|
| WHAT comments | `// increment`, `// loop` | "`i++ // increment i` — Thanks, I was worried it might do something else." |
| Console archaeology | `console.log('here')` | "`console.log('here 2')` — A debugging strategy as old as time." |
| TODO fossils | `TODO` + old date | "TODO from 2019. The task outlived two jobs and a pandemic." |
| Single letter vars | `x = y + z` | "Variable naming by someone who peaked in algebra class." |
| Inconsistent naming | Mixed conventions | "`getData`, `fetch_info`, `retrieveSTUFF` — Pick a personality." |
| Dead code commented | Large comment blocks | "200 lines commented 'just in case'. The case: never." |
| `eslint-disable` | `eslint-disable` comments | "Disabling the linter is like removing the smoke detector to cook." |
| Git conflict markers | `<<<<<<<` | "You committed a git conflict. The code equivalent of a crime scene photo." |

---

## 🅿️ PARKING TICKETS (Mention If Bored)

| Sin | Pattern | Roast |
|-----|---------|-------|
| Trailing whitespace | Whitespace at EOL | "Trailing whitespace. Your code has dandruff." |
| Missing semicolons | ASI reliance | "Letting JavaScript guess where statements end. Brave." |
| == instead of === | `==` comparison | "Type coercion roulette. Sometimes `'1' == 1`. Sometimes your app crashes." |
| Utils dumping ground | Giant utils file | "`utils.ts` — Where functions go when you can't be bothered to organize." |
| Manager classes | `*Manager`, `*Handler` | "`UserDataManagerHandler` — Buzzword bingo winner." |

---

## Language-Specific Sins

### TypeScript/JavaScript

| Sin | Pattern | Roast |
|-----|---------|-------|
| `any` overuse | `: any` | "TypeScript asked for a divorce." |
| `@ts-ignore` abuse | `@ts-ignore` | "Silencing the type checker. Very mature." |
| Prototype pollution | `obj[userInput] =` | "Prototype pollution vector. `__proto__` says hello." |

### Python

| Sin | Pattern | Roast |
|-----|---------|-------|
| `except: pass` | `except:` with `pass` | "Catching literally everything and doing nothing. Peak nihilism." |
| `import *` | `from x import *` | "`import *` — Who knows what's in scope? Surprise!" |
| Mutable default args | `def fn(x=[])` | "Mutable default argument. Classic Python trap." |

### React

| Sin | Pattern | Roast |
|-----|---------|-------|
| Missing key prop | `map` without `key` | "Missing key prop. React is confused. So am I." |
| State in render | `useState` in conditions | "Conditional hooks. React's rules? More like guidelines." |
| Stale closure | useEffect/useCallback deps | "Stale closure detected. Your state is living in the past." |

### SQL/Database

| Sin | Pattern | Roast |
|-----|---------|-------|
| `SELECT *` | `SELECT *` | "`SELECT *` — Because bandwidth is free, right?" |
| No indexes hint | Large table scans | "Full table scan. Your DBA just felt a disturbance in the force." |
| String concatenation | `"SELECT..." + var` | "SQL injection delivery mechanism activated." |

---

## Search Patterns

```bash
# CAPITAL: Security
localSearchCode pattern="password\s*=|api_key\s*=|secret\s*=|token\s*="
localSearchCode pattern="eval\(|new Function\("
localSearchCode pattern="innerHTML\s*=|dangerouslySetInnerHTML"
localSearchCode pattern="verify\s*=\s*False|rejectUnauthorized:\s*false"

# CAPITAL: Architecture
localSearchCode pattern="import.*from.*\.\/" --follow to detect cycles

# FELONY: Types & Safety
localSearchCode pattern=": any|as any" type="ts"
localSearchCode pattern="!\." type="ts"
localSearchCode pattern="catch\s*\([^)]*\)\s*\{\s*\}"
localSearchCode pattern="\bvar\s+" type="ts,js"

# FELONY: Performance
localSearchCode pattern="readFileSync|writeFileSync" type="ts"
localSearchCode pattern="SELECT \* FROM"
localSearchCode pattern="\.forEach\(async"

# CRIME: Code Quality
localSearchCode pattern="\?\s*[^:]+\?\s*[^:]+:"        # nested ternary
localSearchCode pattern="eslint-disable"
localSearchCode pattern="TODO|FIXME|HACK|XXX"
localSearchCode pattern="sleep\(|setTimeout.*await"

# CRIME: Concurrency
localSearchCode pattern="async.*\{[^}]*\}" --no-catch  # unhandled async

# CRIME: Frontend
localSearchCode pattern="!important" type="css,scss"
localSearchCode pattern="z-index:\s*\d{4,}"
localSearchCode pattern="useEffect\(\s*\(\)\s*=>"

# SLOP: AI Residue
localSearchCode pattern="In today's.*landscape|delve into|rich tapestry|meticulous|robust framework" type="md,ts,js,py"
localSearchCode pattern="I hope this helps|As an AI"

# MISDEMEANOR
localSearchCode pattern="console\.(log|debug|warn|error)"
localSearchCode pattern="<<<<<<<|>>>>>>>"
```
