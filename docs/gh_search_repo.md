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