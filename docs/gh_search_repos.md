gh search repos Command Explained

The gh search repos command allows you to search for repositories on GitHub.

Basic Usage:

gh search repos [<QUERY>] [FLAGS]

    <QUERY>: This is what you're looking for within repository names, descriptions, or READMEs (by default). It can be:

        One or more words (e.g., cli shell).

        A phrase enclosed in double quotes for an exact match (e.g., "vim plugin").

        If you provide multiple words, the search will look for repositories containing all those words.

        You can omit the query to use only flags for filtering.

    [FLAGS]: These are optional filters to narrow down your search. You can use zero or more flags, and they are added after your query. Flags use the format --flagName=value.

How Queries and Flags Work Together

    When you use multiple words in your QUERY (e.g., cli shell), the command finds repositories that contain all those words.

    FLAGS act as additional filters. For example, --language=go will only show results for Go repositories.

The more terms you add to your query, and the more flags you use, the fewer results you'll get, because you're making your search more specific.

Common Flags:

    --archived: Filter by archived state (true or false).

    --created date: Filter by creation date (e.g., --created=">2023-01-01").

    --forks number: Filter by number of forks (e.g., --forks=">=100").

    --language string: Filter by programming language (e.g., --language=python).

    --limit int: Set the maximum number of results (default is 30).

    --owner strings: Filter by repository owner (e.g., --owner=microsoft).

    --stars number: Filter by number of stars (e.g., --stars=">=1000").

    --topic strings: Filter by repository topics (e.g., --topic=unix,terminal).

    --updated date: Filter by last update date (e.g., --updated="<2024-06-01").

    --visibility strings: Filter by visibility (public, private, internal).

    --web: Open the search results in your web browser.

Date and Number Filters: For flags like --created, --forks, --stars, etc., you can use comparison operators:

    > (greater than)

    < (less than)

    >= (greater than or equal to)

    <= (less than or equal to)

Examples:

    Search for repositories matching "cli" and "shell":
    Bash

gh search repos cli shell

Search for repositories matching the exact phrase "vim plugin":
Bash

gh search repos "vim plugin"

Search for public repositories owned by the "microsoft" organization:
Bash

gh search repos --owner=microsoft --visibility=public

Search for repositories with "unix" or "terminal" topics:
Bash

gh search repos --topic=unix,terminal

Search for Go repositories with 10 or more "good first issues":
Bash

gh search repos --language=go --good-first-issues=">=10"

Search for repositories, excluding those with the "linux" topic:
Bash

gh search repos -- -topic:linux

Search for repositories that are not archived:
Bash

gh search repos --archived=false
