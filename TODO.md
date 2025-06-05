 Avoid command injection

Using template literals directly can pose a risk if user input is not sanitized. Prefer using argument arrays or validation if this is passed to a shell.

If this command is passed to exec or similar functions:

    Sanitize inputs.