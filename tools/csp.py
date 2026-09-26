# Run from the repo root: python tools/csp.py -- regenerates CSP script hashes in netlify.toml after editing index.html
import re,hashlib,base64
s=open('index.html',encoding='utf-8').read()
hs=' '.join("'sha256-"+base64.b64encode(hashlib.sha256(m.encode()).digest()).decode()+"'" for m in re.findall(r'<script>(.*?)</script>',s,re.S))
t=open('netlify.toml').read()
t=re.sub(r"script-src 'self'[^;]*;",f"script-src 'self' {hs};",t)
open('netlify.toml','w').write(t);print(hs)
