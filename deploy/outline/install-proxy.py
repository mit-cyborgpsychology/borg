"""Run from the self-hosted Outline compose directory after copying borg-editor.conf."""
from pathlib import Path
import datetime
import shutil

p = Path('docker-compose.yml')
s = p.read_text()
if 'borg-editor-proxy:' in s:
    print('Outline editor proxy already configured')
    raise SystemExit()
old = '    ports:\n      - "3000:3000"'
if s.count(old) != 1 or s.count('services:\n') != 1:
    raise RuntimeError('Unexpected compose layout; no changes made')
updated = s.replace(old, '    expose:\n      - "3000"', 1)
proxy = '''  borg-editor-proxy:
    image: nginx:1.28-alpine
    restart: unless-stopped
    depends_on:
      - outline
    ports:
      - "3000:3000"
    volumes:
      - ./borg-editor.conf:/etc/nginx/conf.d/default.conf:ro
'''
updated = updated.replace('services:\n', 'services:\n' + proxy, 1)
shutil.copy2(p, p.with_name('docker-compose.yml.before-borg-editor-' + datetime.datetime.now().strftime('%Y%m%d-%H%M%S')))
p.write_text(updated)
print('Configured Outline proxy for authenticated editing from Borg')
