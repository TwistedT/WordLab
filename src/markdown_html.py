"""Render the Markdown constructs used by Wordlab's two source documents.

No raw HTML or external assets are accepted. The generated story stays offline.
"""
import html
import re


def inline(text):
    """Escape prose before adding inline code, emphasis, links, and math text."""
    tokens = []

    def hold(markup):
        tokens.append(markup)
        return f'\x00{len(tokens) - 1}\x00'

    text = re.sub(r'`([^`]+)`', lambda m: hold(f'<code>{html.escape(m[1])}</code>'), text)
    text = html.escape(text)
    text = re.sub(r'\[([^\]]+)\]\(([^\s)]+)\)',
                  lambda m: hold(f'<a href="{m[2]}">{m[1]}</a>')
                  if not re.match(r'(?:javascript|data):', html.unescape(m[2]), re.I) else m[1], text)
    text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
    text = re.sub(r'(?<!\*)\*([^*]+)\*(?!\*)', r'<em>\1</em>', text)
    text = re.sub(r'\$([^$]+)\$', r'<span class="math">\1</span>', text)
    return re.sub(r'\x00(\d+)\x00', lambda m: tokens[int(m[1])], text)


def render_markdown(text, heading_offset=2):
    """Render headings beneath the story section's h2, capped at h6."""
    lines = text.splitlines()
    output = []
    paragraph = []
    lists = []
    index = 0

    def flush_paragraph():
        if paragraph:
            output.append('<p>' + inline(' '.join(paragraph)) + '</p>')
            paragraph.clear()

    def close_list():
        output.append(f'</li></{lists.pop()[1]}>')

    def close_lists():
        while lists:
            close_list()

    def cells(line):
        return [cell.strip() for cell in line.strip().strip('|').split('|')]

    while index < len(lines):
        line = lines[index]
        stripped = line.strip()
        index += 1
        if not stripped:
            flush_paragraph()
            continue
        # A fence nested in a list is indented by the source document.
        fence = re.match(r'^\s*```([\w-]*)\s*$', line)
        if fence:
            flush_paragraph()
            if not line.startswith(' '):
                close_lists()
            code = []
            while index < len(lines) and not re.match(r'^\s*```\s*$', lines[index]):
                code.append(lines[index])
                index += 1
            index += 1
            language = f' class="language-{html.escape(fence[1])}"' if fence[1] else ''
            output.append(f'<pre tabindex="0"><code{language}>' + html.escape('\n'.join(code)) + '</code></pre>')
            continue
        heading = re.match(r'^(#{1,6})\s+(.+)$', line)
        if heading:
            flush_paragraph()
            close_lists()
            level = min(6, len(heading[1]) + heading_offset)
            output.append(f'<h{level}>' + inline(heading[2]) + f'</h{level}>')
            continue
        if re.fullmatch(r'(?:-{3,}|\*{3,}|_{3,})', stripped):
            flush_paragraph()
            close_lists()
            output.append('<hr>')
            continue
        if stripped.startswith('|') and index < len(lines) and re.fullmatch(r'[|\s:-]+', lines[index]):
            flush_paragraph()
            close_lists()
            output.append('<div class="story-table" role="region" aria-label="Document table" tabindex="0"><table><thead><tr>')
            output.extend(f'<th scope="col">{inline(cell)}</th>' for cell in cells(line))
            output.append('</tr></thead><tbody>')
            index += 1
            while index < len(lines) and lines[index].strip().startswith('|'):
                output.append('<tr>' + ''.join(f'<td>{inline(cell)}</td>' for cell in cells(lines[index])) + '</tr>')
                index += 1
            output.append('</tbody></table></div>')
            continue
        if stripped.startswith('>'):
            flush_paragraph()
            close_lists()
            quote = [re.sub(r'^\s*>\s?', '', line)]
            while index < len(lines) and lines[index].strip().startswith('>'):
                quote.append(re.sub(r'^\s*>\s?', '', lines[index]))
                index += 1
            output.append('<blockquote>' + render_markdown('\n'.join(quote), heading_offset) + '</blockquote>')
            continue
        item = re.match(r'^(\s*)([-+*]|\d+\.)\s+(.+)$', line)
        if item:
            flush_paragraph()
            indent = len(item[1])
            tag = 'ol' if item[2][0].isdigit() else 'ul'
            while lists and lists[-1][0] > indent:
                close_list()
            if lists and lists[-1][0] == indent and lists[-1][1] != tag:
                close_list()
            if not lists or indent > lists[-1][0]:
                output.append(f'<{tag}><li>')
                lists.append((indent, tag))
            else:
                output.append('</li><li>')
            output.append(inline(item[3]))
            continue
        if lists and not line.startswith(' '):
            close_lists()
        paragraph.append(stripped)
    flush_paragraph()
    close_lists()
    return '\n'.join(output)
