import json, glob, collections
r = {}
for f in glob.glob('/home/user/kineflow2/responsive-audit/results*.json'):
    r.update(json.load(open(f)))
json.dump(r, open('/home/user/kineflow2/responsive-audit/results-all.json','w'), indent=1, ensure_ascii=False)
order = ['360','390','412','800h','768','1024','1280']
screens = collections.OrderedDict()
for k, v in r.items(): screens.setdefault(v['name'], {})[v['vp']] = v
for name, vs in screens.items():
    hs = [vp for vp in order if vp in vs and vs[vp]['hOverflow']]
    errs = [f"{vp}:{vs[vp].get('actionError')}" for vp in order if vp in vs and vs[vp].get('actionError')]
    perr = [f"{vp}:{vs[vp].get('errors')}" for vp in order if vp in vs and vs[vp].get('errors')]
    print(f"{name:32} HSCROLL={hs} inputs<16={[len(vs[vp]['smallInputs']) for vp in order if vp in vs][:1]} {errs[:3]} {perr[:2]}")
    for vp in hs[:1]:
        for o in vs[vp]['offenders'][:4]: print("     OFF", vp, vs[vp]['innerWidth'], o['sel'][:70], '|', o['text'][:40], o['right'])
    tg = collections.Counter()
    for vp in ['360','390','412']:
        if vp in vs:
            for t in vs[vp]['smallTargets']: tg[(t['sel'][:55], t['text'][:28], t['w'], t['h']) if vp=='360' else (t['sel'][:55], t['text'][:28], 0, 0)] += 0
    if '360' in vs:
        seen=set()
        for t in vs['360']['smallTargets']:
            key=(t['sel'][:50], t['h'] if t['h']<40 else t['w'])
            if key in seen: continue
            seen.add(key); print("     TGT360", t['sel'][:60], '|', t['text'][:30], t['w'], 'x', t['h'])
