"""Inspect pinned public wheel artifacts and advisory data without installing packages."""
import argparse
import concurrent.futures
import email
import hashlib
import json
import re
import ssl
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / 'infra/lightweight/artifacts'
RESOLUTION = ARTIFACTS / 'phase4-langgraph-resolution.json'
CACHE = ARTIFACTS / 'phase4-wheel-cache'
REPORT = ARTIFACTS / 'phase4-wheel-license-review.json'
ALLOWED_HOSTS = {'files.pythonhosted.org', 'pypi.org', 'api.osv.dev', 'api.github.com'}


class RegistryRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        check_url(newurl, ALLOWED_HOSTS)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def check_url(url, hosts):
    u = urllib.parse.urlsplit(url)
    if u.scheme != 'https' or u.hostname not in hosts or u.username or u.password or u.port not in (None, 443) or u.fragment:
        raise ValueError('Unapproved registry URL')
    return u


OPENER = urllib.request.build_opener(urllib.request.HTTPSHandler(context=ssl.create_default_context()), RegistryRedirect())


def request(url, data=None, max_bytes=64 * 1024 * 1024):
    check_url(url, ALLOWED_HOSTS)
    req = urllib.request.Request(url, data=data, headers={'User-Agent':'PandaByte-dependency-review/1','Content-Type':'application/json'} if data else {'User-Agent':'PandaByte-dependency-review/1'})
    with OPENER.open(req, timeout=45) as response:
        value = response.read(max_bytes + 1)
        if len(value) > max_bytes: raise ValueError('Registry response too large')
        return value


def inspect_wheel(path, expected, name, version):
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != expected: raise ValueError('Wheel hash mismatch')
    with zipfile.ZipFile(path) as archive:
        entries = archive.infolist()
        if any(x.file_size > 20_000_000 for x in entries): raise ValueError('Oversized wheel entry')
        metadata = [x for x in entries if re.fullmatch(r'[^/]+\.dist-info/METADATA', x.filename)]
        if len(metadata) != 1: raise ValueError('Missing or ambiguous metadata')
        message = email.message_from_bytes(archive.read(metadata[0]))
        normalize = lambda v: re.sub(r'[-_.]+', '-', v).lower()
        if normalize(message.get('Name','')) != normalize(name) or message.get('Version') != version: raise ValueError('Wheel metadata mismatch')
        notices = []
        for info in entries:
            if info.is_dir(): continue
            basename = info.filename.rsplit('/',1)[-1]
            if re.search(r'^(?:licen[cs]e|notice|copying|copyright|authors)(?:[._-]|$)',basename,re.I) or re.search(r'\.dist-info/licenses?/',info.filename,re.I):
                content = archive.read(info)
                notices.append({'path':info.filename,'bytes':len(content),'sha256':hashlib.sha256(content).hexdigest(),'hints':sorted(set(re.findall(r'\b(?:MPL[- ]?2(?:\.0)?|Apache[- ]?2(?:\.0)?|MIT|BSD[- ]?[23](?:-Clause)?|ISC|Zlib)\b',content.decode('utf-8','replace'),re.I)))})
        sboms=[]
        for info in entries:
            if not info.is_dir() and '.dist-info/sboms/' in info.filename and info.filename.endswith('.json'):
                raw_sbom=archive.read(info); bom=json.loads(raw_sbom)
                sboms.append({'path':info.filename,'sha256':hashlib.sha256(raw_sbom).hexdigest(),
                              'components':[{'name':c.get('name'),'version':c.get('version'),'scope':c.get('scope'),'purl':c.get('purl'),'licenses':c.get('licenses',[])} for c in bom.get('components',[])]})
        return {'name':name,'version':version,'wheel':path.name,'sha256':expected,'sizeBytes':len(raw),
                'licenseExpression':message.get('License-Expression'),'licenseMetadata':message.get('License'),
                'classifiers':message.get_all('Classifier',[]),'declaredLicenseFiles':message.get_all('License-File',[]),'noticeFiles':notices,'embeddedSboms':sboms}


def fetch_item(item):
    metadata = item['metadata']; name=metadata['name']; version=metadata['version']; info=item['download_info']
    url=info['url']; parsed=check_url(url, {'files.pythonhosted.org'})
    filename=parsed.path.rsplit('/',1)[-1]
    if not filename.endswith('.whl') or not re.fullmatch(r'[A-Za-z0-9_.+-]+\.whl',filename): raise ValueError('Invalid wheel filename')
    expected=info['archive_info']['hashes']['sha256']
    if not re.fullmatch(r'[0-9a-f]{64}',expected): raise ValueError('Invalid expected hash')
    path=CACHE / filename
    if not path.exists() or hashlib.sha256(path.read_bytes()).hexdigest()!=expected:
        data=request(url)
        if hashlib.sha256(data).hexdigest()!=expected: raise ValueError('Downloaded wheel hash mismatch')
        path.write_bytes(data)
    return inspect_wheel(path,expected,name,version)


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--run',action='store_true');args=parser.parse_args()
    if not args.run: parser.error('explicit --run required')
    report=json.loads(RESOLUTION.read_text(encoding='utf-8')); items=report['install']
    if len(items)!=44: raise ValueError('Unexpected resolution count')
    baseline={re.split(r'==',line,1)[0].lower().replace('_','-') for line in (ROOT/'services/lightweight/requirements.txt').read_text(encoding='utf-8').splitlines() if '==' in line}
    names=[x['metadata']['name'].lower().replace('_','-') for x in items]
    if len(set(names))!=44 or len(set(names)-baseline)!=27: raise ValueError('Unexpected package inventory')
    CACHE.mkdir(parents=True,exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool: rows=list(pool.map(fetch_item,items))
    queries=[{'package':{'name':r['name'],'ecosystem':'PyPI'},'version':r['version']} for r in rows]
    advisory_errors=[]
    try:
        osv=json.loads(request('https://api.osv.dev/v1/querybatch',json.dumps({'queries':queries}).encode(),4_000_000))
        if len(osv.get('results',[]))!=len(rows): raise ValueError('OSV result count')
        for row,entry in zip(rows,osv['results']):
            row['osvIds']=[x['id'] for x in entry.get('vulns',[])]
            if entry.get('next_page_token'): advisory_errors.append(row['name']+': OSV pagination required')
    except Exception as exc: advisory_errors.append('OSV query failed: '+type(exc).__name__)
    def pypi(row):
        url='https://pypi.org/pypi/'+urllib.parse.quote(row['name'],safe='')+'/'+urllib.parse.quote(row['version'],safe='')+'/json'
        try:
            result=json.loads(request(url,max_bytes=4_000_000));return [x['id'] for x in result.get('vulnerabilities',[]) if not x.get('withdrawn')],None
        except Exception as exc:return None,row['name']+': PyPI query failed: '+type(exc).__name__
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        for row,(ids,error) in zip(rows,pool.map(pypi,rows)):
            row['pypiIds']=ids
            if error: advisory_errors.append(error)
    ghsa={}
    for advisory_type in ('reviewed','unreviewed','malware'):
        query=urllib.parse.urlencode({'ecosystem':'pip','type':advisory_type,'affects':','.join(r['name']+'@'+r['version'] for r in rows),'per_page':'100'})
        try:
            entries=json.loads(request('https://api.github.com/advisories?'+query,max_bytes=8_000_000))
            if not isinstance(entries,list): raise ValueError('Unexpected GHSA result')
            ghsa[advisory_type]=[{'id':v['ghsa_id'],'summary':v.get('summary'),'severity':v.get('severity')} for v in entries if not v.get('withdrawn_at')]
            if len(entries)>=100: advisory_errors.append('GHSA '+advisory_type+': pagination required')
        except Exception as exc: advisory_errors.append('GHSA '+advisory_type+' query failed: '+type(exc).__name__)
    for row in rows: row['newToRuntime']=row['name'].lower().replace('_','-') not in baseline
    result={'checkedAtUtc':datetime.now(timezone.utc).isoformat(),'resolutionSha256':hashlib.sha256(RESOLUTION.read_bytes()).hexdigest(),'packages':rows,'githubAdvisories':ghsa,'advisoryErrors':advisory_errors,
            'method':'OSV PyPI ecosystem querybatch; versioned PyPI JSON; GitHub global advisory REST affects exact package@version (reviewed/unreviewed/malware)',
            'limitations':'Metadata and bundled texts do not establish all binary component licenses, vulnerability reachability, future advisories or distribution compliance.'}
    REPORT.write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    print(json.dumps({'packages':len(rows),'new':sum(r['newToRuntime'] for r in rows),'notices':sum(len(r['noticeFiles']) for r in rows),'osvPackagesWithFindings':sum(bool(r.get('osvIds')) for r in rows),'pypiPackagesWithFindings':sum(bool(r.get('pypiIds')) for r in rows),'githubFindings':sum(len(v) for v in ghsa.values()),'advisoryErrors':advisory_errors,'report':str(REPORT)}))


if __name__=='__main__': main()
