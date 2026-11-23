# Outline parser

`parse_outline(text)` returns the headings of a Markdown document as a list of
`(level, title)` pairs, in document order.

- A heading is a line that starts with one to six `#` characters followed by a title.
- A byte-order mark at the start of the document is ignored.
- A document without headings returns `[]`.
- An empty document (the empty string) is valid and returns `[]`.
