import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';

const TEAMS = {
  west: {
    1: 'OKC Thunder',
    2: 'San Antonio Spurs',
    3: 'Denver Nuggets',
    4: 'LA Lakers',
    5: 'Houston Rockets',
    6: 'Minnesota T-Wolves',
    7: 'TBD (Play-In)',
    8: 'TBD (Play-In)',
  },
  east: {
    1: 'Detroit Pistons',
    2: 'Boston Celtics',
    3: 'New York Knicks',
    4: 'Cleveland Cavaliers',
    5: 'Toronto Raptors',
    6: 'Atlanta Hawks',
    7: 'TBD (Play-In)',
    8: 'TBD (Play-In)',
  }
};

const INITIAL_PICKS = {
  w1: null, w2: null, w3: null, w4: null,
  ws1: null, ws2: null,
  wcf: null,
  e1: null, e2: null, e3: null, e4: null,
  es1: null, es2: null,
  ecf: null,
  finals: null,
};

const GOLD = '#C8A84B';
const DARK = '#0a0a0f';
const PANEL = '#13131a';
const BORDER = '#2a2a3a';
const MUTED = '#888899';
const WEST_ACC = '#dd4444';
const EAST_ACC = '#4488dd';

export default function App() {
  const [page, setPage] = useState('home');
  const [name, setName] = useState('');
  const [picks, setPicks] = useState(INITIAL_PICKS);
  const [teams] = useState(TEAMS);
  const [allBrackets, setAllBrackets] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [myId, setMyId] = useState(null);

  useEffect(() => {
    if (page === 'leaderboard') fetchBrackets();
  }, [page]);

  async function fetchBrackets() {
    const { data } = await supabase.from('brackets').select('*').order('created_at', { ascending: true });
    if (data) setAllBrackets(data);
  }

  async function saveBracket() {
    if (!name.trim()) return alert('Enter your name first!');
    setSaving(true);
    if (myId) {
      await supabase.from('brackets').update({ picks, name }).eq('id', myId);
    } else {
      const { data } = await supabase.from('brackets').insert([{ name: name.trim(), picks }]).select();
      if (data && data[0]) setMyId(data[0].id);
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function pickWinner(matchup, team) {
    const newPicks = { ...picks, [matchup]: team };
    function clearDownstream(m) {
      const downstreamMap = {
        w1: ['ws1','wcf','finals'], w2: ['ws1','wcf','finals'],
        w3: ['ws2','wcf','finals'], w4: ['ws2','wcf','finals'],
        ws1: ['wcf','finals'], ws2: ['wcf','finals'],
        wcf: ['finals'],
        e1: ['es1','ecf','finals'], e2: ['es1','ecf','finals'],
        e3: ['es2','ecf','finals'], e4: ['es2','ecf','finals'],
        es1: ['ecf','finals'], es2: ['ecf','finals'],
        ecf: ['finals'],
      };
      if (downstreamMap[m]) {
        downstreamMap[m].forEach(d => { newPicks[d] = null; });
      }
    }
    if (picks[matchup] !== team) clearDownstream(matchup);
    setPicks(newPicks);
  }

  function getMatchupTeams(matchup) {
    const map = {
      w1: [{ seed: 1, name: teams.west[1] }, { seed: 8, name: teams.west[8] }],
      w2: [{ seed: 4, name: teams.west[4] }, { seed: 5, name: teams.west[5] }],
      w3: [{ seed: 3, name: teams.west[3] }, { seed: 6, name: teams.west[6] }],
      w4: [{ seed: 2, name: teams.west[2] }, { seed: 7, name: teams.west[7] }],
      ws1: [{ seed: '', name: picks.w1 || '?' }, { seed: '', name: picks.w2 || '?' }],
      ws2: [{ seed: '', name: picks.w3 || '?' }, { seed: '', name: picks.w4 || '?' }],
      wcf: [{ seed: '', name: picks.ws1 || '?' }, { seed: '', name: picks.ws2 || '?' }],
      e1: [{ seed: 1, name: teams.east[1] }, { seed: 8, name: teams.east[8] }],
      e2: [{ seed: 4, name: teams.east[4] }, { seed: 5, name: teams.east[5] }],
      e3: [{ seed: 3, name: teams.east[3] }, { seed: 6, name: teams.east[6] }],
      e4: [{ seed: 2, name: teams.east[2] }, { seed: 7, name: teams.east[7] }],
      es1: [{ seed: '', name: picks.e1 || '?' }, { seed: '', name: picks.e2 || '?' }],
      es2: [{ seed: '', name: picks.e3 || '?' }, { seed: '', name: picks.e4 || '?' }],
      ecf: [{ seed: '', name: picks.es1 || '?' }, { seed: '', name: picks.es2 || '?' }],
      finals: [{ seed: 'W', name: picks.wcf || '?' }, { seed: 'E', name: picks.ecf || '?' }],
    };
    return map[matchup] || [];
  }

  const styles = {
    app: { minHeight: '100vh', background: DARK, color: '#e8e8f0', fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif", padding: '0 0 60px' },
    header: { textAlign: 'center', padding: '24px 16px 16px', borderBottom: `1px solid ${BORDER}` },
    title: { fontSize: '2.2rem', fontWeight: 700, letterSpacing: 3, color: GOLD, margin: 0 },
    subtitle: { fontSize: '0.8rem', color: MUTED, letterSpacing: 2, marginTop: 4 },
    nav: { display: 'flex', justifyContent: 'center', gap: 10, padding: '14px 16px', borderBottom: `1px solid ${BORDER}` },
    navBtn: (active) => ({ background: active ? GOLD : 'transparent', color: active ? '#000' : MUTED, border: `1px solid ${active ? GOLD : BORDER}`, borderRadius: 3, padding: '8px 20px', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 700, letterSpacing: 2, cursor: 'pointer', textTransform: 'uppercase' }),
    page: { padding: '20px 12px' },
    label: { fontSize: '0.7rem', color: MUTED, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 },
    input: { background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 4, color: '#e8e8f0', fontFamily: 'inherit', fontSize: '1rem', padding: '10px 14px', width: '100%', boxSizing: 'border-box', marginBottom: 16 },
    btn: (color) => ({ background: color || GOLD, color: color ? '#fff' : '#000', border: 'none', borderRadius: 3, padding: '12px 28px', fontFamily: 'inherit', fontSize: '0.9rem', fontWeight: 700, letterSpacing: 2, cursor: 'pointer', textTransform: 'uppercase' }),
    sectionLabel: (color) => ({ fontSize: '0.65rem', fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: color || MUTED, textAlign: 'center', margin: '18px 0 8px' }),
    matchup: (conf) => ({ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 6, overflow: 'hidden', marginBottom: 8, borderTop: `2px solid ${conf === 'west' ? WEST_ACC : conf === 'east' ? EAST_ACC : GOLD}` }),
    teamRow: (selected) => ({ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', cursor: 'pointer', background: selected ? 'rgba(200,168,75,0.12)' : 'transparent', borderLeft: selected ? `3px solid ${GOLD}` : '3px solid transparent', transition: 'background 0.15s' }),
    seed: { fontSize: '0.65rem', color: MUTED, width: 16, textAlign: 'center', flexShrink: 0 },
    teamName: (selected) => ({ fontWeight: selected ? 700 : 400, fontSize: '0.9rem', flex: 1, color: selected ? GOLD : '#e8e8f0' }),
    vs: { textAlign: 'center', fontSize: '0.6rem', color: BORDER, padding: '2px', background: 'rgba(255,255,255,0.02)' },
    champBox: { textAlign: 'center', background: 'linear-gradient(135deg, rgba(200,168,75,0.15), rgba(200,168,75,0.05))', border: `1px solid rgba(200,168,75,0.4)`, borderRadius: 8, padding: '20px', margin: '20px 0' },
    champLabel: { fontSize: '0.75rem', color: GOLD, letterSpacing: 4, textTransform: 'uppercase' },
    champName: { fontSize: '2rem', fontWeight: 700, color: '#e8c86b', marginTop: 6, letterSpacing: 1 },
  };

  function Matchup({ id, conf }) {
    const t = getMatchupTeams(id);
    return (
      <div style={styles.matchup(conf)}>
        {t.map((team, i) => (
          <React.Fragment key={i}>
            {i === 1 && <div style={styles.vs}>VS</div>}
            <div style={styles.teamRow(picks[id] === team.name && team.name !== '?')} onClick={() => team.name !== '?' && pickWinner(id, team.name)}>
              <span style={styles.seed}>{team.seed}</span>
              <span style={styles.teamName(picks[id] === team.name && team.name !== '?')}>{team.name}</span>
              {picks[id] === team.name && team.name !== '?' && <span style={{ fontSize: '0.6rem', background: GOLD, color: '#000', padding: '1px 5px', borderRadius: 2, fontWeight: 700 }}>WIN</span>}
            </div>
          </React.Fragment>
        ))}
      </div>
    );
  }

  function BracketPage() {
    return (
      <div style={styles.page}>
        <div style={styles.label}>Your Name</div>
        <input style={styles.input} placeholder="Enter your name..." value={name} onChange={e => setName(e.target.value)} />
        <div style={styles.sectionLabel(WEST_ACC)}>🏀 Western Conference</div>
        <div style={styles.sectionLabel()}>First Round</div>
        <Matchup id="w1" conf="west" />
        <Matchup id="w2" conf="west" />
        <Matchup id="w3" conf="west" />
        <Matchup id="w4" conf="west" />
        <div style={styles.sectionLabel()}>Semifinals</div>
        <Matchup id="ws1" conf="west" />
        <Matchup id="ws2" conf="west" />
        <div style={styles.sectionLabel()}>Conference Finals</div>
        <Matchup id="wcf" conf="west" />
        <div style={{ marginTop: 24 }} />
        <div style={styles.sectionLabel(EAST_ACC)}>🏀 Eastern Conference</div>
        <div style={styles.sectionLabel()}>First Round</div>
        <Matchup id="e1" conf="east" />
        <Matchup id="e2" conf="east" />
        <Matchup id="e3" conf="east" />
        <Matchup id="e4" conf="east" />
        <div style={styles.sectionLabel()}>Semifinals</div>
        <Matchup id="es1" conf="east" />
        <Matchup id="es2" conf="east" />
        <div style={styles.sectionLabel()}>Conference Finals</div>
        <Matchup id="ecf" conf="east" />
        <div style={{ marginTop: 24 }} />
        <div style={styles.sectionLabel(GOLD)}>🏆 NBA Finals</div>
        <Matchup id="finals" conf="finals" />
        <div style={styles.champBox}>
          <div style={styles.champLabel}>🏆 My Champion Pick</div>
          <div style={styles.champName}>{picks.finals || '?'}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <button style={styles.btn()} onClick={saveBracket} disabled={saving}>
            {saving ? 'Saving...' : saved ? '✅ Saved!' : '💾 Save My Picks'}
          </button>
        </div>
        <p style={{ textAlign: 'center', color: MUTED, fontSize: '0.7rem', marginTop: 16, letterSpacing: 1 }}>
          Play-In: April 14–17 · Playoffs Begin: April 18
        </p>
      </div>
    );
  }

  function LeaderboardPage() {
    return (
      <div style={styles.page}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: GOLD, letterSpacing: 2 }}>ALL BRACKETS</div>
          <button style={{ ...styles.btn(), padding: '6px 14px', fontSize: '0.7rem' }} onClick={fetchBrackets}>Refresh</button>
        </div>
        {allBrackets.length === 0 && <p style={{ color: MUTED, textAlign: 'center', marginTop: 40 }}>No brackets saved yet!</p>}
        {allBrackets.map(b => (
          <div key={b.id} style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '14px', marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: GOLD, marginBottom: 8 }}>{b.name}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <div>
                <div style={{ fontSize: '0.6rem', color: WEST_ACC, letterSpacing: 2, marginBottom: 4 }}>WEST CHAMP</div>
                <div style={{ fontSize: '0.85rem' }}>{b.picks?.wcf || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.6rem', color: EAST_ACC, letterSpacing: 2, marginBottom: 4 }}>EAST CHAMP</div>
                <div style={{ fontSize: '0.85rem' }}>{b.picks?.ecf || '—'}</div>
              </div>
            </div>
            <div style={{ marginTop: 10, background: 'rgba(200,168,75,0.08)', borderRadius: 4, padding: '8px 12px', border: `1px solid rgba(200,168,75,0.2)` }}>
              <div style={{ fontSize: '0.6rem', color: GOLD, letterSpacing: 2, marginBottom: 2 }}>🏆 CHAMPION PICK</div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#e8c86b' }}>{b.picks?.finals || '—'}</div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  function HomePage() {
    return (
      <div style={{ ...styles.page, textAlign: 'center', paddingTop: 40 }}>
        <div style={{ fontSize: '3rem', marginBottom: 16 }}>🏀</div>
        <div style={{ fontSize: '1.4rem', fontWeight: 700, color: GOLD, letterSpacing: 2, marginBottom: 8 }}>NBA 2026 PLAYOFFS</div>
        <div style={{ color: MUTED, fontSize: '0.85rem', marginBottom: 32, lineHeight: 1.6 }}>
          Fill out your bracket, save your picks,<br />and see how your friends did!
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 280, margin: '0 auto' }}>
          <button style={styles.btn()} onClick={() => setPage('bracket')}>📝 Fill Out My Bracket</button>
          <button style={{ ...styles.btn(MUTED), background: 'transparent', color: MUTED, border: `1px solid ${BORDER}` }} onClick={() => setPage('leaderboard')}>👥 See Everyone's Picks</button>
        </div>
        <p style={{ color: MUTED, fontSize: '0.7rem', marginTop: 40, letterSpacing: 1 }}>
          Play-In: April 14–17 · Playoffs Begin: April 18
        </p>
      </div>
    );
  }

  return (
    <div style={styles.app}>
      <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700&display=swap" rel="stylesheet" />
      <div style={styles.header}>
        <div style={styles.title}>NBA 2026 BRACKET</div>
        <div style={styles.subtitle}>PLAYOFF PREDICTIONS</div>
      </div>
      <div style={styles.nav}>
        <button style={styles.navBtn(page === 'home')} onClick={() => setPage('home')}>Home</button>
        <button style={styles.navBtn(page === 'bracket')} onClick={() => setPage('bracket')}>My Picks</button>
        <button style={styles.navBtn(page === 'leaderboard')} onClick={() => setPage('leaderboard')}>Everyone</button>
      </div>
      {page === 'home' && <HomePage />}
      {page === 'bracket' && <BracketPage />}
      {page === 'leaderboard' && <LeaderboardPage />}
    </div>
  );
}
