#!/usr/bin/env python3
# build.py — bundles src providers into single-file Nuvio providers (no npm needed).
# - resolves local relative imports (DFS, dedup)
# - strips import/export syntax, appends CommonJS trailer
# - injects SITE config for the vofamille variants
# Usage: python3 build.py            (builds everything)
import re, os, json, datetime

ROOT = os.path.dirname(os.path.abspath(__file__))

IMPORT_RE = re.compile(r'import\s+\{[^}]*\}\s+from\s+["\']([^"\']+)["\']\s*;', re.S)
EXPORT_SET_RE = re.compile(r'export\s*\{[^}]*\}\s*;?', re.S)
EXPORT_DECL_RE = re.compile(r'export\s+(async\s+)?(function|var|const|let)\s+')

def resolve(path, emitted, parts):
    ap = os.path.normpath(path)
    if ap in emitted:
        return
    src = open(ap, encoding='utf-8').read()
    imports = IMPORT_RE.findall(src)
    emitted.add(ap)
    for imp in imports:
        if imp.startswith('.'):
            resolve(os.path.join(os.path.dirname(ap), imp), emitted, parts)
    body = IMPORT_RE.sub('', src)
    body = EXPORT_DECL_RE.sub(lambda m: (m.group(1) or '') + m.group(2) + ' ', body)
    body = EXPORT_SET_RE.sub('', body)
    parts.append('// ---- ' + os.path.relpath(ap, os.path.join(ROOT, 'src')) + ' ----\n' + body.strip() + '\n')

def bundle(entry, site_js=None):
    emitted, parts = set(), []
    resolve(entry, emitted, parts)
    code = '\n'.join(parts)
    if site_js is not None:
        marker = '/*__SITE_CONFIG__*/'
        assert marker in code, 'SITE_CONFIG marker missing in ' + entry
        code = code.replace(marker, site_js)
    code += '\n// ---- nuvio export ----\n'
    code += 'var __exp = { __esModule: true, getStreams: getStreams };\n'
    code += 'if (typeof module !== "undefined" && module.exports) { module.exports = __exp; }\n'
    code += 'if (typeof exports !== "undefined") { exports.getStreams = getStreams; exports.__esModule = true; }\n'
    return code

def stamp(name):
    return '/* %s - built %sZ — GENERATED from src/, edit sources then `python3 build.py` */\n' % (
        name, datetime.datetime.utcnow().isoformat(timespec='seconds'))

BUILDS = [
    ('cinestream', 'src/cinestream/index.js', 'providers/cinestream.js', None),
    ('voiranime',  'src/voiranime/index.js',  'providers/voiranime.js',  None),
    ('vostfree',   'src/vostfree/index.js',   'providers/vostfree.js',   None),
    ('purstream',  'src/purstream/index.js',  'providers/purstream.js',  None),
    ('jour1film',  'src/jour1film/index.js',  'providers/jour1film.js',  None),
    ('fstream',    'src/fstream/index.js',    'providers/fstream.js',    None),
]

# vofamille variants: (key, name, origin, tag, default folder, output)
VTF = [
    ('yablom', 'Yablom', 'https://yablom.com',      'yablom', 'euvcw7',      'providers/yablom.js'),
    ('kordoz', 'Kordoz', 'https://www.kordoz.com',  'kordoz', 'x0vrxk57ein', 'providers/kordoz.js'),
    ('ilmiv',  'Ilmiv',  'https://ilmiv.com',       'ilmiv',  '4sfoizmv',    'providers/ilmiv.js'),
    ('kidraz', 'Kidraz', 'https://www.kidraz.com',  'kidraz', 'saby1jy',     'providers/kidraz.js'),
]

def main():
    os.makedirs(os.path.join(ROOT, 'providers'), exist_ok=True)
    for name, entry, out, site in BUILDS:
        code = stamp(name) + bundle(os.path.join(ROOT, entry))
        with open(os.path.join(ROOT, out), 'w', encoding='utf-8') as f:
            f.write(code)
        print('built %-12s -> %s (%d o)' % (name, out, len(code)))
    for key, name, origin, tag, folder, out in VTF:
        site_js = 'var SITE = %s;' % json.dumps({
            'id': key, 'name': name, 'origin': origin, 'tag': tag, 'folder': folder})
        code = stamp('vofamille/' + key) + bundle(os.path.join(ROOT, 'src/vofamille/index.js'), site_js)
        with open(os.path.join(ROOT, out), 'w', encoding='utf-8') as f:
            f.write(code)
        print('built %-12s -> %s (%d o)' % (key, out, len(code)))

if __name__ == '__main__':
    main()
