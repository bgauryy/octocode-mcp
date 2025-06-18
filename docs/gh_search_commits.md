gh search commits
gh search commits [<query>] [flags]
Search for commits on GitHub.

The command supports constructing queries using the GitHub search syntax, using the parameter and qualifier flags, or a combination of the two.

GitHub search syntax is documented at: https://docs.github.com/search-github/searching-on-github/searching-commits

Options
--author <string>
Filter by author
--author-date <date>
Filter based on authored date
--author-email <string>
Filter on author email
--author-name <string>
Filter on author name
--committer <string>
Filter by committer
--committer-date <date>
Filter based on committed date
--committer-email <string>
Filter on committer email
--committer-name <string>
Filter on committer name
--hash <string>
Filter by commit hash
-q, --jq <expression>
Filter JSON output using a jq expression
--json <fields>
Output JSON with the specified fields
-L, --limit <int> (default 30)
Maximum number of commits to fetch
--merge
Filter on merge commits
--order <string> (default "desc")
Order of commits returned, ignored unless '--sort' flag is specified: {asc|desc}
--owner <strings>
Filter on repository owner
--parent <string>
Filter by parent hash
-R, --repo <strings>
Filter on repository
--sort <string> (default "best-match")
Sort fetched commits: {author-date|committer-date}
-t, --template <string>
Format JSON output using a Go template; see "gh help formatting"
--tree <string>
Filter by tree hash
--visibility <strings>
Filter based on repository visibility: {public|private|internal}
-w, --web
Open the search query in the web browser
JSON Fields
author, commit, committer, id, parents, repository, sha, url

Examples
# Search commits matching set of keywords "readme" and "typo"
$ gh search commits readme typo

# Search commits matching phrase "bug fix"
$ gh search commits "bug fix"

# Search commits committed by user "monalisa"
$ gh search commits --committer=monalisa

# Search commits authored by users with name "Jane Doe"
$ gh search commits --author-name="Jane Doe"

# Search commits matching hash "8dd03144ffdc6c0d486d6b705f9c7fba871ee7c3"
$ gh search commits --hash=8dd03144ffdc6c0d486d6b705f9c7fba871ee7c3

# Search commits authored before February 1st, 2022
$ gh search commits --author-date="<2022-02-01"


Okay, let's break down the possibilities for gh search commits in the same comprehensive way, focusing on how to construct effective queries.

Possibilities for gh search commits Query Construction
The gh search commits command allows you to find commits based on various attributes, leveraging GitHub's commit search API.

1. Simple Keyword Search (Implicit AND)

Description: Provide one or more keywords. GitHub will search these keywords in the commit message. Multiple keywords are treated as an AND operation.
Example:
Bash

gh search commits readme typo
Meaning: Find commits where the message contains both "readme" AND "typo".
2. Exact Phrase Search

Description: Enclose a phrase in double quotes to search for that exact sequence of words in the commit message.
Example:
Bash

gh search commits "bug fix"
Meaning: Find commits where the message contains the exact phrase "bug fix".
3. Single Filter/Qualifier

Description: Use a single command-line flag (--flag=value) to apply a specific filter to the commits.
Examples:
By Committer:
Bash

gh search commits --committer=monalisa
Meaning: Find commits committed by the GitHub user "monalisa".
By Author Name:
Bash

gh search commits --author-name="Jane Doe"
Meaning: Find commits authored by users with the name "Jane Doe".
By Commit Hash:
Bash

gh search commits --hash=8dd03144ffdc6c0d486d6b705f9c7fba871ee7c3
Meaning: Find the commit with the exact hash "8dd03144ffdc6c0d486d6b705f9c7fba871ee7c3".
Merge Commits:
Bash

gh search commits --merge
Meaning: Find only merge commits.
4. Multiple Filters (Implicit AND between Filters)

Description: Combine several command-line flags. All specified conditions must be met.
Example:
Bash

gh search commits --owner=myorg --repo=myrepo --committer=john
Meaning: Find commits where the committer is "john", AND the commit is in the "myrepo" repository, AND that repository is owned by "myorg".
5. Filtering with Date Ranges/Comparisons (--author-date, --committer-date)

Description: For date filters, use specific dates, comparison operators (>, <, >=, <=), or ranges (..).
Examples:
Before a Date:
Bash

gh search commits --author-date="<2022-02-01"
Meaning: Find commits authored before February 1st, 2022.
After a Date:
Bash

gh search commits --committer-date=">2024-01-01"
Meaning: Find commits committed after January 1, 2024.
Between Dates:
Bash

gh search commits --author-date="2023-03-01..2023-03-31"
Meaning: Find commits authored in March 2023.
6. "OR" Logic within Specific Filters (Comma-Separated Values)

Description: For filters that accept multiple values (like --owner, --repo, --visibility), you can provide a comma-separated list. This acts as an OR operation for that specific filter.
Examples:
Multiple Owners (OR):
Bash

gh search commits --owner=octocat,hub
Meaning: Find commits in repositories owned by "octocat" OR "hub".
Multiple Repositories (OR):
Bash

gh search commits --repo=myorg/repo1,myorg/repo2
Meaning: Find commits in "myorg/repo1" OR "myorg/repo2".
Multiple Visibilities (OR):
Bash

gh search commits --visibility=public,private
Meaning: Find commits in "public" OR "private" repositories.
7. Exclusion (NOT Operator)

Description: Use the - (minus) prefix before a keyword or a qualifier to exclude results that match that term or condition.
Examples:
Exclude a keyword in message:
Bash

gh search commits "feature" -wip
Meaning: Find commits with "feature" in the message, but not "wip".
Exclude by author:
Bash

gh search commits -- -author:botuser
Meaning: Find commits not authored by "botuser". (Note the -- before -author:botuser).
8. Combining Keywords and Filters (Implicit AND)

Description: You can freely combine general commit message keywords with specific flags. All conditions are implicitly ANDed.
Example:
Bash

gh search commits "refactor" --author=alice --committer-date="<2023-06-01"
Meaning: Find commits with "refactor" in the message, AND authored by "alice", AND committed before June 1, 2023.
9. Explicit "OR" Logic (Using OR Keyword)

Description: For "OR" conditions between different keywords or qualifiers (or more complex logical groupings), use the uppercase OR keyword within the main query string. Parentheses () can be used for grouping.
Examples:
Keywords with OR:
Bash

gh search commits "hotfix OR quickfix"
Meaning: Find commits containing "hotfix" OR "quickfix" in the message.
Qualifiers with OR (using standard GitHub search syntax in query):
Bash

gh search commits "author:john OR committer:jane"
Meaning: Find commits authored by "john" OR committed by "jane".
Complex Grouping:
Bash

gh search commits "message:\"new feature\" (author:alice OR committer:bob)"
Meaning: Find commits with "new feature" in the message AND (authored by "alice" OR committed by "bob").
10. Sorting (--sort, --order)

Description: Sort the returned commits by author date or committer date, in ascending or descending order.
Examples:
Sort by author date ascending:
Bash

gh search commits "initial commit" --sort=author-date --order=asc
Sort by committer date (default desc):
Bash

gh search commits --committer=john --sort=committer-date
Commit-Specific Filters:

--author <string>: GitHub username of the author.
--author-email <string>: Email of the author.
--author-name <string>: Full name of the author.
--committer <string>: GitHub username of the committer.
--committer-email <string>: Email of the committer.
--committer-name <string>: Full name of the committer.
--hash <string>: Exact commit SHA.
--parent <string>: Parent commit hash.
--tree <string>: Tree hash associated with the commit.
--repo <strings>: Repository (or list of repositories) to search within (e.g., owner/repo-name).
--owner <strings>: Owner (user or organization) of the repository.
--visibility <strings>: Visibility of the repository (public, private, internal).