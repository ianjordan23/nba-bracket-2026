import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';

const ADMIN_PASSWORD = '@cadecunningham2!';
const LOCK_DATE = new Date('2026-04-18T00:00:00-06:00');

const INITIAL_TEAMS = {
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

const MATCHUP_ROUND = {
  w1: 1, w2: 1, w3: 1, w4: 1,
  e1: 1, e2: 1, e3: 1, e4: 1,
  ws1: 2, ws2: 2, es1: 2, es2: 2,
  wcf: 4, ecf: 4,
  finals: 8,
};

const POINTS = { 1: 100, 2: 200, 4: 400, 8: 800 };
const MAX_SCORE = 3200;

const INITIAL_PICKS = {
  w1: null, w2: null, w3: null, w4: null,
  ws1: null, ws2: null, wcf: null,
  e1: null, e2: null, e3: null, e4: null,
  es1: null, es2: null, ecf: null,
  finals: null,
};

const GOLD = '#C8A84B';
const DARK = '#0a0a0f';
const PANEL = '#13131a';
const BORDER = '#2a2a3a';
const MUTED = '#777788';
const WEST_ACC = '#dd4444';
const EAST_ACC = '#4488dd';
const GREEN = '#2ecc71';
const RED = '#e74c3c';

function calcScore(picks, results) {
  let score = 0; let correct = 0; let total = 0;
  let maxRemaining = 0;
  Object.keys(MATCHUP_ROUND).forEach(m => {
    const pts = POINTS[MATCHUP_ROUND[m]] || 100;
    if (picks[m] && results[m]) {
      total++;
      if (picks[m] === results[m]) { score += pts; correct++; }
      // if result is known and wrong, no more points possible for this
    } else if (picks[m] && !results[m]) {
      // game not played yet, still possible
      maxRemaining += pts;
    }
  });
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  return { score, correct, total, pct, maxRemaining };
}

function getMostPopular(allBrackets) {
  const counts = {};
  allBrackets.forEach(b => {
    Object.entries(b.picks || {}).forEach(([matchup, team]) => {
      if (team) {
        if (!counts[team]) counts[team] = 0;
        counts[team]++;
      }
    });
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
}

function getChampEliminated(picks, results) {
  if (!picks.finals) return false;
  // Check if champion pick lost anywhere
  const allResults = Object.values(results);
  const champPick = picks.finals;
  // If champion pick appears as a loser (not in results values where it won)
  return Object.entries(results).some(([matchup, winner]) => {
    const matchupTeams = ['w1','w2','w3','w4','e1','e2','e3','e4','ws1','ws2','wcf','ecf','es1','es2','wcf','finals'];
    return winner !== champPick && matchupTeams.includes(matchup);
  }) && !Object.values(results).includes(champPick) && Object.keys(results).length > 0;
}

export default function App() {
  const path = window.location.pathname;
  const isAdmin = path === '/admin';
  const isLocked = new Date() >= LOCK_DATE;

  const [page, setPage] = useState('home');
  const [name, setName] = useState('');
  const [picks, setPicks] = useState(INITIAL_PICKS);
  const [teams, setTeams] = useState(INITIAL_TEAMS);
  const [results, setResults] = useState({});
  const [allBrackets, setAllBrackets] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [myId, setMyId] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [adminPass, setAdminPass] = useState('');
  const [adminAuthed, setAdminAuthed] = useState(false);
  const [adminResults, setAdminResults] = useState({});
  const [adminTeams, setAdminTeams] = useState(INITIAL_TEAMS);
  const [adminSaved, setAdminSaved] = useState(false);
  const [lookupName, setLookupName] = useState('');
  const [lookupError, setLookupError] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [countdown, setCountdown] = useState('');

  useEffect(() => { loadResults(); }, []);
  useEffect(() => { if (page === 'leaderboard') fetchBrackets(); }, [page]);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const diff = LOCK_DATE - now;
      if (diff <= 0) { setCountdown('🔒 Locked!'); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(`${d}d ${h}h ${m}m ${s}s`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  async function loadResults() {
    const { data } = await supabase.from('results').select('*').eq('id', 1).single();
    if (data) {
      setResults(data.results || {});
      setAdminResults(data.results || {});
      if (data.teams) { setTeams(data.teams); setAdminTeams(data.teams); }
    }
  }

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
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  async function lookupBracket() {
    if (!lookupName.trim()) return;
    setLookupLoading(true);
    setLookupError('');
    const { data } = await supabase.from('brackets').select('*').ilike('name', lookupName.trim()).limit(1);
    if (data && data.length > 0) {
      const b = data[0];
      setMyId(b.id);
      setName(b.name);
      setPicks(b.picks || INITIAL_PICKS);
      setPage('bracket');
    } else {
      setLookupError('No bracket found! Check your spelling.');
    }
    setLookupLoading(false);
  }

  async function saveAdminResults() {
    const { data } = await supabase.from('results').select('id').eq('id', 1).single();
    if (data) {
      await supabase.from('results').update({ results: adminResults, teams: adminTeams }).eq('id', 1);
    } else {
      await supabase.from('results').insert([{ id: 1, results: adminResults, teams: adminTeams }]);
    }
    setResults(adminResults); setTeams(adminTeams);
    setAdminSaved(true); setTimeout(() => setAdminSaved(false), 2000);
  }

  function pickWinner(matchup, team) {
    if (isLocked) return;
    const newPicks = { ...picks, [matchup]: team };
    function clearDownstream(m) {
      const map = {
        w1: ['ws1','wcf','finals'], w2: ['ws1','wcf','finals'],
        w3: ['ws2','wcf','finals'], w4: ['ws2','wcf','finals'],
        ws1: ['wcf','finals'], ws2: ['wcf','finals'], wcf: ['finals'],
        e1: ['es1','ecf','finals'], e2: ['es1','ecf','finals'],
        e3: ['es2','ecf','finals'], e4: ['es2','ecf','finals'],
        es1: ['ecf','finals'], es2: ['ecf','finals'], ecf: ['finals'],
      };
      if (map[m]) map[m].forEach(d => { newPicks[d] = null; });
    }
    if (picks[matchup] !== team) clearDownstream(matchup);
    setPicks(newPicks);
  }

  function getTeamList(id, myPicks) {
    const w = teams.west; const e = teams.east;
    const map = {
      w1: [{ seed: 1, name: w[1] }, { seed: 8, name: w[8] }],
      w2: [{ seed: 4, name: w[4] }, { seed: 5, name: w[5] }],
      w3: [{ seed: 3, name: w[3] }, { seed: 6, name: w[6] }],
      w4: [{ seed: 2, name: w[2] }, { seed: 7, name: w[7] }],
      ws1: [{ seed: '', name: myPicks.w1 || '?' }, { seed: '', name: myPicks.w2 || '?' }],
      ws2: [{ seed: '', name: myPicks.w3 || '?' }, { seed: '', name: myPicks.w4 || '?' }],
      wcf: [{ seed: '', name: myPicks.ws1 || '?' }, { seed: '', name: myPicks.ws2 || '?' }],
      e1: [{ seed: 1, name: e[1] }, { seed: 8, name: e[8] }],
      e2: [{ seed: 4, name: e[4] }, { seed: 5, name: e[5] }],
      e3: [{ seed: 3, name: e[3] }, { seed: 6, name: e[6] }],
      e4: [{ seed: 2, name: e[2] }, { seed: 7, name: e[7] }],
      es1: [{ seed: '', name: myPicks.e1 || '?' }, { seed: '', name: myPicks.e2 || '?' }],
      es2: [{ seed: '', name: myPicks.e3 || '?' }, { seed: '', name: myPicks.e4 || '?' }],
      ecf: [{ seed: '', name: myPicks.es1 || '?' }, { seed: '', name: myPicks.es2 || '?' }],
      finals: [{ seed: 'W', name: myPicks.wcf || '?' }, { seed: 'E', name: myPicks.ecf || '?' }],
    };
    return map[id] || [];
  }

  const s = {
    matchupBox: (conf) => ({ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 6, overflow: 'hidden', marginBottom: 7, borderTop: `2px solid ${conf === 'west' ? WEST_ACC : conf === 'east' ? EAST_ACC : GOLD}` }),
    teamRow: (status) => ({
      display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', cursor: 'pointer',
      background: status === 'correct' ? 'rgba(46,204,113,0.1)' : status === 'wrong' ? 'rgba(231,76,60,0.07)' : status === 'selected' ? 'rgba(200,168,75,0.1)' : 'transparent',
      borderLeft: status === 'correct' ? `3px solid ${GREEN}` : status === 'wrong' ? `3px solid ${RED}` : status === 'selected' ? `3px solid ${GOLD}` : '3px solid transparent',
    }),
    seed: { fontSize: '0.62rem', color: MUTED, width: 14, textAlign: 'center', flexShrink: 0 },
    teamName: (status) => ({
      fontWeight: status === 'correct' || status === 'selected' ? 700 : 400,
      fontSize: '0.88rem', flex: 1,
      color: status === 'correct' ? GREEN : status === 'wrong' ? RED : status === 'selected' ? GOLD : '#e8e8f0',
      textDecoration: status === 'wrong' ? 'line-through' : 'none',
    }),
    vs: { textAlign: 'center', fontSize: '0.55rem', color: BORDER, padding: '2px', background: 'rgba(255,255,255,0.02)' },
    secLabel: (color) => ({ fontSize: '0.62rem', fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: color || MUTED, textAlign: 'center', margin: '16px 0 6px' }),
    page: { padding: '16px 12px' },
    label: { fontSize: '0.68rem', color: MUTED, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 5 },
    input: { background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 4, color: '#e8e8f0', fontFamily: 'inherit', fontSize: '1rem', padding: '9px 12px', width: '100%', boxSizing: 'border-box', marginBottom: 14 },
    btn: (bg, fg) => ({ background: bg || GOLD, color: fg || '#000', border: 'none', borderRadius: 3, padding: '11px 24px', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 700, letterSpacing: 2, cursor: 'pointer', textTransform: 'uppercase' }),
    navBtn: (active) => ({ background: active ? GOLD : 'transparent', color: active ? '#000' : MUTED, border: `1px solid ${active ? GOLD : BORDER}`, borderRadius: 3, padding: '7px 16px', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 700, letterSpacing: 2, cursor: 'pointer', textTransform: 'uppercase' }),
  };

  function renderMatchup(id, conf, myPicks, myResults, editable) {
    const t = getTeamList(id, myPicks);
    return (
      <div key={id} style={s.matchupBox(conf)}>
        {t.map((team, i) => {
          const isSelected = myPicks[id] === team.name && team.name !== '?';
          const hasResult = !!myResults[id];
          const isCorrect = hasResult && myPicks[id] === team.name && myPicks[id] === myResults[id];
          const isWrong = hasResult && myPicks[id] === team.name && myPicks[id] !== myResults[id];
          const status = isCorrect ? 'correct' : isWrong ? 'wrong' : isSelected ? 'selected' : 'none';
          return (
            <React.Fragment key={i}>
              {i === 1 && <div style={s.vs}>VS</div>}
              <div style={s.teamRow(status)} onClick={() => editable && team.name !== '?' && pickWinner(id, team.name)}>
                <span style={s.seed}>{team.seed}</span>
                <span style={s.teamName(status)}>{team.name}</span>
                {isCorrect && <span style={{ fontSize: '0.6rem', background: GREEN, color: '#000', padding: '1px 5px', borderRadius: 2, fontWeight: 700 }}>✓</span>}
                {isWrong && <span style={{ fontSize: '0.6rem', background: RED, color: '#fff', padding: '1px 5px', borderRadius: 2, fontWeight: 700 }}>✗</span>}
                {!hasResult && isSelected && <span style={{ fontSize: '0.6rem', background: GOLD, color: '#000', padding: '1px 5px', borderRadius: 2, fontWeight: 700 }}>WIN</span>}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    );
  }

  function renderBracket(myPicks, myResults, editable) {
    return (
      <div>
        <div style={s.secLabel(WEST_ACC)}>🏀 Western Conference</div>
        <div style={s.secLabel()}>First Round</div>
        {['w1','w2','w3','w4'].map(id => renderMatchup(id, 'west', myPicks, myResults, editable))}
        <div style={s.secLabel()}>Semifinals</div>
        {['ws1','ws2'].map(id => renderMatchup(id, 'west', myPicks, myResults, editable))}
        <div style={s.secLabel()}>Conference Finals</div>
        {renderMatchup('wcf', 'west', myPicks, myResults, editable)}
        <div style={{ marginTop: 20 }} />
        <div style={s.secLabel(EAST_ACC)}>🏀 Eastern Conference</div>
        <div style={s.secLabel()}>First Round</div>
        {['e1','e2','e3','e4'].map(id => renderMatchup(id, 'east', myPicks, myResults, editable))}
        <div style={s.secLabel()}>Semifinals</div>
        {['es1','es2'].map(id => renderMatchup(id, 'east', myPicks, myResults, editable))}
        <div style={s.secLabel()}>Conference Finals</div>
        {renderMatchup('ecf', 'east', myPicks, myResults, editable)}
        <div style={{ marginTop: 20 }} />
        <div style={s.secLabel(GOLD)}>🏆 NBA Finals</div>
        {renderMatchup('finals', 'finals', myPicks, myResults, editable)}
      </div>
    );
  }

  if (isAdmin) {
    const allMatchups = [
      { id: 'w1', label: 'West R1: 1 vs 8', teams: [adminTeams.west[1], adminTeams.west[8]] },
      { id: 'w2', label: 'West R1: 4 vs 5', teams: [adminTeams.west[4], adminTeams.west[5]] },
      { id: 'w3', label: 'West R1: 3 vs 6', teams: [adminTeams.west[3], adminTeams.west[6]] },
      { id: 'w4', label: 'West R1: 2 vs 7', teams: [adminTeams.west[2], adminTeams.west[7]] },
      { id: 'ws1', label: 'West Semis 1', teams: [adminResults.w1, adminResults.w2].filter(Boolean) },
      { id: 'ws2', label: 'West Semis 2', teams: [adminResults.w3, adminResults.w4].filter(Boolean) },
      { id: 'wcf', label: 'West Finals', teams: [adminResults.ws1, adminResults.ws2].filter(Boolean) },
      { id: 'e1', label: 'East R1: 1 vs 8', teams: [adminTeams.east[1], adminTeams.east[8]] },
      { id: 'e2', label: 'East R1: 4 vs 5', teams: [adminTeams.east[4], adminTeams.east[5]] },
      { id: 'e3', label: 'East R1: 3 vs 6', teams: [adminTeams.east[3], adminTeams.east[6]] },
      { id: 'e4', label: 'East R1: 2 vs 7', teams: [adminTeams.east[2], adminTeams.east[7]] },
      { id: 'es1', label: 'East Semis 1', teams: [adminResults.e1, adminResults.e2].filter(Boolean) },
      { id: 'es2', label: 'East Semis 2', teams: [adminResults.e3, adminResults.e4].filter(Boolean) },
      { id: 'ecf', label: 'East Finals', teams: [adminResults.es1, adminResults.es2].filter(Boolean) },
      { id: 'finals', label: '🏆 NBA Finals', teams: [adminResults.wcf, adminResults.ecf].filter(Boolean) },
    ];
    return (
      <div style={{ minHeight: '100vh', background: DARK, color: '#e8e8f0', fontFamily: "'Barlow Condensed','Arial Narrow',sans-serif", padding: '0 0 60px' }}>
        <div style={{ textAlign: 'center', padding: '20px 16px 14px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: '2rem', fontWeight: 700, letterSpacing: 3, color: GOLD }}>NBA 2026 BRACKET</div>
          <div style={{ fontSize: '0.75rem', color: MUTED, letterSpacing: 2, marginTop: 3 }}>ADMIN PANEL</div>
        </div>
        <div style={s.page}>
          {!adminAuthed ? (
            <div style={{ maxWidth: 320, margin: '60px auto' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: GOLD, letterSpacing: 2, marginBottom: 20, textAlign: 'center' }}>🔒 ADMIN LOGIN</div>
              <div style={s.label}>Password</div>
              <input style={s.input} type="password" placeholder="Password..." value={adminPass} onChange={e => setAdminPass(e.target.value)} />
              <button style={{ ...s.btn(), width: '100%' }} onClick={() => { if (adminPass === ADMIN_PASSWORD) setAdminAuthed(true); else alert('Wrong password!'); }}>Login</button>
            </div>
          ) : (
            <>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: GOLD, letterSpacing: 2, marginBottom: 16 }}>ENTER RESULTS</div>
              <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 6, padding: 12, marginBottom: 14 }}>
                <div style={{ fontSize: '0.65rem', color: GOLD, letterSpacing: 2, marginBottom: 10 }}>PLAY-IN SEEDS (7 & 8)</div>
                {['west','east'].map(conf => (
                  <div key={conf} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: '0.62rem', color: conf === 'west' ? WEST_ACC : EAST_ACC, letterSpacing: 2, marginBottom: 5 }}>{conf.toUpperCase()}</div>
                    {[7,8].map(seed => (
                      <div key={seed} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: '0.7rem', color: MUTED, width: 50 }}>Seed {seed}:</span>
                        <input style={{ ...s.input, marginBottom: 0, flex: 1, fontSize: '0.85rem', padding: '6px 10px' }}
                          placeholder={`${conf} ${seed} seed...`} value={adminTeams[conf][seed]}
                          onChange={e => setAdminTeams(prev => ({ ...prev, [conf]: { ...prev[conf], [seed]: e.target.value } }))} />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              {allMatchups.map(({ id, label, teams: mTeams }) => (
                <div key={id} style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '10px 12px', marginBottom: 8 }}>
                  <div style={{ fontSize: '0.62rem', color: MUTED, letterSpacing: 2, marginBottom: 7 }}>{label}</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {mTeams.length > 0 ? mTeams.map(team => (
                      <button key={team} style={{ ...s.btn(adminResults[id] === team ? GREEN : PANEL, adminResults[id] === team ? '#000' : '#e8e8f0'), border: `1px solid ${adminResults[id] === team ? GREEN : BORDER}`, padding: '6px 12px', fontSize: '0.78rem' }}
                        onClick={() => setAdminResults(prev => ({ ...prev, [id]: team }))}>{team}</button>
                    )) : <span style={{ fontSize: '0.75rem', color: MUTED }}>Enter earlier rounds first</span>}
                    {adminResults[id] && (
                      <button style={{ ...s.btn(PANEL, RED), border: `1px solid ${RED}`, padding: '6px 10px', fontSize: '0.75rem' }}
                        onClick={() => setAdminResults(prev => { const n = { ...prev }; delete n[id]; return n; })}>Clear</button>
                    )}
                  </div>
                </div>
              ))}
              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <button style={s.btn()} onClick={saveAdminResults}>{adminSaved ? '✅ Saved!' : '💾 Save Results'}</button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  const ranked = [...allBrackets].map(b => {
    const { score, correct, total, pct, maxRemaining } = calcScore(b.picks || {}, results);
    const champEliminated = b.picks?.finals && Object.keys(results).length > 0 && !Object.values(results).includes(b.picks.finals) && Object.values(results).some(r => r !== b.picks.finals);
    return { ...b, score, correct, total, pct, maxRemaining, champEliminated };
  }).sort((a, b) => b.score - a.score);

  const popularPicks = getMostPopular(allBrackets);

  return (
    <div style={{ minHeight: '100vh', background: DARK, color: '#e8e8f0', fontFamily: "'Barlow Condensed','Arial Narrow',sans-serif", padding: '0 0 60px' }}>
      <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700&display=swap" rel="stylesheet" />
      <div style={{ textAlign: 'center', padding: '20px 16px 14px', borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ fontSize: '2rem', fontWeight: 700, letterSpacing: 3, color: GOLD }}>NBA 2026 BRACKET</div>
        <div style={{ fontSize: '0.75rem', color: MUTED, letterSpacing: 2, marginTop: 3 }}>PLAYOFF PREDICTIONS</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '12px 16px', borderBottom: `1px solid ${BORDER}` }}>
        <button style={s.navBtn(page === 'home')} onClick={() => setPage('home')}>Home</button>
        <button style={s.navBtn(page === 'bracket')} onClick={() => setPage('bracket')}>My Picks</button>
        <button style={s.navBtn(page === 'leaderboard')} onClick={() => { fetchBrackets(); setPage('leaderboard'); }}>Leaderboard</button>
      </div>

      {page === 'home' && (
        <div style={{ ...s.page, textAlign: 'center', paddingTop: 28 }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>🏀</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 700, color: GOLD, letterSpacing: 2, marginBottom: 4 }}>NBA 2026 PLAYOFFS</div>

          {/* Countdown */}
          {!isLocked ? (
            <div style={{ background: PANEL, border: `1px solid ${GOLD}`, borderRadius: 8, padding: '14px 20px', margin: '16px auto', maxWidth: 280, display: 'inline-block' }}>
              <div style={{ fontSize: '0.6rem', color: GOLD, letterSpacing: 3, marginBottom: 4 }}>⏰ BRACKETS LOCK IN</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#e8c86b', letterSpacing: 2 }}>{countdown}</div>
            </div>
          ) : (
            <div style={{ background: 'rgba(231,76,60,0.1)', border: `1px solid ${RED}`, borderRadius: 8, padding: '10px 20px', margin: '16px auto', maxWidth: 280, display: 'inline-block' }}>
              <div style={{ fontSize: '0.9rem', color: RED, fontWeight: 700 }}>🔒 Brackets Locked!</div>
            </div>
          )}

          {/* Most Popular Picks */}
          {popularPicks.length > 0 && (
            <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '14px', margin: '16px auto', maxWidth: 320, textAlign: 'left' }}>
              <div style={{ fontSize: '0.62rem', color: GOLD, letterSpacing: 3, marginBottom: 10, textAlign: 'center' }}>🔥 MOST POPULAR PICKS</div>
              {popularPicks.map(([team, count]) => (
                <div key={team} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <div style={{ flex: 1, fontSize: '0.85rem', fontWeight: 600 }}>{team}</div>
                  <div style={{ fontSize: '0.7rem', color: MUTED }}>{count} pick{count !== 1 ? 's' : ''}</div>
                  <div style={{ background: BORDER, borderRadius: 3, height: 6, width: 80 }}>
                    <div style={{ width: `${(count / allBrackets.length) * 100}%`, background: GOLD, height: '100%', borderRadius: 3 }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 260, margin: '16px auto 0' }}>
            {!isLocked && <button style={s.btn()} onClick={() => { setPicks(INITIAL_PICKS); setMyId(null); setPage('bracket'); }}>📝 Fill Out My Bracket</button>}
            {!isLocked && <button style={{ ...s.btn(PANEL, MUTED), border: `1px solid ${BORDER}` }} onClick={() => setPage('edit')}>✏️ Edit My Bracket</button>}
            <button style={{ ...s.btn(PANEL, MUTED), border: `1px solid ${BORDER}` }} onClick={() => { fetchBrackets(); setPage('leaderboard'); }}>🏆 Leaderboard</button>
          </div>
          <p style={{ color: MUTED, fontSize: '0.65rem', marginTop: 20, letterSpacing: 1 }}>Play-In: April 14–17 · Playoffs Begin: April 18</p>
        </div>
      )}

      {page === 'edit' && (
        <div style={{ ...s.page, maxWidth: 340, margin: '0 auto' }}>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: GOLD, letterSpacing: 2, marginBottom: 16 }}>✏️ EDIT MY BRACKET</div>
          <div style={s.label}>Your Name</div>
          <input style={s.input} placeholder="Enter your name exactly as saved..." value={lookupName} onChange={e => setLookupName(e.target.value)} autoComplete="off" />
          {lookupError && <div style={{ fontSize: '0.75rem', color: RED, marginBottom: 10 }}>{lookupError}</div>}
          <button style={{ ...s.btn(), width: '100%' }} onClick={lookupBracket} disabled={lookupLoading}>
            {lookupLoading ? 'Looking up...' : 'Find My Bracket'}
          </button>
          <p style={{ color: MUTED, fontSize: '0.7rem', marginTop: 12, textAlign: 'center' }}>Spell your name exactly as you entered it!</p>
        </div>
      )}

      {page === 'bracket' && (
        <div style={s.page}>
          {isLocked && (
            <div style={{ background: 'rgba(231,76,60,0.1)', border: `1px solid ${RED}`, borderRadius: 6, padding: 12, marginBottom: 14, textAlign: 'center' }}>
              <div style={{ fontSize: '0.9rem', color: RED, fontWeight: 700 }}>🔒 Brackets are locked!</div>
            </div>
          )}
          <div style={s.label}>Your Name</div>
          <input style={s.input} placeholder="Enter your name..." defaultValue={name} onBlur={e => setName(e.target.value)} autoComplete="off" />
          {renderBracket(picks, results, !isLocked)}
          <div style={{ textAlign: 'center', background: 'linear-gradient(135deg,rgba(200,168,75,0.15),rgba(200,168,75,0.05))', border: `1px solid rgba(200,168,75,0.4)`, borderRadius: 8, padding: '18px', margin: '18px 0' }}>
            <div style={{ fontSize: '0.7rem', color: GOLD, letterSpacing: 4, textTransform: 'uppercase' }}>🏆 My Champion Pick</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#e8c86b', marginTop: 5 }}>{picks.finals || '?'}</div>
          </div>
          {!isLocked && (
            <div style={{ textAlign: 'center' }}>
              <button style={s.btn()} onClick={saveBracket} disabled={saving}>
                {saving ? 'Saving...' : saved ? '✅ Saved!' : '💾 Save My Picks'}
              </button>
            </div>
          )}
          <p style={{ textAlign: 'center', color: MUTED, fontSize: '0.68rem', marginTop: 14, letterSpacing: 1 }}>
            {isLocked ? 'Playoffs are underway! 🏀' : `Locks in: ${countdown}`}
          </p>
        </div>
      )}

      {page === 'leaderboard' && (
        <div style={s.page}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: GOLD, letterSpacing: 2 }}>LEADERBOARD</div>
            <button style={{ ...s.btn(), padding: '5px 12px', fontSize: '0.68rem' }} onClick={fetchBrackets}>Refresh</button>
          </div>
          {ranked.length === 0 && <p style={{ color: MUTED, textAlign: 'center', marginTop: 40 }}>No brackets yet!</p>}
          {ranked.map((b, idx) => (
            <div key={b.id} style={{ background: PANEL, border: `1px solid ${idx === 0 ? GOLD : BORDER}`, borderRadius: 6, marginBottom: 10, overflow: 'hidden' }}>
              <div style={{ padding: '12px 14px', cursor: 'pointer' }} onClick={() => setExpanded(expanded === b.id ? null : b.id)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontSize: '1.2rem', width: 28 }}>{idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: '0.95rem', color: idx === 0 ? GOLD : '#e8e8f0' }}>{b.name}</span>
                      {b.champEliminated && <span style={{ fontSize: '0.55rem', background: RED, color: '#fff', padding: '1px 5px', borderRadius: 2, fontWeight: 700 }}>💀 ELIM</span>}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: MUTED, marginTop: 2 }}>{b.picks?.finals || '—'} to win</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: GOLD }}>{b.score}pts</div>
                    <div style={{ fontSize: '0.62rem', color: MUTED }}>max: {b.score + b.maxRemaining}</div>
                    <div style={{ fontSize: '0.65rem', color: b.pct >= 60 ? GREEN : b.pct >= 40 ? GOLD : MUTED }}>{b.pct}% correct</div>
                  </div>
                </div>
                <div style={{ marginTop: 8, background: BORDER, borderRadius: 3, height: 4 }}>
                  <div style={{ width: `${b.pct}%`, background: b.pct >= 60 ? GREEN : b.pct >= 40 ? GOLD : MUTED, height: '100%', borderRadius: 3 }} />
                </div>
              </div>
              {expanded === b.id && (
                <div style={{ borderTop: `1px solid ${BORDER}`, padding: '12px 14px' }}>
                  {renderBracket(b.picks || INITIAL_PICKS, results, false)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
