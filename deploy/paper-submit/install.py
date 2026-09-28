"""Integrate web submissions with the existing ingestion application (run in its root)."""
from pathlib import Path
import datetime
import shutil
import subprocess
from reply_before_indexing import reorder, update_server

root=Path.cwd()
server=root/'server.mjs'
s=server.read_text()
if './paper-submit/handler.mjs' in s:
    update_server(server)
    print('Web paper submission integration is already installed')
    raise SystemExit(0)

def replace_once(text, old, new):
    if text.count(old)!=1:
        raise RuntimeError('Unexpected ingestion source; no files changed')
    return text.replace(old,new,1)

s="import { createPaperSubmissionHandler } from './paper-submit/handler.mjs';\nimport { fetchPublic } from './paper-submit/public-fetch.mjs';\n"+s
s=replace_once(s,'import { addReferenceEmbedding }','import { addReferenceEmbedding, ensureReferenceEmbedding }')
a=s.index('async function processUrl(url, ctx) {');b=s.index('\n// "@borg',a)
process=s[a:b]
process=replace_once(process,'async function processUrl(url, ctx) {','''const pendingPaperUrls = new Map();
async function processUrl(url, ctx) {
  if (pendingPaperUrls.has(url)) return pendingPaperUrls.get(url);
  const operation = processUrlOnce(url, ctx).finally(() => pendingPaperUrls.delete(url));
  pendingPaperUrls.set(url, operation);
  return operation;
}
async function processUrlOnce(url, ctx) {''')
process=replace_once(process,'console.error(`  Grist lookup failed for ${url}:`, err.message);','console.error(`  Grist lookup failed for ${url}:`, err.message);\n    if (ctx.source === "web") throw err;')
a1=process.index('  if (existing) {');b1=process.index('\n\n  let fetched;',a1)
old=process[a1:b1]
reply=next(line for line in old.splitlines() if 'await replyInChat' in line)
process=process[:a1]+'''  if (existing) {
    if (ctx.source === "web") {
      try { await ensureReferenceEmbedding({url, title: existing.fields.Title || "", summary: existing.fields.Summary || ""}); }
      catch { return {status: "already_saved", title: existing.fields.Title, message: "This paper is already saved, but map indexing failed. Submit it again to retry."}; }
    } else {
'''+reply+'''
    }
    return {status: "already_saved", title: existing.fields.Title, message: "This paper is already in References."};
  }'''+process[b1:]
process=replace_once(process,'fetched = await fetchLink(url);','fetched = await fetchLink(url, ctx.source === "web" ? {request: fetchPublic} : undefined);')
process=replace_once(process,'markProcessed(url, "fetch_failed");\n    return;', 'markProcessed(url, "fetch_failed");\n    return {status: "failed", message: "Could not fetch this link. Try a direct paper or PDF URL."};')
process=replace_once(process,'markProcessed(url, "not_a_paper");\n    return;', 'markProcessed(url, "not_a_paper");\n    return {status: "not_paper", message: "This link does not appear to be a research paper. Nothing was saved."};')
process=replace_once(process,'markProcessed(url, "grist_failed");','markProcessed(url, "grist_failed");\n    if (ctx.source === "web") return {status: "failed", message: "Could not save to References. Please try again."};')
process=replace_once(process,'  try {\n    await addReferenceEmbedding', '  let embedded = true;\n  try {\n    await addReferenceEmbedding')
process=replace_once(process,'console.error(`  Chroma embedding failed:`, err.message);','console.error(`  Chroma embedding failed:`, err.message);\n    embedded = false;')
reply=next(line for line in process.splitlines() if 'await replyInChat' in line and '📒' in line)
process=replace_once(process,reply,reply.replace('await replyInChat','if (ctx.source !== "web") await replyInChat')+'\n  return {status: "saved", title, message: embedded ? "Paper saved. Its map point is being prepared." : "Paper saved, but map indexing failed. Submit this link again to retry."};')
s=s[:a]+process+s[b:]
s=replace_once(s,'const server = http.createServer(async (req, res) => {','''const paperSubmission = createPaperSubmissionHandler(processUrl);
const server = http.createServer(async (req, res) => {
  if (req.url === "/research-submit") {
    await paperSubmission(req, res);
    return;
  }''')
f=(root/'fetch-link.mjs').read_text()
f=replace_once(f,'async function pmcIdToDoi(pmcId)', 'async function pmcIdToDoi(pmcId, request)')
f=replace_once(f,'export async function fetchLink(url)', 'export async function fetchLink(url, {request = fetch} = {})')
f=replace_once(f,'await pmcIdToDoi(pmcId)', 'await pmcIdToDoi(pmcId, request)')
f=replace_once(f,'await fetchViaOpenAlex(doi, url)', 'await fetchViaOpenAlex(doi, url, request)')
f=replace_once(f,'return fetchDirect(arxivPdfUrl)', 'return fetchDirect(arxivPdfUrl, request)')
f=replace_once(f,'return fetchDirect(url)', 'return fetchDirect(url, request)')
f=replace_once(f,'async function fetchViaOpenAlex(doi, originalUrl)', 'async function fetchViaOpenAlex(doi, originalUrl, request)')
f=replace_once(f,'async function fetchDirect(url)', 'async function fetchDirect(url, request)')
f=f.replace('await fetch(', 'await request(')
c=(root/'chroma.mjs').read_text()+'''
// Web retries repair a missing embedding without re-embedding an existing paper.
export async function ensureReferenceEmbedding(paper) {
  const collection = await getCollection();
  const found = await collection.get({ids:[paper.url],include:[]});
  if (!found.ids.length) await addReferenceEmbedding(paper);
}
'''
s=reorder(s)
changes={'server.mjs':s,'fetch-link.mjs':f,'chroma.mjs':c}
node=shutil.which('node') or str(Path.home()/'.local/share/mise/shims/node')
for value in changes.values():
    subprocess.run([node,'--check','--input-type=module'],input=value,text=True,check=True)
stamp=datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
for name,value in changes.items():
    path=root/name
    shutil.copy2(path,root/(name+'.before-web-submit-'+stamp))
    path.write_text(value)
print('Installed authenticated web paper submission route using the existing ingestion pipeline')
