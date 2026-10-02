# Run from the repo root: python3 tools/csp.py -- regenerates the CSP script hash in netlify.toml after editing the inline <script> in index.html (only the pre-paint flag script is inline; everything else is a same-origin file)
import re,hashlib,base64
s=open('index.html',encoding='utf-8').read()
inl=re.findall(r'<script>(.*?)</script>',s,re.S)
if len(inl)!=1: print('WARNING: expected exactly 1 inline <script>, found',len(inl),'- review before deploying')
hs=' '.join("'sha256-"+base64.b64encode(hashlib.sha256(m.encode()).digest()).decode()+"'" for m in re.findall(r'<script>(.*?)</script>',s,re.S))
t=open('netlify.toml').read()
t=re.sub(r"script-src 'self'[^;]*;",f"script-src 'self' {hs};",t)
open('netlify.toml','w').write(t);print(hs)
