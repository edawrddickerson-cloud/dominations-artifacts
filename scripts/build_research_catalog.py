"""Extract University skills and Library chapters with evidence and age gates.

Rebuild: python scripts/build_research_catalog.py
Refresh supplemental wiki download: add --fetch
No application or canonical artifact data is modified.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data/raw/research'
OUT = ROOT / 'data/research'
DOWNLOAD = 'https://domiatlas.top/downloads/catalog.json'
CAPTURE = RAW / 'domiatlas_research.json'


def en(value):
    return value.get('en', '') if isinstance(value, dict) else value


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def capture(download):
    """Keep relevant English factual records, not the entire 40 MB site export."""
    entities = download['entities']
    subjects = {
        e['id'] for e in entities
        if e['id'].startswith('client-university-')
        or any(g.startswith('library-tree-') for g in e.get('groupIds', []))
        or e['id'] in ('library', 'university')
    }
    result = {
        'download_url': DOWNLOAD,
        'checked_date': str(datetime.now().astimezone().date()),
        'generated_at': download['generatedAt'],
        'release_version': download['releaseVersion'],
        'notice': download['notice'],
        'names': {x['id']: x['name'] for x in download['locales']['en']},
        'descriptions': {x['id']: x.get('description', '') for x in download['locales']['en'] if x['id'] in subjects},
        'entities': [
            {'id': e['id'], 'category': e['category'], 'groups': e.get('groupIds', []),
             'verification': e.get('verification'), 'sources': e.get('sources', []),
             'facts': {en(f['label']): en(f['value']) for f in e.get('facts', [])}}
            for e in entities if e['id'] in subjects or e['category'] == 'era'
        ],
        'groups': {g['id']: en(g['labels']) for g in download['groups']},
        'tables': [
            {'id': t['id'], 'subject': t['subjectId'], 'title': en(t['title']),
             'columns': [en(c) for c in t['columns']], 'version': t.get('contentVersion'),
             'note': en(t.get('note', {})),
             'rows': [{'cells': [en(c) for c in r['cells']], 'evidence_id': r.get('evidenceId')} for r in t['rows']]}
            for t in download['referenceTables'] if t['subjectId'] in subjects
        ],
        'relations': [
            {'from': r['fromId'], 'to': r['toId'], 'kind': r['kind'],
             'description': en(r.get('descriptions', {})), 'sources': r.get('sourceIds', []),
             'evidence_id': r.get('evidenceId'), 'reviewed_at': r.get('reviewedAt')}
            for r in download['relations'] if r['fromId'] in subjects
        ],
        'sources': download['sources'],
    }
    write_json(CAPTURE, result)
    return result


def number(value):
    return int(value) if str(value).isdigit() else None


def clean_name(value):
    value = value.lower().replace('(technology)', '').replace('defensive', 'defense')
    value = value.replace('tower defenses', 'tower defense').replace('labor efficiency capstone', 'labor efficiency')
    return re.sub(r'[^a-z0-9]', '', value)


def write_csv(path, rows):
    assert rows
    with path.open('w', newline='', encoding='utf-8-sig') as stream:
        writer = csv.DictWriter(stream, fieldnames=list(dict.fromkeys(k for row in rows for k in row)))
        writer.writeheader()
        for row in rows:
            writer.writerow({k: json.dumps(v, ensure_ascii=False) if isinstance(v, (list, dict)) else v for k, v in row.items()})


def build(source):
    checked_date = source['checked_date']
    names = source['names']
    entities = {e['id']: e for e in source['entities']}
    tables = {t['id']: t for t in source['tables']}
    relations = defaultdict(list)
    for relation in source['relations']:
        relations[relation['from']].append(relation)
    ages = {
        number(e['facts']['Age sequence']): names[e['id']]
        for e in entities.values() if 'Age sequence' in e['facts']
    }
    assert ages[11] == 'Atomic Age'
    building_ages = {}
    for building in ('library', 'university'):
        table = tables[f'client-cache-{building}-levels-1603']
        building_ages[building] = {int(r['cells'][0]): int(r['cells'][2]) for r in table['rows']}

    fandom = json.loads((RAW / 'fandom_index_extract.json').read_text(encoding='utf-8'))
    fandom_manifest = {clean_name(x['name']): x for x in fandom['library_manifest']}
    wiki_library = {}
    wiki_university = defaultdict(dict)
    for p in fandom['pages']:
        if p['type'] == 'library':
            for r in p['rows']:
                wiki_library[(clean_name(p['name']), number(r[0]))] = {'url': p['url'], 'effect': r[4], 'requirements': p.get('requirements')}
        elif p['type'] == 'university':
            for r in p['rows']:
                wiki_university[p['name']][clean_name(r[1])] = {'url': p['url'], 'name': r[1], 'university_level': number(r[0]), 'effect_per_level': r[2], 'levels': number(r[3]), 'requirements': r[4]}

    topics, skills, stages, issues = [], [], [], []
    for e in entities.values():
        eid = e['id']
        is_uni = eid.startswith('client-university-skill-')
        is_lib = 'Configured chapters' in e['facts'] and any(g.startswith('library-tree-') for g in e['groups'])
        if not (is_uni or is_lib):
            continue
        building = 'university' if is_uni else 'library'
        group = e['groups'][0]
        line = source['groups'][group]
        parents = [r['to'] for r in relations[eid] if r['kind'] == 'stored-in']
        tree_id = parents[0] if parents else None
        tree = names.get(tree_id, line)
        prereqs = [
            {'id': r['to'], 'name': names.get(r['to'], r['to']), 'requirement': r['description'], 'source_ids': r['sources']}
            for r in relations[eid] if r['kind'] == 'requires'
        ]
        base = {
            'id': eid, 'building': building.title(), 'study': line if is_uni else None,
            'line': tree if is_uni else line, 'name': names[eid],
            'effect': source['descriptions'].get(eid, ''),
            'max_level': number(e['facts'].get('Definition maximum level' if is_uni else 'Configured chapters')),
            'source_url': f'https://domiatlas.top/en/research/{eid}/',
            'source_checked_date': checked_date, 'source_status': 'client_reference_not_live_server_verified',
            'source_ids': e['sources'], 'prerequisites': prereqs,
            'age_status': 'reference_derived',
            'source_target_links': [
                {'id': r['to'], 'name': names.get(r['to'], r['to']), 'effect': r['description']}
                for r in relations[eid] if r['kind'] == 'affects'
            ],
        }
        detail = tables[f'client-detail-{eid}']
        reviewed = tables[f'client-reviewed-{eid}-' + ('research' if is_uni else 'chapters')]
        detail_rows = {int(r['cells'][0]): r['cells'] for r in detail['rows']}
        levels = []
        for row in reviewed['rows']:
            c = row['cells']
            level = int(c[0])
            raw = detail_rows[level]
            if is_uni:
                required_level = number(raw[5])
                effect, bonus, raw_bonus, cost, seconds, xp = c[1:]
                requirement = '; '.join(p['requirement'] for p in prereqs)
                workers = raw[4]
            else:
                effect, xp, cost, seconds, required_level_raw = c[1:]
                required_level = number(required_level_raw)
                bonus = raw_bonus = workers = None
                requirement = raw[3]
                if required_level is None:
                    match = re.search(r'Library level (\d+)', requirement)
                    required_level = int(match[1]) if match else None
            age_index = building_ages[building].get(required_level)
            if age_index is None:
                issues.append({'id': eid, 'level': level, 'issue': 'Missing building-to-age mapping'})
            stage = {
                'research_id': eid, 'level': level, 'effect': effect,
                'bonus_at_level': None if bonus in ('—', '', '-') else bonus,
                'source_growth_value': raw_bonus,
                'building_level_required': required_level,
                'building_gate_age': ages.get(age_index), 'building_gate_age_index': age_index,
                'minimum_age': ages.get(age_index), 'minimum_age_index': age_index,
                'requirements': requirement, 'base_cost': cost, 'base_time_seconds': number(seconds),
                'citizens_source_fields': workers, 'xp_reward': number(xp),
                'source_version': reviewed['version'], 'gate_source_version': detail['version'],
                'table_id': reviewed['id'], 'gate_table_id': detail['id'], 'evidence_id': row['evidence_id'],
            }
            levels.append(stage)
        assert len(levels) == base['max_level'], (eid, len(levels), base['max_level'])
        assert [s['level'] for s in levels] == list(range(1, base['max_level'] + 1)), eid
        base['levels'] = levels
        base['minimum_age'] = levels[0]['minimum_age']
        base['minimum_age_index'] = levels[0]['minimum_age_index']
        base['building_level_required'] = levels[0]['building_level_required']
        base['grid_cell'] = e['facts'].get('Grid cell')
        if is_lib:
            index = fandom_manifest.get(clean_name(names[eid]))
            base['fandom_index_evidence'] = index
            if index and base['max_level'] > 1 and index['building_level'] != base['building_level_required']:
                base['age_status'] = 'conflicting_sources'
                base['age_basis'] = 'Conservative Fandom index gate; supplemental table uses a lower level. Verify in game before recommending.'
                base['supplemental_building_level_required'] = base['building_level_required']
                base['building_level_required'] = index['building_level']
                base['minimum_age'] = index['age']
                age_index = next(k for k, v in ages.items() if v == index['age'])
                base['minimum_age_index'] = age_index
                for stage in levels:
                    stage['supplemental_building_level_required'] = stage['building_level_required']
                    stage['building_level_required'] = index['building_level']
                    stage['minimum_age'] = index['age']
                    stage['minimum_age_index'] = age_index
                issues.append({'id': eid, 'issue': 'Fandom index and supplemental Library level disagree', 'fandom': index, 'supplemental_level': base['supplemental_building_level_required'], 'action': 'Conservative Fandom age retained; exclude from automatic availability recommendations until reviewed'})
        if is_uni:
            base['fandom_evidence'] = wiki_university[tree].get(clean_name(names[eid]))
            if base['fandom_evidence']:
                w = base['fandom_evidence']
                match = re.search(r'Total Skill(?:s| Levels?| Level)?\s*(\d+)', w['requirements'], re.I)
                if match:
                    base['required_total_skill_levels'] = int(match[1])
                if w['university_level'] != base['building_level_required'] or w['levels'] != base['max_level']:
                    issues.append({'id': eid, 'issue': 'Fandom and supplemental reference disagree on level gate or maximum', 'fandom': w, 'supplemental_level': base['building_level_required'], 'supplemental_max': base['max_level']})
            skills.append(base)
        else:
            for s in levels:
                s['fandom_evidence'] = wiki_library.get((clean_name(names[eid]), s['level']))
            topics.append(base)
        stages.extend(levels)

    # Library capstones require the complete bookcase. The raw client gate of
    # Library 1 is not their actionable unlock age. Preserve both requirements.
    for topic in topics:
        if topic['max_level'] != 1:
            continue
        members = [t for t in topics if t['line'] == topic['line'] and t['id'] != topic['id']]
        age_index = max(s['minimum_age_index'] for t in members for s in t['levels'])
        if any(t['age_status'] == 'conflicting_sources' for t in members):
            topic['age_status'] = 'conflicting_sources'
        topic['completion_requirement'] = 'Complete this Library bookcase'
        topic['completion_requirement_source'] = 'https://dominations.fandom.com/wiki/' + {
            'Archaeology': 'Archaeology_Capstone', 'League of Nations': 'League_of_Nations_Capstone',
            'State of Defense': 'State_of_Defensive_Capstone', 'Basic Economics': 'Labor_Efficiency_Capstone',
        }[topic['line']]
        topic['minimum_age'] = ages[age_index]
        topic['minimum_age_index'] = age_index
        topic['age_basis'] = 'Derived from full bookcase completion; raw Library gate retained separately'
        for stage in topic['levels']:
            stage['minimum_age'] = ages[age_index]
            stage['minimum_age_index'] = age_index
            stage['requirements'] += '; Complete this Library bookcase'
        issues.append({'id': topic['id'], 'issue': 'Raw Library 1 gate alone is insufficient: bookcase completion raises earliest age', 'minimum_age': ages[age_index]})

    # Resolve University prerequisite age lower bounds without assuming that
    # catalogue membership is a prerequisite. Only explicit requires links count.
    by_id = {x['id']: x for x in skills}
    for _ in range(len(skills)):
        changed = False
        for skill in skills:
            age = max([skill['minimum_age_index']] + [by_id[p['id']]['minimum_age_index'] for p in skill['prerequisites'] if p['id'] in by_id])
            if age > skill['minimum_age_index']:
                skill['minimum_age_index'] = age
                skill['minimum_age'] = ages[age]
                for stage in skill['levels']:
                    stage['minimum_age_index'] = age
                    stage['minimum_age'] = ages[age]
                changed = True
        if not changed:
            break
    else:
        raise ValueError('University prerequisite age resolution did not converge')

    skill_rows = [{k: s[k] for k in ('id', 'building', 'study', 'line', 'name', 'grid_cell', 'effect', 'minimum_age', 'minimum_age_index', 'age_status', 'building_level_required', 'max_level', 'source_url', 'source_status')} | {
        'first_level_bonus': s['levels'][0]['bonus_at_level'], 'max_level_bonus': s['levels'][-1]['bonus_at_level'],
        'prerequisites': s['prerequisites'], 'required_total_skill_levels': s.get('required_total_skill_levels'),
    } for s in skills]
    chapter_rows = [
        {k: t[k] for k in ('id', 'building', 'line', 'name', 'source_url', 'source_status', 'age_status')} | s
        for t in topics for s in t['levels']
    ]
    level_rows = [
        {k: t[k] for k in ('building', 'line', 'name', 'source_url')} | s
        for t in skills for s in t['levels']
    ]
    summary = {
        'university_lines': len(set(s['line'] for s in skills)),
        'university_skills': len(skills), 'university_research_levels': len(level_rows),
        'library_lines': len(set(t['line'] for t in topics)),
        'library_topics': len(topics), 'library_chapters': len(chapter_rows),
        'university_by_study': dict(Counter(s['study'] for s in skills)),
        'university_by_line': dict(Counter(s['line'] for s in skills)),
        'library_by_line': dict(Counter(t['line'] for t in topics)),
        'missing_age_gates': sum(s['minimum_age'] is None for s in stages),
        'missing_effects': sum(not s['effect'] for s in stages),
        'issues': len(issues),
        'conflicting_age_topics': sum(t['age_status'] == 'conflicting_sources' for t in topics + skills),
    }
    assert summary['university_skills'] == 304
    assert summary['library_topics'] == 116
    assert not summary['missing_age_gates']
    assert not summary['missing_effects']
    assert len({s['id'] for s in topics + skills}) == len(topics + skills)
    assert all(p['id'] in entities or p['id'] in names for s in skills for p in s['prerequisites'])
    assert all(s['base_time_seconds'] is not None for s in stages)
    assert all(s['minimum_age_index'] >= s['building_gate_age_index'] for s in stages)
    write_json(OUT / 'catalog.json', {
        'schema_version': 1, 'checked_date': checked_date,
        'scope': 'University and Library research defined in the downloaded wiki client reference; not live-server confirmation',
        'sources': {'supplemental_download': DOWNLOAD, 'generated_at': source['generated_at'],
                    'primary_wiki': 'https://dominations.fandom.com/wiki/Technology',
                    'university_wiki': 'https://dominations.fandom.com/wiki/Great_Leaders'},
        'summary': summary, 'ages': ages,
        'building_age_gates': building_ages,
        'university': skills, 'library': topics,
    })
    write_csv(OUT / 'university.csv', skill_rows)
    write_csv(OUT / 'library.csv', chapter_rows)
    write_csv(OUT / 'university_levels.csv', level_rows)
    write_json(OUT / 'issues.json', issues)
    write_json(OUT / 'coverage.json', summary)
    report = [
        '# University and Library research catalogue', '',
        f"Source checked: {checked_date}. {len(skills)} University skills / {len(level_rows):,} levels; {len(topics)} Library topics / {len(chapter_rows)} chapters.", '',
        'Fandom evidence is supplemented by the DomiAtlas published client reference. Entries are reference data, not live-server confirmation. Research prerequisites still apply. See data/research/README.md for source limitations.', '',
        '**Age conflict** marks State of Defense entries whose Fandom building requirement disagrees with the supplemental research tier. The table uses the higher Fandom age; exclude these from automatic recommendations until verified.', '',
        '## University', '',
    ]
    def md(text):
        return str(text or '').replace('|', '/').replace('\n', ' ')
    for study in dict.fromkeys(s['study'] for s in skills):
        report += [f'### {study}', '']
        for line in dict.fromkeys(s['line'] for s in skills if s['study'] == study):
            report += [f'#### {line}', '', '| Research | Grid | Effect | From age | Levels | Bonus at maximum level |', '| --- | --- | --- | --- | ---: | --- |']
            for s in skills:
                if s['study'] == study and s['line'] == line:
                    bonus = s['levels'][-1]['bonus_at_level'] or f"{s['levels'][-1]['source_growth_value']} (unit not reviewed)"
                    report.append(f"| [{md(s['name'])}]({s['source_url']}) | {md(s['grid_cell'])} | {md(s['effect'])} | {s['minimum_age']} | {s['max_level']} | {md(bonus)} |")
            report += ['']
    report += ['## Library', '']
    for line in dict.fromkeys(t['line'] for t in topics):
        report += [f'### {line}', '', '| Book | Chapter | Effect | From age |', '| --- | ---: | --- | --- |']
        for t in topics:
            if t['line'] != line:
                continue
            for s in t['levels']:
                age = s['minimum_age'] + (' **Age conflict**' if t['age_status'] == 'conflicting_sources' else '')
                report.append(f"| [{md(t['name'])}]({t['source_url']}) | {s['level']} | {md(s['effect'])} | {age} |")
        report += ['']
    (ROOT / 'reports').mkdir(exist_ok=True)
    (ROOT / 'reports/research_catalog.md').write_text('\n'.join(report).rstrip() + '\n', encoding='utf-8')
    print(json.dumps(summary, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fetch', action='store_true')
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    if args.fetch:
        import requests
        response = requests.get(DOWNLOAD, headers={'User-Agent': 'DomiNationsResearchCatalog/1.0'}, timeout=90)
        response.raise_for_status()
        source = capture(response.json())
        source['download_sha256'] = hashlib.sha256(response.content).hexdigest()
        write_json(CAPTURE, source)
    elif CAPTURE.exists():
        source = json.loads(CAPTURE.read_text(encoding='utf-8'))
    else:
        source = capture(json.loads((RAW / 'domiatlas_catalog.json').read_text(encoding='utf-8')))
    build(source)


if __name__ == '__main__':
    main()
