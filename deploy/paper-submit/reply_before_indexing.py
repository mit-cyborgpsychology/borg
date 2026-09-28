"""Send the WhatsApp summary before embedding and background map work."""
from pathlib import Path
import datetime
import shutil
import subprocess

MARKER = '  // Send the summary before embedding and background map work.'


def reorder(source):
    if MARKER in source:
        return source
    start = source.index('  // Reply regardless of whether the Grist save succeeded')
    reply_start = source.index('  if (ctx.source !== "web") await replyInChat', start)
    reply_end = source.index('\n', reply_start)
    reply = source[reply_start:reply_end]
    if '📒' not in reply or source.count('  let embedded = true;') != 1:
        raise RuntimeError('Unexpected ingestion source; no files changed')
    source = source[:start] + source[reply_end + 1:]
    return source.replace('  let embedded = true;', MARKER + '\n'
        '  // replyInChat handles send failures so indexing still proceeds.\n'
        + reply + '\n\n  let embedded = true;', 1)


def update_server(server):
    source = server.read_text()
    updated = reorder(source)
    if updated == source:
        print('Reply-before-indexing is already installed')
        return
    node = shutil.which('node') or str(Path.home() / '.local/share/mise/shims/node')
    subprocess.run([node, '--check', '--input-type=module'], input=updated, text=True, check=True)
    stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f')
    shutil.copy2(server, server.with_name(server.name + '.before-reply-order-' + stamp))
    server.write_text(updated)
    print('WhatsApp summary now precedes embedding and map work')


if __name__ == '__main__':
    update_server(Path.cwd() / 'server.mjs')
