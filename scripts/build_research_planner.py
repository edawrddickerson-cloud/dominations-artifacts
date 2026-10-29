"""Build traceable research focus mappings and a compact browser catalogue."""
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data/research'


def norm(s):
    return re.sub(r'[^a-z0-9]', '', s.lower())


def build():
    source = json.loads((DATA / 'catalog.json').read_text(encoding='utf-8'))
    army = json.loads((ROOT / 'data/army_catalog.json').read_text(encoding='utf-8'))
    units = army['units']
    # Transport research supports the plane and its deployed Paratroopers.
    units = units + [{'name': 'Transport', 'type': 'air', 'includes': ['Paratrooper']}]
    extra = {'Mortar Troop': ['mortar infantry', 'mortar troops'], 'Wall Breacher': ['wall breacher', 'wall breaker'],
             'Recon': ['recon aircraft', 'recon plane', 'recons'], 'Raider': ['raiders'],
             'Transport': ['transport aircraft', 'transports'], 'Commando': ['commandos']}
    patterns = {u['name']: re.compile(r'\b(?:' + '|'.join(re.escape(x) for x in [u['name'].lower()] + extra.get(u['name'], [])) + r')(?:s)?\b') for u in units}
    goals = [{'id': u['name'], 'label': u['name'], 'type': u['type'], 'includes': u.get('includes', [])} for u in units]
    goals += [{'id': x, 'label': x, 'type': 'goal', 'includes': []} for x in ['Defenses', 'Economy', 'Research', 'Museum', 'Generals', 'Coalitions', 'War tactics']]

    def groups(effect):
        text = effect.lower()
        result = {}
        def add(goal, relation, reason, conditional=False):
            result.setdefault(goal, {'focus': goal, 'relation': relation, 'reason': reason, 'conditional': conditional})
        defense = bool(re.search(r'\b(defenders?|defensive|invading|enemy|garrison|stable|bunker|tower|s\.a\.m\.|trap|fort\b|redoubt|missile silo|rocket arsenal|g\.c\.i\.)', text))
        offensive_target = bool(re.search(r'your ground troops deal|damage.*(?:to|against) (?:air defense|decoy|.*defenders?)', text))
        spawned_apc = bool(re.search(r'(?:deployed|spawned|troops).*apc|apc.*(?:troops|each wave)', text)) and 'cooldown' not in text
        upgrade = bool(re.search(r'upgrade|research|training (?:time|cost)|troop research', text))
        conditional = bool(re.search(r'munition|world war|detachment|wonder|when destroyed|when.*assigned', text))
        for u in units:
            if not patterns[u['name']].search(text):
                continue
            if defense and not spawned_apc:
                # Attacking a named defensive building is an offensive benefit.
                if not offensive_target:
                    continue
            if spawned_apc and u['name'] != 'APC':
                continue
            add(u['name'], 'upgrade' if upgrade else 'spawned' if spawned_apc else 'direct', effect, conditional)
        if 'apc' in text and spawned_apc:
            add('APC', 'spawned', effect, conditional)
        # Expand established linked units, retaining why a match is indirect.
        for u in units:
            for linked in u.get('includes', []):
                if linked in result and u['name'] not in result:
                    add(u['name'], 'spawned', f'{linked}: {effect}', result[linked]['conditional'])
        for u in units:
            name, kind = u['name'], u['type']
            if ('barracks troops' in text and kind == 'barracks') or (re.search(r'factory (?:troops|units)', text) and kind == 'factory'):
                add(name, 'general', effect, conditional)
            if kind == 'air' and re.search(r'aircraft upgrade|airstrip (?:troop|capacity)|air troop capacity', text):
                add(name, 'upgrade' if upgrade else 'general', effect, conditional)
            if (kind != 'air' or name == 'Paratrooper') and 'your ground troops deal' in text:
                add(name, 'general', effect, conditional)
            if not defense and re.search(r'^troops with both munition|^non-airstrip troops with both munition|when a troop has a level 10 munition', text):
                if 'non-airstrip' not in text or kind != 'air':
                    add(name, 'general', effect, True)
            if 'offensive wonder powers' in text:
                add(name, 'general', effect, True)
            if re.search(r'armory research|blacksmith research|troop research|troop training time', text) and not re.search(r'defender|tactical helicopter|alliance|donated', text):
                add(name, 'upgrade' if upgrade else 'general', effect, conditional)
            if kind != 'air' and re.search(r'troop capacity', text) and not re.search(r'air troop|defender|tactical helicopter|alliance|donated', text):
                add(name, 'general', effect, conditional)
            if re.search(r'university.*(?:research|skill)|(?:food|gold).*skill.*research|library.*research|research.*library', text) and 'defensive technologies' not in text:
                add(name, 'research', effect, conditional)
            # Linked infantry also inherits the Barracks-wide bonus.
            if u.get('includes') and 'barracks troops' in text:
                add(name, 'spawned', f'Spawned infantry: {effect}', conditional)
        if defense and not offensive_target:
            add('Defenses', 'direct', effect, conditional)
        for goal, pattern in [
            ('Economy', r'food|gold|oil|farm|caravan|road|vault|fruit|hunting|gather|mine|forest|cost|resource'),
            ('Research', r'research|university|library|blacksmith|armory'),
            ('Museum', r'museum|artifact|blueprint|fragment|researcher|supplies'),
            ('Generals', r'general|sun tzu|hannibal|commander'),
            ('Coalitions', r'coalition|embassy|law contribution|national trade'),
            ('War tactics', r'tactic|sabotage|protect|betrayal|decoy troops|rally|demolition|reroute'),
        ]:
            if re.search(pattern, text):
                add(goal, 'direct', effect, conditional)
        return list(result.values())

    lib_by_name = {norm(t['name']): t['id'] for t in source['library']}
    entries = []
    for t in source['university'] + source['library']:
        uni = t['building'] == 'University'
        entry = {k: t[k] for k in ['id', 'building', 'line', 'name', 'max_level', 'minimum_age_index', 'age_status', 'building_level_required', 'source_url']}
        entry.update(study=t.get('study'), grid=t.get('grid_cell'), stages=[])
        requirements = []
        if uni:
            for p in t['prerequisites']:
                if p['id'] == 'university':
                    continue
                match = re.search(r'to level (\d+)', p['requirement'])
                requirements.append({'any': [{'id': p['id'], 'level': int(match[1]) if match else None}], 'text': p['requirement']})
        for level in t['levels']:
            required = list(requirements)
            conditions = []
            if not uni:
                text = level['requirements']
                conditions = [p for p in text.split('; ') if not p.startswith(('Library level', 'Complete any one:', 'Complete this'))]
                matches = re.findall(r'(?:Complete any one: | or )([^;]+?) chapter (\d+)', text)
                if matches:
                    alternatives = [{'id': lib_by_name.get(norm(name)), 'level': int(n)} for name, n in matches]
                    required.append({'any': alternatives, 'text': ' or '.join(f'{name} chapter {n}' for name, n in matches)})
                if t.get('completion_requirement'):
                    required += [{'any': [{'id': other['id'], 'level': other['max_level']}], 'text': f"{other['name']} chapter {other['max_level']}"} for other in source['library'] if other['line'] == t['line'] and other['id'] != t['id']]
                if level['level'] > 1 and not any(any(p['id'] == t['id'] and p['level'] == level['level'] - 1 for p in r['any']) for r in required):
                    required.append({'any': [{'id': t['id'], 'level': level['level'] - 1}], 'text': f"{t['name']} chapter {level['level'] - 1}"})
            entry['stages'].append({'level': level['level'], 'age': level['minimum_age_index'],
                'building_level': max(s['building_level_required'] for other in source['library'] if other['line'] == t['line'] and other['id'] != t['id'] for s in other['levels']) if not uni and t.get('completion_requirement') else level['building_level_required'], 'effect': level['effect'],
                'bonus': level['bonus_at_level'], 'raw_bonus': level['source_growth_value'],
                'requires': required, 'conditions': conditions, 'matches': groups(level['effect'])})
        entries.append(entry)
    ids = {e['id'] for e in entries}
    unresolved = [(e['id'], r['text']) for e in entries for s in e['stages'] for r in s['requires'] if any(p['id'] not in ids or p['level'] is None for p in r['any'])]
    assert not unresolved, unresolved[:10]
    # An unmatched effect stays browsable under All research; never invent a unit.
    payload = {'version': 1, 'checked_date': source['checked_date'], 'ages': source['ages'],
               'building_age_gates': source['building_age_gates'], 'goals': goals, 'entries': entries}
    encoded = json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + '\n'
    (DATA / 'grouped.json').write_text(encoded, encoding='utf-8')
    (ROOT / 'ui/data/research_planner.json').write_text(encoded, encoding='utf-8')
    counts = Counter(m['focus'] for e in entries for m in e['stages'][0]['matches'])
    report = ['# Research focus mappings', '', 'Mappings are effect-based. Linked APC Heavy Infantry benefits retain their spawned-unit relation. Conditional bonuses require their stated conditions; disputed gates cannot qualify as ready.', '', '| Focus | Skills / first chapters |', '| --- | ---: |']
    report += [f"| {g['label']} | {counts[g['id']]} |" for g in goals]
    report += ['', '## APC', '', '| Building | Line | Research | Stage | Relation | Effect |', '| --- | --- | --- | ---: | --- | --- |']
    for e in entries:
        for s in e['stages'][:1] if e['building'] == 'University' else e['stages']:
            match = next((m for m in s['matches'] if m['focus'] == 'APC'), None)
            if match:
                report.append(f"| {e['building']} | {e['line']} | {e['name']} | {s['level']} | {match['relation']} | {match['reason']} |")
    (ROOT / 'reports/research_grouping.md').write_text('\n'.join(report) + '\n', encoding='utf-8')
    print(json.dumps({'entries': len(entries), 'stages': sum(len(e['stages']) for e in entries), 'bytes': len(encoded.encode()), 'unresolved_prerequisites': len(unresolved)}, indent=2))


if __name__ == '__main__':
    build()
