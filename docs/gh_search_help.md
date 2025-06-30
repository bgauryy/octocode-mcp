- gh search code --help

Search within code in GitHub repositories.

The search syntax is documented at:
<https://docs.github.com/search-github/searching-on-github/searching-code>

Note that these search results are powered by what is now a legacy GitHub code search engine.
The results might not match what is seen on <github.com>, and new features like regex search
are not yet available via the GitHub API.

For more information about output formatting flags, see `gh help formatting`.

USAGE
  gh search code <query> [flags]

FLAGS
      --extension string   Filter on file extension
      --filename string    Filter on filename
  -q, --jq expression      Filter JSON output using a jq expression
      --json fields        Output JSON with the specified fields
      --language string    Filter results by language
  -L, --limit int          Maximum number of code results to fetch (default 30)
      --match strings      Restrict search to file contents or file path: {file|path}
      --owner strings      Filter on owner
  -R, --repo strings       Filter on repository
      --size string        Filter on size range, in kilobytes
  -t, --template string    Format JSON output using a Go template; see "gh help formatting"
  -w, --web                Open the search query in the web browser

INHERITED FLAGS
  --help   Show help for command

JSON FIELDS
  path, repository, sha, textMatches, url

EXAMPLES
  # Search code matching "react" and "lifecycle"
  $ gh search code react lifecycle
  
  # Search code matching "error handling"
  $ gh search code "error handling"
  
  # Search code matching "deque" in Python files
  $ gh search code deque --language=python
  
  # Search code matching "cli" in repositories owned by microsoft organization
  $ gh search code cli --owner=microsoft
  
  # Search code matching "panic" in the GitHub CLI repository
  $ gh search code panic --repo cli/cli
  
  # Search code matching keyword "lint" in package.json files
  $ gh search code lint --filename package.json

LEARN MORE
  Use `gh <command> <subcommand> --help` for more information about a command.
  Read the manual at https://cli.github.com/manual
  Learn about exit codes using `gh help exit-codes`
  Learn about accessibility experiences using `gh help accessibility`


 gh search commits --help

Search for commits on GitHub.

The command supports constructing queries using the GitHub search syntax,
using the parameter and qualifier flags, or a combination of the two.

GitHub search syntax is documented at:
<https://docs.github.com/search-github/searching-on-github/searching-commits>

For more information about output formatting flags, see `gh help formatting`.

USAGE
  gh search commits [<query>] [flags]

FLAGS
      --author string            Filter by author
      --author-date date         Filter based on authored date
      --author-email string      Filter on author email
      --author-name string       Filter on author name
      --committer string         Filter by committer
      --committer-date date      Filter based on committed date
      --committer-email string   Filter on committer email
      --committer-name string    Filter on committer name
      --hash string              Filter by commit hash
  -q, --jq expression            Filter JSON output using a jq expression
      --json fields              Output JSON with the specified fields
  -L, --limit int                Maximum number of commits to fetch (default 30)
      --merge                    Filter on merge commits
      --order string             Order of commits returned, ignored unless '--sort' flag is specified: {asc|desc} (default "desc")
      --owner strings            Filter on repository owner
      --parent string            Filter by parent hash
  -R, --repo strings             Filter on repository
      --sort string              Sort fetched commits: {author-date|committer-date} (default "best-match")
  -t, --template string          Format JSON output using a Go template; see "gh help formatting"
      --tree string              Filter by tree hash
      --visibility strings       Filter based on repository visibility: {public|private|internal}
  -w, --web                      Open the search query in the web browser

INHERITED FLAGS
  --help   Show help for command

JSON FIELDS
  author, commit, committer, id, parents, repository, sha, url

EXAMPLES
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

LEARN MORE
  Use `gh <command> <subcommand> --help` for more information about a command.
  Read the manual at https://cli.github.com/manual
  Learn about exit codes using `gh help exit-codes`
  Learn about accessibility experiences using `gh help accessibility`


 gh search issues --help 

Search for issues on GitHub.

The command supports constructing queries using the GitHub search syntax,
using the parameter and qualifier flags, or a combination of the two.

GitHub search syntax is documented at:
<https://docs.github.com/search-github/searching-on-github/searching-issues-and-pull-requests>

For more information about output formatting flags, see `gh help formatting`.

USAGE
  gh search issues [<query>] [flags]

FLAGS
      --app string             Filter by GitHub App author
      --archived               Filter based on the repository archived state {true|false}
      --assignee string        Filter by assignee
      --author string          Filter by author
      --closed date            Filter on closed at date
      --commenter user         Filter based on comments by user
      --comments number        Filter on number of comments
      --created date           Filter based on created at date
      --include-prs            Include pull requests in results
      --interactions number    Filter on number of reactions and comments
      --involves user          Filter based on involvement of user
  -q, --jq expression          Filter JSON output using a jq expression
      --json fields            Output JSON with the specified fields
      --label strings          Filter on label
      --language string        Filter based on the coding language
  -L, --limit int              Maximum number of results to fetch (default 30)
      --locked                 Filter on locked conversation status
      --match strings          Restrict search to specific field of issue: {title|body|comments}
      --mentions user          Filter based on user mentions
      --milestone title        Filter by milestone title
      --no-assignee            Filter on missing assignee
      --no-label               Filter on missing label
      --no-milestone           Filter on missing milestone
      --no-project             Filter on missing project
      --order string           Order of results returned, ignored unless '--sort' flag is specified: {asc|desc} (default "desc")
      --owner strings          Filter on repository owner
      --project owner/number   Filter on project board owner/number
      --reactions number       Filter on number of reactions
  -R, --repo strings           Filter on repository
      --sort string            Sort fetched results: {comments|created|interactions|reactions|reactions-+1|reactions--1|reactions-heart|reactions-smile|reactions-tada|reactions-thinking_face|updated} (default "best-match")
      --state string           Filter based on state: {open|closed}
      --team-mentions string   Filter based on team mentions
  -t, --template string        Format JSON output using a Go template; see "gh help formatting"
      --updated date           Filter on last updated at date
      --visibility strings     Filter based on repository visibility: {public|private|internal}
  -w, --web                    Open the search query in the web browser

INHERITED FLAGS
  --help   Show help for command

JSON FIELDS
  assignees, author, authorAssociation, body, closedAt, commentsCount, createdAt,
  id, isLocked, isPullRequest, labels, number, repository, state, title,
  updatedAt, url

EXAMPLES
  # Search issues matching set of keywords "readme" and "typo"
  $ gh search issues readme typo
  
  # Search issues matching phrase "broken feature"
  $ gh search issues "broken feature"
  
  # Search issues and pull requests in cli organization
  $ gh search issues --include-prs --owner=cli
  
  # Search open issues assigned to yourself
  $ gh search issues --assignee=@me --state=open
  
  # Search issues with numerous comments
  $ gh search issues --comments=">100"
  
  # Search issues without label "bug"
  $ gh search issues -- -label:bug
  
  # Search issues only from un-archived repositories (default is all repositories)
  $ gh search issues --owner github --archived=false

LEARN MORE
  Use `gh <command> <subcommand> --help` for more information about a command.
  Read the manual at https://cli.github.com/manual
  Learn about exit codes using `gh help exit-codes`
  Learn about accessibility experiences using `gh help accessibility`

 gh search prs --help  
Search for pull requests on GitHub.

The command supports constructing queries using the GitHub search syntax,
using the parameter and qualifier flags, or a combination of the two.

GitHub search syntax is documented at:
<https://docs.github.com/search-github/searching-on-github/searching-issues-and-pull-requests>

For more information about output formatting flags, see `gh help formatting`.

USAGE
  gh search prs [<query>] [flags]

FLAGS
      --app string              Filter by GitHub App author
      --archived                Filter based on the repository archived state {true|false}
      --assignee string         Filter by assignee
      --author string           Filter by author
  -B, --base string             Filter on base branch name
      --checks string           Filter based on status of the checks: {pending|success|failure}
      --closed date             Filter on closed at date
      --commenter user          Filter based on comments by user
      --comments number         Filter on number of comments
      --created date            Filter based on created at date
      --draft                   Filter based on draft state
  -H, --head string             Filter on head branch name
      --interactions number     Filter on number of reactions and comments
      --involves user           Filter based on involvement of user
  -q, --jq expression           Filter JSON output using a jq expression
      --json fields             Output JSON with the specified fields
      --label strings           Filter on label
      --language string         Filter based on the coding language
  -L, --limit int               Maximum number of results to fetch (default 30)
      --locked                  Filter on locked conversation status
      --match strings           Restrict search to specific field of issue: {title|body|comments}
      --mentions user           Filter based on user mentions
      --merged                  Filter based on merged state
      --merged-at date          Filter on merged at date
      --milestone title         Filter by milestone title
      --no-assignee             Filter on missing assignee
      --no-label                Filter on missing label
      --no-milestone            Filter on missing milestone
      --no-project              Filter on missing project
      --order string            Order of results returned, ignored unless '--sort' flag is specified: {asc|desc} (default "desc")
      --owner strings           Filter on repository owner
      --project owner/number    Filter on project board owner/number
      --reactions number        Filter on number of reactions
  -R, --repo strings            Filter on repository
      --review string           Filter based on review status: {none|required|approved|changes_requested}
      --review-requested user   Filter on user or team requested to review
      --reviewed-by user        Filter on user who reviewed
      --sort string             Sort fetched results: {comments|reactions|reactions-+1|reactions--1|reactions-smile|reactions-thinking_face|reactions-heart|reactions-tada|interactions|created|updated} (default "best-match")
      --state string            Filter based on state: {open|closed}
      --team-mentions string    Filter based on team mentions
  -t, --template string         Format JSON output using a Go template; see "gh help formatting"
      --updated date            Filter on last updated at date
      --visibility strings      Filter based on repository visibility: {public|private|internal}
  -w, --web                     Open the search query in the web browser

INHERITED FLAGS
  --help   Show help for command

JSON FIELDS
  assignees, author, authorAssociation, body, closedAt, commentsCount, createdAt,
  id, isDraft, isLocked, isPullRequest, labels, number, repository, state, title,
  updatedAt, url

EXAMPLES
  # Search pull requests matching set of keywords "fix" and "bug"
  $ gh search prs fix bug
  
  # Search draft pull requests in cli repository
  $ gh search prs --repo=cli/cli --draft
  
  # Search open pull requests requesting your review
  $ gh search prs --review-requested=@me --state=open
  
  # Search merged pull requests assigned to yourself
  $ gh search prs --assignee=@me --merged
  
  # Search pull requests with numerous reactions
  $ gh search prs --reactions=">100"
  
  # Search pull requests without label "bug"
  $ gh search prs -- -label:bug
  
  # Search pull requests only from un-archived repositories (default is all repositories)
  $ gh search prs --owner github --archived=false

LEARN MORE
  Use `gh <command> <subcommand> --help` for more information about a command.
  Read the manual at https://cli.github.com/manual
  Learn about exit codes using `gh help exit-codes`
  Learn about accessibility experiences using `gh help accessibility`

 gh search repos --help
Search for repositories on GitHub.

The command supports constructing queries using the GitHub search syntax,
using the parameter and qualifier flags, or a combination of the two.

GitHub search syntax is documented at:
<https://docs.github.com/search-github/searching-on-github/searching-for-repositories>

For more information about output formatting flags, see `gh help formatting`.

USAGE
  gh search repos [<query>] [flags]

FLAGS
      --archived                    Filter based on the repository archived state {true|false}
      --created date                Filter based on created at date
      --followers number            Filter based on number of followers
      --forks number                Filter on number of forks
      --good-first-issues number    Filter on number of issues with the 'good first issue' label
      --help-wanted-issues number   Filter on number of issues with the 'help wanted' label
      --include-forks string        Include forks in fetched repositories: {false|true|only}
  -q, --jq expression               Filter JSON output using a jq expression
      --json fields                 Output JSON with the specified fields
      --language string             Filter based on the coding language
      --license strings             Filter based on license type
  -L, --limit int                   Maximum number of repositories to fetch (default 30)
      --match strings               Restrict search to specific field of repository: {name|description|readme}
      --number-topics number        Filter on number of topics
      --order string                Order of repositories returned, ignored unless '--sort' flag is specified: {asc|desc} (default "desc")
      --owner strings               Filter on owner
      --size string                 Filter on a size range, in kilobytes
      --sort string                 Sort fetched repositories: {forks|help-wanted-issues|stars|updated} (default "best-match")
      --stars number                Filter on number of stars
  -t, --template string             Format JSON output using a Go template; see "gh help formatting"
      --topic strings               Filter on topic
      --updated date                Filter on last updated at date
      --visibility strings          Filter based on visibility: {public|private|internal}
  -w, --web                         Open the search query in the web browser

INHERITED FLAGS
  --help   Show help for command

JSON FIELDS
  createdAt, defaultBranch, description, forksCount, fullName, hasDownloads,
  hasIssues, hasPages, hasProjects, hasWiki, homepage, id, isArchived, isDisabled,
  isFork, isPrivate, language, license, name, openIssuesCount, owner, pushedAt,
  size, stargazersCount, updatedAt, url, visibility, watchersCount

EXAMPLES
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

LEARN MORE
  Use `gh <command> <subcommand> --help` for more information about a command.
  Read the manual at https://cli.github.com/manual
  Learn about exit codes using `gh help exit-codes`
  Learn about accessibility experiences using `gh help accessibility`

