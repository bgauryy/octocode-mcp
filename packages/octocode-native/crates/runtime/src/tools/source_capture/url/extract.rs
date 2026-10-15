//! Page text a classifier judges and a line reader addresses: HTML parsed
//! with html5ever (the browser algorithm, so unclosed and misnested markup
//! nests as a browser shows it) and rendered as one line per block, in
//! document order. Headings keep their level as `#` marks, list items a `- `
//! marker, table rows their cells joined by ` | `, and preformatted blocks
//! their exact lines inside ``` fences. Scripts, styles, templates, inline
//! SVG, navigation and footers carry no page text and are dropped.
//!
//! A fragment selects one anchored section: the element whose `id` (or an
//! `<a name>`) equals it. A heading anchor, or an anchor inside or right
//! before a heading, selects through the next heading of the same or a
//! higher level; any other anchor selects its own element's text.
use html5ever::tendril::{StrTendril, TendrilSink};
use html5ever::tree_builder::{ElemName, ElementFlags, NodeOrText, QuirksMode, TreeSink};
use html5ever::{Attribute, LocalName, Namespace, QualName, parse_document};
use std::borrow::Cow;
use std::cell::RefCell;

/// Why a page or its anchored section yields no text to judge.
#[derive(Debug, PartialEq, Eq)]
pub(super) enum Failure {
    /// The page has no text; `scripted` when it has scripts, which usually
    /// means it builds its content in a browser.
    Empty { scripted: bool },
    /// No element carries the fragment as its anchor.
    MissingAnchor,
    /// This many elements carry the fragment as their anchor.
    AmbiguousAnchor(usize),
    /// The anchored element holds no text.
    EmptySection,
    /// `stop` ended the parse.
    Stopped,
}

/// Input the parser takes between `stop` checks. Tree building is
/// quadratic in nesting depth, so a hostile page is bounded by the call's
/// deadline, checked this often, rather than by its size alone.
const PARSE_CHUNK_BYTES: usize = 8 * 1024;

/// The extracted text of `source` (whole, or the section `fragment`
/// anchors), newline-terminated. `stop` is polled while parsing.
pub(super) fn html(
    source: &str,
    fragment: Option<&str>,
    stop: &dyn Fn() -> bool,
) -> Result<String, Failure> {
    let dom = Dom::parse(source, stop).ok_or(Failure::Stopped)?;
    let body = dom.body();
    let Some(fragment) = fragment else {
        let lines = Walker::new(&dom, None).walk(body);
        if lines.lines.is_empty() {
            return Err(Failure::Empty {
                scripted: dom.has_script(),
            });
        }
        return Ok(join(&lines.lines));
    };
    let anchors = dom.anchors(fragment);
    let target = match anchors.as_slice() {
        [] => return Err(Failure::MissingAnchor),
        [target] => *target,
        many => return Err(Failure::AmbiguousAnchor(many.len())),
    };
    let heading = dom.heading_at_or_above(target);
    let walked = Walker::new(&dom, Some(heading.unwrap_or(target))).walk(body);
    let lines = &walked.lines;
    let (start, end) = walked.span.unwrap_or((0, 0));
    let section = match heading {
        Some(_) => section_from(lines, start),
        // An empty anchor marks the heading that follows it.
        None if start == end && lines.get(start).is_some_and(|line| line.level.is_some()) => {
            section_from(lines, start)
        }
        None => &lines[start.min(lines.len())..end.min(lines.len())],
    };
    if section.is_empty() {
        return Err(Failure::EmptySection);
    }
    Ok(join(section))
}

/// Plain or Markdown text as served, with line endings normalized.
pub(super) fn plain(source: &str) -> Result<String, Failure> {
    let mut text = source.replace("\r\n", "\n").replace('\r', "\n");
    if text.trim().is_empty() {
        return Err(Failure::Empty { scripted: false });
    }
    if !text.ends_with('\n') {
        text.push('\n');
    }
    Ok(text)
}

/// The heading section starting at line `start`: through the line before
/// the next heading of the same or a higher level.
fn section_from(lines: &[Line], start: usize) -> &[Line] {
    let Some(level) = lines.get(start).and_then(|line| line.level) else {
        return &[];
    };
    let end = lines[start + 1..]
        .iter()
        .position(|line| line.level.is_some_and(|other| other <= level))
        .map_or(lines.len(), |offset| start + 1 + offset);
    &lines[start..end]
}

fn join(lines: &[Line]) -> String {
    let mut text = String::new();
    for line in lines {
        text.push_str(&line.text);
        text.push('\n');
    }
    text
}

struct Line {
    text: String,
    /// A heading line's level.
    level: Option<u8>,
}

/// What an element contributes to the text.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Kind {
    /// No page text: dropped with its subtree.
    Skip,
    Heading(u8),
    Pre,
    Row,
    Item,
    Break,
    Block,
    Inline,
}

fn kind(local: &str) -> Kind {
    match local {
        "script" | "style" | "noscript" | "template" | "svg" | "nav" | "footer" | "head" => {
            Kind::Skip
        }
        "h1" => Kind::Heading(1),
        "h2" => Kind::Heading(2),
        "h3" => Kind::Heading(3),
        "h4" => Kind::Heading(4),
        "h5" => Kind::Heading(5),
        "h6" => Kind::Heading(6),
        "pre" => Kind::Pre,
        "tr" => Kind::Row,
        "li" => Kind::Item,
        "br" | "hr" => Kind::Break,
        "address" | "article" | "aside" | "blockquote" | "body" | "caption" | "center" | "dd"
        | "details" | "dialog" | "dir" | "div" | "dl" | "dt" | "fieldset" | "figcaption"
        | "figure" | "form" | "header" | "hgroup" | "html" | "legend" | "main" | "menu" | "ol"
        | "p" | "search" | "section" | "summary" | "table" | "tbody" | "td" | "tfoot" | "th"
        | "thead" | "ul" => Kind::Block,
        _ => Kind::Inline,
    }
}

/// Whitespace-collapsing text: runs of whitespace become one space, with
/// none at either end.
#[derive(Default)]
struct Collapsed {
    text: String,
    space: bool,
}

impl Collapsed {
    fn push(&mut self, raw: &str) {
        for ch in raw.chars() {
            // HTML collapses ASCII whitespace only; a no-break space stays.
            if matches!(ch, ' ' | '\t' | '\n' | '\r' | '\x0C') {
                self.space = self.space || !self.text.is_empty();
            } else {
                if self.space {
                    self.text.push(' ');
                    self.space = false;
                }
                self.text.push(ch);
            }
        }
    }

    /// A boundary between blocks inside one line (a table cell, a heading).
    fn gap(&mut self) {
        self.space = self.space || !self.text.is_empty();
    }

    fn take(&mut self) -> String {
        self.space = false;
        std::mem::take(&mut self.text)
    }
}

struct Walked {
    lines: Vec<Line>,
    /// The target element's lines, `[start, end)`.
    span: Option<(usize, usize)>,
}

enum Step {
    Enter(usize),
    Exit(usize, Kind),
}

struct Walker<'a> {
    dom: &'a Dom,
    lines: Vec<Line>,
    current: Collapsed,
    /// One entry per open list item: whether its marker line is written.
    items: Vec<bool>,
    target: Option<usize>,
    start: usize,
    span: Option<(usize, usize)>,
}

impl<'a> Walker<'a> {
    fn new(dom: &'a Dom, target: Option<usize>) -> Self {
        Self {
            dom,
            lines: Vec::new(),
            current: Collapsed::default(),
            items: Vec::new(),
            target,
            start: 0,
            span: None,
        }
    }

    fn walk(mut self, root: usize) -> Walked {
        let mut stack = vec![Step::Enter(root)];
        while let Some(step) = stack.pop() {
            match step {
                Step::Enter(id) => self.enter(id, &mut stack),
                Step::Exit(id, kind) => self.exit(id, kind),
            }
        }
        self.flush();
        Walked {
            lines: self.lines,
            span: self.span,
        }
    }

    fn enter(&mut self, id: usize, stack: &mut Vec<Step>) {
        let node = &self.dom.nodes[id];
        let local = match &node.data {
            Data::Text(text) => {
                self.current.push(text);
                return;
            }
            Data::Element { name, .. } => name.local.as_ref(),
            Data::Document => "",
            Data::Other => return,
        };
        let kind = kind(local);
        match kind {
            Kind::Skip => self.unit(id, |_| {}),
            Kind::Heading(level) => self.unit(id, |walker| {
                let text = walker.dom.inline_text(id);
                if !text.is_empty() {
                    walker.lines.push(Line {
                        text: format!("{} {text}", "#".repeat(usize::from(level))),
                        level: Some(level),
                    });
                }
            }),
            Kind::Pre => self.unit(id, |walker| {
                let raw = walker.dom.raw_text(id);
                let lines: Vec<&str> = raw.lines().collect();
                let first = lines.iter().position(|line| !line.trim().is_empty());
                let last = lines.iter().rposition(|line| !line.trim().is_empty());
                if let (Some(first), Some(last)) = (first, last) {
                    walker.push_line("```".into(), None);
                    for line in &lines[first..=last] {
                        walker.push_line((*line).to_owned(), None);
                    }
                    walker.push_line("```".into(), None);
                }
            }),
            Kind::Row => self.unit(id, |walker| {
                let cells: Vec<String> = walker.dom.nodes[id]
                    .children
                    .iter()
                    .filter(|child| matches!(walker.dom.local(**child), Some("td" | "th")))
                    .map(|child| walker.dom.inline_text(*child))
                    .collect();
                if cells.iter().any(|cell| !cell.is_empty()) {
                    walker.push_line(cells.join(" | "), None);
                }
            }),
            Kind::Break => self.flush(),
            Kind::Item | Kind::Block | Kind::Inline => {
                if kind != Kind::Inline {
                    self.flush();
                }
                if kind == Kind::Item {
                    self.items.push(false);
                }
                if self.target == Some(id) {
                    self.start = self.lines.len();
                }
                stack.push(Step::Exit(id, kind));
                for child in self.dom.nodes[id].children.iter().rev() {
                    stack.push(Step::Enter(*child));
                }
            }
        }
    }

    fn exit(&mut self, id: usize, kind: Kind) {
        if kind != Kind::Inline {
            self.flush();
        }
        if kind == Kind::Item {
            self.items.pop();
        }
        if self.target == Some(id) {
            let pending = usize::from(!self.current.text.is_empty());
            self.span = Some((self.start, self.lines.len() + pending));
        }
    }

    /// An element rendered whole by `render`; the target's span when the
    /// target is the element or inside it.
    fn unit(&mut self, id: usize, render: impl FnOnce(&mut Self)) {
        self.flush();
        let start = self.lines.len();
        render(self);
        if self
            .target
            .is_some_and(|target| self.dom.is_within(target, id))
        {
            self.span = Some((start, self.lines.len()));
        }
    }

    fn flush(&mut self) {
        let text = self.current.take();
        if !text.is_empty() {
            self.push_line(text, None);
        }
    }

    fn push_line(&mut self, text: String, level: Option<u8>) {
        let depth = self.items.len();
        let text = match self.items.last_mut() {
            Some(marked) if level.is_none() => {
                let indent = "  ".repeat(depth - 1);
                if *marked {
                    format!("{indent}  {text}")
                } else {
                    *marked = true;
                    format!("{indent}- {text}")
                }
            }
            _ => text,
        };
        self.lines.push(Line { text, level });
    }
}

enum Data {
    Document,
    Element {
        name: QualName,
        attrs: Vec<Attribute>,
        /// A template's contents fragment.
        contents: Option<usize>,
    },
    Text(String),
    Other,
}

struct Node {
    parent: Option<usize>,
    children: Vec<usize>,
    data: Data,
}

/// A parsed document: an index arena the tree builder fills.
struct Dom {
    nodes: Vec<Node>,
}

impl Dom {
    /// The parsed document, or `None` when `stop` ends the parse.
    fn parse(source: &str, stop: &dyn Fn() -> bool) -> Option<Self> {
        let sink = Sink {
            nodes: RefCell::new(vec![Node {
                parent: None,
                children: Vec::new(),
                data: Data::Document,
            }]),
        };
        let mut parser = parse_document(sink, html5ever::ParseOpts::default());
        let mut rest = source;
        while !rest.is_empty() {
            if stop() {
                return None;
            }
            let mut cut = rest.len().min(PARSE_CHUNK_BYTES);
            while !rest.is_char_boundary(cut) {
                cut += 1;
            }
            parser.process(StrTendril::from(&rest[..cut]));
            rest = &rest[cut..];
        }
        Some(Self {
            nodes: parser.finish(),
        })
    }

    fn local(&self, id: usize) -> Option<&str> {
        match &self.nodes[id].data {
            Data::Element { name, .. } => Some(name.local.as_ref()),
            _ => None,
        }
    }

    fn attr(&self, id: usize, attr: &str) -> Option<&str> {
        match &self.nodes[id].data {
            Data::Element { attrs, .. } => attrs
                .iter()
                .find(|candidate| &*candidate.name.local == attr)
                .map(|found| found.value.as_ref()),
            _ => None,
        }
    }

    /// Every node in the document tree, in document order.
    fn in_tree(&self) -> Vec<usize> {
        let mut order = Vec::new();
        let mut stack = vec![0];
        while let Some(id) = stack.pop() {
            order.push(id);
            stack.extend(self.nodes[id].children.iter().rev());
        }
        order
    }

    fn body(&self) -> usize {
        self.in_tree()
            .into_iter()
            .find(|id| self.local(*id) == Some("body"))
            .unwrap_or(0)
    }

    fn has_script(&self) -> bool {
        self.in_tree()
            .into_iter()
            .any(|id| self.local(id) == Some("script"))
    }

    fn anchors(&self, fragment: &str) -> Vec<usize> {
        self.in_tree()
            .into_iter()
            .filter(|id| {
                self.attr(*id, "id") == Some(fragment)
                    || (self.local(*id) == Some("a") && self.attr(*id, "name") == Some(fragment))
            })
            .collect()
    }

    /// `id` itself or its nearest heading ancestor, when that is a heading.
    fn heading_at_or_above(&self, id: usize) -> Option<usize> {
        let mut cursor = Some(id);
        while let Some(node) = cursor {
            if self
                .local(node)
                .is_some_and(|local| matches!(kind(local), Kind::Heading(_)))
            {
                return Some(node);
            }
            cursor = self.nodes[node].parent;
        }
        None
    }

    fn is_within(&self, id: usize, ancestor: usize) -> bool {
        let mut cursor = Some(id);
        while let Some(node) = cursor {
            if node == ancestor {
                return true;
            }
            cursor = self.nodes[node].parent;
        }
        false
    }

    /// One line of the subtree's collapsed text; nested blocks are spaced.
    fn inline_text(&self, root: usize) -> String {
        let mut text = Collapsed::default();
        let mut stack = vec![root];
        while let Some(id) = stack.pop() {
            match &self.nodes[id].data {
                Data::Text(raw) => text.push(raw),
                Data::Element { name, .. } => {
                    let kind = kind(name.local.as_ref());
                    if kind == Kind::Skip {
                        continue;
                    }
                    if kind != Kind::Inline {
                        text.gap();
                    }
                    stack.extend(self.nodes[id].children.iter().rev());
                }
                Data::Document | Data::Other => {}
            }
        }
        text.take()
    }

    /// The subtree's text exactly as written; `<br>` is a line break.
    fn raw_text(&self, root: usize) -> String {
        let mut text = String::new();
        let mut stack = vec![root];
        while let Some(id) = stack.pop() {
            match &self.nodes[id].data {
                Data::Text(raw) => text.push_str(raw),
                Data::Element { name, .. } => match kind(name.local.as_ref()) {
                    Kind::Skip => {}
                    Kind::Break => text.push('\n'),
                    _ => stack.extend(self.nodes[id].children.iter().rev()),
                },
                Data::Document | Data::Other => {}
            }
        }
        text.replace("\r\n", "\n")
    }
}

/// An element's name as the tree builder asks for it.
#[derive(Debug)]
struct Name {
    ns: Namespace,
    local: LocalName,
}

impl ElemName for Name {
    fn ns(&self) -> &Namespace {
        &self.ns
    }
    fn local_name(&self) -> &LocalName {
        &self.local
    }
}

struct Sink {
    nodes: RefCell<Vec<Node>>,
}

impl Sink {
    fn push(&self, data: Data) -> usize {
        let mut nodes = self.nodes.borrow_mut();
        nodes.push(Node {
            parent: None,
            children: Vec::new(),
            data,
        });
        nodes.len() - 1
    }

    fn detach(&self, id: usize) {
        let mut nodes = self.nodes.borrow_mut();
        if let Some(parent) = nodes[id].parent.take() {
            nodes[parent].children.retain(|child| *child != id);
        }
    }

    /// Insert `child` under `parent` at `index` (the end when `None`),
    /// merging text into an adjacent text node as the DOM does.
    fn insert(&self, parent: usize, index: Option<usize>, child: NodeOrText<usize>) {
        match child {
            NodeOrText::AppendNode(id) => {
                self.detach(id);
                let mut nodes = self.nodes.borrow_mut();
                let children = &mut nodes[parent].children;
                let at = index.unwrap_or(children.len()).min(children.len());
                children.insert(at, id);
                nodes[id].parent = Some(parent);
            }
            NodeOrText::AppendText(text) => {
                let mut nodes = self.nodes.borrow_mut();
                let at = index.unwrap_or(nodes[parent].children.len());
                let previous = at
                    .checked_sub(1)
                    .and_then(|before| nodes[parent].children.get(before).copied());
                if let Some(previous) = previous
                    && let Data::Text(existing) = &mut nodes[previous].data
                {
                    existing.push_str(&text);
                    return;
                }
                drop(nodes);
                let id = self.push(Data::Text(text.to_string()));
                let mut nodes = self.nodes.borrow_mut();
                nodes[parent].children.insert(at, id);
                nodes[id].parent = Some(parent);
            }
        }
    }
}

impl TreeSink for Sink {
    type Handle = usize;
    type Output = Vec<Node>;
    type ElemName<'a> = Name;

    fn finish(self) -> Vec<Node> {
        self.nodes.into_inner()
    }

    fn parse_error(&self, _msg: Cow<'static, str>) {}

    fn get_document(&self) -> usize {
        0
    }

    fn elem_name<'a>(&'a self, target: &'a usize) -> Name {
        match &self.nodes.borrow()[*target].data {
            Data::Element { name, .. } => Name {
                ns: name.ns.clone(),
                local: name.local.clone(),
            },
            _ => Name {
                ns: Namespace::from(""),
                local: LocalName::from(""),
            },
        }
    }

    fn create_element(&self, name: QualName, attrs: Vec<Attribute>, flags: ElementFlags) -> usize {
        let contents = flags.template.then(|| self.push(Data::Document));
        self.push(Data::Element {
            name,
            attrs,
            contents,
        })
    }

    fn create_comment(&self, _text: StrTendril) -> usize {
        self.push(Data::Other)
    }

    fn create_pi(&self, _target: StrTendril, _data: StrTendril) -> usize {
        self.push(Data::Other)
    }

    fn append(&self, parent: &usize, child: NodeOrText<usize>) {
        self.insert(*parent, None, child);
    }

    fn append_based_on_parent_node(
        &self,
        element: &usize,
        prev_element: &usize,
        child: NodeOrText<usize>,
    ) {
        if self.nodes.borrow()[*element].parent.is_some() {
            self.append_before_sibling(element, child);
        } else {
            self.append(prev_element, child);
        }
    }

    fn append_doctype_to_document(&self, _: StrTendril, _: StrTendril, _: StrTendril) {}

    fn get_template_contents(&self, target: &usize) -> usize {
        match &self.nodes.borrow()[*target].data {
            Data::Element {
                contents: Some(contents),
                ..
            } => *contents,
            _ => *target,
        }
    }

    fn same_node(&self, x: &usize, y: &usize) -> bool {
        x == y
    }

    fn set_quirks_mode(&self, _mode: QuirksMode) {}

    fn append_before_sibling(&self, sibling: &usize, child: NodeOrText<usize>) {
        let Some(parent) = self.nodes.borrow()[*sibling].parent else {
            return;
        };
        // A moved node may sit before the sibling: locate after detaching.
        if let NodeOrText::AppendNode(id) = &child {
            self.detach(*id);
        }
        let index = self.nodes.borrow()[parent]
            .children
            .iter()
            .position(|child| child == sibling);
        self.insert(parent, index, child);
    }

    fn add_attrs_if_missing(&self, target: &usize, attrs: Vec<Attribute>) {
        if let Data::Element {
            attrs: existing, ..
        } = &mut self.nodes.borrow_mut()[*target].data
        {
            for attr in attrs {
                if !existing.iter().any(|present| present.name == attr.name) {
                    existing.push(attr);
                }
            }
        }
    }

    fn remove_from_parent(&self, target: &usize) {
        self.detach(*target);
    }

    fn reparent_children(&self, node: &usize, new_parent: &usize) {
        let mut nodes = self.nodes.borrow_mut();
        let children = std::mem::take(&mut nodes[*node].children);
        for child in &children {
            nodes[*child].parent = Some(*new_parent);
        }
        nodes[*new_parent].children.extend(children);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const GUIDE: &str = r#"<!doctype html><html><head><title>Guide</title>
<style>body{color:red}</style><script>var hidden = "script text";</script></head>
<body>
<nav><a href="/">Home</a> <a href="/docs">Docs</a></nav>
<h1 id="top">Key   rotation
guide</h1>
<p>Rotate keys <b>every</b> 90&nbsp;days.<br>Then restart.</p>
<h2 id="rotation">Rotation</h2>
<p>Update the configuration.</p>
<ul><li>Stop the <em>service</em></li><li>Swap the key<ul><li>Nested step</li></ul></li></ul>
<h3 id="verify">Verify</h3>
<table><tr><th>Step</th><th>Command</th></tr><tr><td>Check</td><td><code>svc status</code></td></tr></table>
<pre><code>fn main() {
    rotate();
}
</code></pre>
<h2 id="faq">FAQ</h2>
<p>Nothing else.</p>
<template><p>template text</p></template><noscript>enable js</noscript>
<svg><text>svg text</text></svg>
<footer>Copyright</footer>
</body></html>"#;

    fn html(source: &str, fragment: Option<&str>) -> Result<String, Failure> {
        super::html(source, fragment, &|| false)
    }

    #[test]
    fn a_page_renders_blocks_as_lines_in_document_order() {
        let text = html(GUIDE, None).unwrap();
        assert_eq!(
            text,
            "# Key rotation guide\n\
             Rotate keys every 90\u{a0}days.\n\
             Then restart.\n\
             ## Rotation\n\
             Update the configuration.\n\
             - Stop the service\n\
             - Swap the key\n  \
             - Nested step\n\
             ### Verify\n\
             Step | Command\n\
             Check | svc status\n\
             ```\n\
             fn main() {\n    rotate();\n}\n\
             ```\n\
             ## FAQ\n\
             Nothing else.\n"
        );
        for dropped in [
            "script text",
            "color:red",
            "Home",
            "template text",
            "enable js",
            "svg text",
            "Copyright",
            "Guide\n",
        ] {
            assert!(!text.contains(dropped), "{dropped} leaked: {text}");
        }
    }

    #[test]
    fn a_heading_fragment_selects_through_the_next_same_or_higher_heading() {
        assert_eq!(
            html(GUIDE, Some("rotation")).unwrap(),
            "## Rotation\nUpdate the configuration.\n- Stop the service\n- Swap the key\n  - Nested step\n\
             ### Verify\nStep | Command\nCheck | svc status\n```\nfn main() {\n    rotate();\n}\n```\n"
        );
        assert_eq!(
            html(GUIDE, Some("verify")).unwrap(),
            "### Verify\nStep | Command\nCheck | svc status\n```\nfn main() {\n    rotate();\n}\n```\n"
        );
        assert_eq!(html(GUIDE, Some("faq")).unwrap(), "## FAQ\nNothing else.\n");
        let top = html(GUIDE, Some("top")).unwrap();
        assert!(top.starts_with("# Key rotation guide\n") && top.ends_with("Nothing else.\n"));
    }

    #[test]
    fn an_anchor_inside_or_before_a_heading_selects_that_heading_section() {
        let page = r#"<h2><a name="inner"></a>Inner</h2><p>a</p><a id="before"></a><h2>Before</h2><p>b</p><h2>Next</h2><p>c</p>"#;
        assert_eq!(html(page, Some("inner")).unwrap(), "## Inner\na\n");
        assert_eq!(html(page, Some("before")).unwrap(), "## Before\nb\n");
    }

    #[test]
    fn a_non_heading_anchor_selects_its_own_element() {
        let page = r#"<p>intro</p><section id="s"><p>one</p><ul><li>two</li></ul></section><p>after</p>
            <p>Run <code id="cmd">svc restart</code> now.</p>"#;
        assert_eq!(html(page, Some("s")).unwrap(), "one\n- two\n");
        assert_eq!(html(page, Some("cmd")).unwrap(), "Run svc restart now.\n");
    }

    #[test]
    fn a_missing_or_duplicate_anchor_fails_explicitly() {
        assert_eq!(html(GUIDE, Some("absent")), Err(Failure::MissingAnchor));
        let page = r#"<h2 id="x">One</h2><p>a</p><a name="x"></a><h2>Two</h2>"#;
        assert_eq!(html(page, Some("x")), Err(Failure::AmbiguousAnchor(2)));
        assert_eq!(
            html(r#"<p>text</p><nav id="menu">links</nav>"#, Some("menu")),
            Err(Failure::EmptySection)
        );
    }

    #[test]
    fn an_empty_page_says_whether_scripts_build_it() {
        assert_eq!(
            html(
                r#"<html><body><div id="app"></div><script src="app.js"></script></body></html>"#,
                None
            ),
            Err(Failure::Empty { scripted: true })
        );
        assert_eq!(
            html("<p>   </p>", None),
            Err(Failure::Empty { scripted: false })
        );
    }

    #[test]
    fn misnested_markup_nests_as_a_browser_shows_it() {
        // Unclosed paragraphs and list items close implicitly; a stray end
        // tag is ignored; the table cell outside a row gets one.
        let page = "<p>one<p>two<ul><li>a<li>b</ul></span><table><td>cell</td></table>";
        assert_eq!(html(page, None).unwrap(), "one\ntwo\n- a\n- b\ncell\n");
    }

    #[test]
    fn deep_nesting_does_not_recurse() {
        // A million nested elements built directly: the parser's own cost
        // is bounded by `stop`, the walk and lookups must not recurse.
        let depth = 1_000_000;
        let mut nodes = vec![Node {
            parent: None,
            children: vec![1],
            data: Data::Document,
        }];
        for id in 1..=depth {
            let name = if id == 1 { "body" } else { "div" };
            nodes.push(Node {
                parent: Some(id - 1),
                children: vec![id + 1],
                data: Data::Element {
                    name: QualName::new(None, Namespace::from(""), LocalName::from(name)),
                    attrs: Vec::new(),
                    contents: None,
                },
            });
        }
        nodes.push(Node {
            parent: Some(depth),
            children: Vec::new(),
            data: Data::Text("deep".into()),
        });
        let dom = Dom { nodes };
        let walked = Walker::new(&dom, Some(depth)).walk(dom.body());
        assert_eq!(join(&walked.lines), "deep\n");
        assert_eq!(walked.span, Some((0, 1)));
        assert_eq!(dom.heading_at_or_above(depth + 1), None);
        assert_eq!(dom.inline_text(1), "deep");
    }

    #[test]
    fn a_stop_ends_the_parse() {
        let calls = std::cell::Cell::new(0);
        let page = "<p>text</p>".repeat(4 * 1024);
        let stop = || {
            calls.set(calls.get() + 1);
            calls.get() > 2
        };
        assert_eq!(super::html(&page, None, &stop), Err(Failure::Stopped));
        assert_eq!(calls.get(), 3, "checked once per chunk until it stops");
        assert!(super::html(&page, None, &|| false).is_ok());
    }

    #[test]
    fn a_chunk_boundary_inside_a_character_or_tag_parses_alike() {
        let filler = "é".repeat(PARSE_CHUNK_BYTES / 2 - 1);
        let page = format!("<p>{filler}x</p><h2 id=\"a\">Ü</h2><p>end</p>");
        assert!(page.len() > PARSE_CHUNK_BYTES);
        assert_eq!(
            html(&page, Some("a")).unwrap(),
            "## Ü\nend\n",
            "a split multibyte character or tag still parses"
        );
        assert!(
            html(&page, None)
                .unwrap()
                .starts_with(&format!("{filler}x\n"))
        );
    }

    #[test]
    fn plain_text_normalizes_line_endings_and_ends_with_a_newline() {
        assert_eq!(plain("a\r\nb\rc").unwrap(), "a\nb\nc\n");
        assert_eq!(plain("a\n").unwrap(), "a\n");
        assert_eq!(plain(" \n\t"), Err(Failure::Empty { scripted: false }));
    }
}
