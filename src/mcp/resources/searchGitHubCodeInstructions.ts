import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerSearchGitHubCodeInstructionsResource(
  server: McpServer
) {
  server.resource(
    'search-github-code-instructions',
    'help://github-code-search',
    async uri => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'text/markdown',
          text: `# Understanding GitHub Code Search Syntax

You can build search queries for the results you want with specialized code qualifiers, regular expressions, and boolean operations.

## About Code Search Query Structure

The search syntax in this article only applies to searching code with GitHub code search. Note that the syntax and qualifiers for searching for non-code content, such as issues, users, and discussions, is not the same as the syntax for code search.

Search queries consist of **search terms**, comprising text you want to search for, and **qualifiers**, which narrow down the search.

A bare term with no qualifiers will match either the content of a file or the file's path.

For example, the following query:
\`\`\`
http-push
\`\`\`

The above query will match the file \`docs/http-push.txt\`, even if it doesn't contain the term \`http-push\`. It will also match a file called \`example.txt\` if it contains the term \`http-push\`.

You can enter multiple terms separated by whitespace to search for documents that satisfy both terms.

For example, the following query:
\`\`\`
sparse index
\`\`\`

The search results would include all documents containing both the terms \`sparse\` and \`index\`, in any order. As examples, it would match a file containing \`SparseIndexVector\`, a file with the phrase \`index for sparse trees\`, and even a file named \`index.txt\` that contains the term \`sparse\`.

Searching for multiple terms separated by whitespace is the equivalent to the search \`hello AND world\`. Other boolean operations, such as \`hello OR world\`, are also supported.

Code search also supports searching for an exact string, including whitespace.

You can narrow your code search with specialized qualifiers, such as \`repo:\`, \`language:\` and \`path:\`.

You can also use regular expressions in your searches by surrounding the expression in slashes.

## Query for an Exact Match

To search for an exact string, including whitespace, you can surround the string in quotes. For example:

\`\`\`
"sparse index"
\`\`\`

You can also use quoted strings in qualifiers, for example:

\`\`\`
path:git language:"protocol buffers"
\`\`\`

## Searching for Quotes and Backslashes

To search for code containing a quotation mark, you can escape the quotation mark using a backslash. For example, to find the exact string \`name = "tensorflow"\`, you can search:

\`\`\`
"name = \\"tensorflow\\""
\`\`\`

To search for code containing a backslash, \`\\\`, use a double backslash, \`\\\\\\\`.

The two escape sequences \`\\\\\\\` and \`\\"\` can be used outside of quotes as well. No other escape sequences are recognized, though. A backslash that isn't followed by either \`"\` or \`\\\` is included in the search, unchanged.

Additional escape sequences, such as \`\\n\` to match a newline character, are supported in regular expressions.

## Using Boolean Operations

Code search supports boolean expressions. You can use the operators \`AND\`, \`OR\`, and \`NOT\` to combine search terms.

By default, adjacent terms separated by whitespace are equivalent to using the \`AND\` operator. For example, the search query \`sparse index\` is the same as \`sparse AND index\`, meaning that the search results will include all documents containing both the terms \`sparse\` and \`index\`, in any order.

To search for documents containing either one term or the other, you can use the \`OR\` operator. For example, the following query will match documents containing either \`sparse\` or \`index\`:

\`\`\`
sparse OR index
\`\`\`

To exclude files from your search results, you can use the \`NOT\` operator. For example, to exclude files in the \`__testing__\` directory, you can search:

\`\`\`
"fatal error" NOT path:__testing__
\`\`\`

You can use parentheses to express more complicated boolean expressions. For example:

\`\`\`
(language:ruby OR language:python) AND NOT path:"/tests/"
\`\`\`

## Using Qualifiers

### Search by File Contents or File Path

With the \`in\` qualifier you can restrict your search to the contents of the source code file, the file path, or both. When you omit this qualifier, only the file contents are searched.

| Qualifier | Example |
|-----------|---------|
| \`in:file\` | \`octocat in:file\` matches code where "octocat" appears in the file contents. |
| \`in:path\` | \`octocat in:path\` matches code where "octocat" appears in the file path. |
| \`in:file,path\` | \`octocat in:file,path\` matches code where "octocat" appears in the file contents or the file path. |

### Search Within a User's or Organization's Repositories

To search the code in all repositories owned by a certain user or organization, you can use the \`user\` or \`org\` qualifier. To search the code in a specific repository, you can use the \`repo\` qualifier.

| Qualifier | Example |
|-----------|---------|
| \`user:USERNAME\` | \`user:defunkt extension:rb\` matches code from @defunkt that ends in .rb. |
| \`org:ORGNAME\` | \`org:github extension:js\` matches code from GitHub that ends in .js. |
| \`repo:USERNAME/REPOSITORY\` | \`repo:mozilla/shumway extension:as\` matches code from @mozilla's shumway project that ends in .as. |

### Search by File Location

You can use the \`path\` qualifier to search for source code that appears at a specific location in a repository. Use \`path:/\` to search for files that are located at the root level of a repository. Or specify a directory name or the path to a directory to search for files that are located within that directory or any of its subdirectories.

| Qualifier | Example |
|-----------|---------|
| \`path:/\` | \`octocat filename:readme path:/\` matches readme files with the word "octocat" that are located at the root level of a repository. |
| \`path:DIRECTORY\` | \`form path:cgi-bin language:perl\` matches Perl files with the word "form" in the cgi-bin directory, or in any of its subdirectories. |
| \`path:PATH/TO/DIRECTORY\` | \`console path:app/public language:javascript\` matches JavaScript files with the word "console" in the app/public directory, or in any of its subdirectories (even if they reside in app/public/js/form-validators). |

### Search by Language

You can search for code based on what language it's written in. The \`language\` qualifier can be the language name or alias.

| Qualifier | Example |
|-----------|---------|
| \`language:LANGUAGE\` | \`element language:xml size:100\` matches code with the word "element" that's marked as being XML and has exactly 100 bytes. |
| \`language:LANGUAGE\` | \`display language:scss\` matches code with the word "display," that's marked as being SCSS. |
| \`language:LANGUAGE\` | \`org:mozilla language:markdown\` matches code from all @mozilla's repositories that's marked as Markdown. |

## Using Regular Expressions

You can use regular expressions in your searches by surrounding the expression in slashes. For example:

\`\`\`
/import.*from/
\`\`\`

This would match lines that contain "import" followed by any characters and then "from".

Additional escape sequences, such as \`\\n\` to match a newline character, are supported in regular expressions.

## Search Limitations

**Important constraints to be aware of:**

- You must be signed into a personal account on GitHub to search for code across all public repositories
- Code in forks is only searchable if the fork has more stars than the parent repository, and the forked repository has at least one pushed commit after being created
- Only the default branch is indexed for code search
- Only files smaller than 384 KB are searchable
- Up to 4,000 private repositories are searchable
- Only repositories with fewer than 500,000 files are searchable
- Only repositories that have had activity or have been returned in search results in the last year are searchable
- Except with filename searches, you must always include at least one search term when searching source code
- At most, search results can show two fragments from the same file, but there may be more results within the file
- You can't use the following wildcard characters as part of your search query: \`. , : ; / \\\\ \` ' " = * ! ? # $ & + ^ | ~ < > ( ) { } [ ] @\`. The search will simply ignore these symbols

## Examples

### Authentication Patterns
\`\`\`
"JWT token" language:javascript
"passport.authenticate" language:javascript
"bcrypt.hash" language:javascript path:auth
"OAuth" language:javascript NOT path:test
\`\`\`

### API Development
\`\`\`
"Express" AND "middleware" language:javascript
"fetch(" language:javascript path:api
"GraphQL" language:javascript org:facebook
repo:apollographql/apollo-server "resolver"
\`\`\`

### Database Operations
\`\`\`
"mongoose.Schema" language:javascript
"Prisma" language:typescript
"SELECT * FROM" language:sql
"INSERT INTO" language:sql path:migrations
\`\`\`

---

*Generated: ${new Date().toISOString()}*`,
        },
      ],
    })
  );
}
