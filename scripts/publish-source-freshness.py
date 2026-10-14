"""Maintain one bot-owned freshness issue using GitHub's runner token."""
import json
from pathlib import Path
import subprocess
import sys

report = Path(sys.argv[1])
body = report.read_text()
marker = '<!-- mcp-wales-source-freshness -->'
title = 'Review public-source freshness'
issues = json.loads(subprocess.check_output([
    'gh', 'issue', 'list', '--state', 'open', '--search', f'{title} in:title',
    '--limit', '100', '--json', 'number,title,body,author']))
owned = [i for i in issues if i['title'] == title and marker in i['body']
         and i['author']['login'] in ['github-actions[bot]', 'app/github-actions']]
if len(owned) > 1:
    raise SystemExit('Multiple freshness issues found; consolidate manually')
issue = str(owned[0]['number']) if owned else None
actionable = '— update available**' in body or '— check failed**' in body
if actionable:
    if issue:
        if owned[0]['body'] != body:
            subprocess.run(['gh', 'issue', 'edit', issue, '--body-file', str(report)], check=True)
    else:
        subprocess.run(['gh', 'issue', 'create', '--title', title, '--body-file', str(report)], check=True)
elif issue:
    subprocess.run(['gh', 'issue', 'close', issue, '--reason', 'completed'], check=True)
