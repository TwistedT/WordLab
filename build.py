"""Regenerate the standalone apps. Requires only Python's standard library."""
from pathlib import Path
import csv
import io
import json
from html import escape
from src.markdown_html import render_markdown

ROOT = Path(__file__).resolve().parent
TITLES = {'index': 'Wordlab | Medical vocabulary, made memorable', 'forge': 'Morpheme Forge | Wordlab', 'surgeon': 'Word Surgeon | Wordlab', 'trail': 'Decryption Trail | Wordlab'}

def build():
    css = (ROOT / 'src/styles.css').read_text(encoding='utf-8')
    script = '\n'.join((ROOT / f'src/{name}.js').read_text(encoding='utf-8') for name in ['core', 'app'])
    datasets = {f'medical_terminology_set{n:02d}.csv': (ROOT / f'medical_terminology_set{n:02d}.csv').read_text(encoding='utf-8-sig') for n in range(1, 13)}
    # Sets 4 and 5 predate suffix_2. Normalize headers when combining the files.
    columns = ['Term', 'Phonetics', 'prefix', 'root_1', 'c_vowel_1', 'root_2', 'c_vowel_2', 'root_3', 'c_vowel_3', 'suffix_1', 'suffix_2', 'Basic Definition']
    combined = io.StringIO(newline='')
    writer = csv.DictWriter(combined, fieldnames=columns, lineterminator='\n')
    writer.writeheader()
    for text in datasets.values():
        writer.writerows(csv.DictReader(io.StringIO(text)))
    (ROOT / 'words.csv').write_text(combined.getvalue(), encoding='utf-8', newline='\n')
    data = json.dumps(combined.getvalue(), ensure_ascii=True).replace('<', '\\u003c')
    set_data = json.dumps(datasets, ensure_ascii=True).replace('<', '\\u003c')
    for game, title in TITLES.items():
        html = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#0f172a"><meta name="description" content="Three offline games to learn medical terminology through spelling, word parts, and definitions.">
<title>{title}</title><style>{css}</style></head>
<body data-game="{game}"><div id="app"></div><noscript>Enable JavaScript to play these vocabulary games.</noscript>
<script id="embedded-csv" type="application/json">{data}</script><script id="embedded-sets" type="application/json">{set_data}</script><script>{script}</script></body></html>'''
        (ROOT / f'{game}.html').write_text(html, encoding='utf-8', newline='\n')
        print(f'Built {game}.html')
    story = (ROOT / 'src/story.html').read_text(encoding='utf-8')
    replacements = {
        'styles': css,
        'report': render_markdown((ROOT / 'beyond-the-flashcard-plateau.md').read_text(encoding='utf-8-sig')),
        'design': render_markdown((ROOT / 'vocabulary_games_specification.md').read_text(encoding='utf-8-sig')),
        'license': '<h3>MIT License</h3>\n' + '\n'.join(f'<p>{escape(paragraph)}</p>' for paragraph in (ROOT / 'LICENSE').read_text(encoding='utf-8').strip().split('\n\n')[1:]),
    }
    for key, value in replacements.items():
        story = story.replace('{{' + key + '}}', value)
    (ROOT / 'story.html').write_text(story, encoding='utf-8', newline='\n')
    print('Built story.html')

if __name__ == '__main__':
    build()
