gh search issues
gh search issues [<query>] [flags]
Search for issues on GitHub.

The command supports constructing queries using the GitHub search syntax, using the parameter and qualifier flags, or a combination of the two.

GitHub search syntax is documented at: https://docs.github.com/search-github/searching-on-github/searching-issues-and-pull-requests

Options
--app <string>
Filter by GitHub App author
--archived
Filter based on the repository archived state {true|false}
--assignee <string>
Filter by assignee
--author <string>
Filter by author
--closed <date>
Filter on closed at date
--commenter <user>
Filter based on comments by user
--comments <number>
Filter on number of comments
--created <date>
Filter based on created at date
--include-prs
Include pull requests in results
--interactions <number>
Filter on number of reactions and comments
--involves <user>
Filter based on involvement of user
-q, --jq <expression>
Filter JSON output using a jq expression
--json <fields>
Output JSON with the specified fields
--label <strings>
Filter on label
--language <string>
Filter based on the coding language
-L, --limit <int> (default 30)
Maximum number of results to fetch
--locked
Filter on locked conversation status
--match <strings>
Restrict search to specific field of issue: {title|body|comments}
--mentions <user>
Filter based on user mentions
--milestone <title>
Filter by milestone title
--no-assignee
Filter on missing assignee
--no-label
Filter on missing label
--no-milestone
Filter on missing milestone
--no-project
Filter on missing project
--order <string> (default "desc")
Order of results returned, ignored unless '--sort' flag is specified: {asc|desc}
--owner <strings>
Filter on repository owner
--project <owner/number>
Filter on project board owner/number
--reactions <number>
Filter on number of reactions
-R, --repo <strings>
Filter on repository
--sort <string> (default "best-match")
Sort fetched results: {comments|created|interactions|reactions|reactions-+1|reactions--1|reactions-heart|reactions-smile|reactions-tada|reactions-thinking_face|updated}
--state <string>
Filter based on state: {open|closed}
--team-mentions <string>
Filter based on team mentions
-t, --template <string>
Format JSON output using a Go template; see "gh help formatting"
--updated <date>
Filter on last updated at date
--visibility <strings>
Filter based on repository visibility: {public|private|internal}
-w, --web
Open the search query in the web browser
JSON Fields
assignees, author, authorAssociation, body, closedAt, commentsCount, createdAt, id, isLocked, isPullRequest, labels, number, repository, state, title, updatedAt, url

Examples
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