import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabase';

const ADMIN_PASSWORD = '@cadecunningham2!';
const LOCK_DATE = new Date('2026-04-18T00:00:00-06:00');

const INITIAL_TEAMS = {
  west: {
    1: 'OKC Thunder', 2: 'San Antonio Spurs', 3: 'Denver Nuggets',
    4: 'LA Lakers', 5: 'Houston Rockets', 6: 'Minnesota T-Wolves',
    7: 'TBD (Play-In)', 8: 'TBD (Play-In)',
  },
  east: {
    1: 'Detroit Pistons', 2: 'Boston Celtics', 3: 'New York Knicks',
    4: 'Cleveland Cavaliers', 5: 'Toronto Raptors', 6: 'Atlanta Hawks',
    7: 'TBD (Play-In)', 8: 'TBD (Play-In)',
  }
};

const MATCHUP_ROUND = {
  w1:1,w2:1,w3:1,w4:1,e1:1,e2:1,e3:1,e4:1,
  ws1:2,ws2:2,es1:2,es2:2,wcf:4,ecf:4,finals:8,
};
const POINTS = {1:100,2:200,4:400,8:800};
const ROUND_NAMES = {1:'First Round',2:'Semifinals',4:'Conference Finals',8:'NBA Finals'};
const INITIAL_PICKS = {
  w1:null,w2:null,w3:null,w4:null,ws1:null,ws2:null,wcf:null,
  e1:null,e2:null,e3:null,e4:null,es1:null,es2:null,ecf:null,finals:null,
};

const GOLD='#C8A84B',DARK='#0a0a0f',PANEL='#13131a',BORDER='#2a2a3a';
const MUTED='#777788',WEST_ACC='#dd4444',EAST_ACC='#4488dd';
const GREEN='#2ecc71',RED='#e74c3c';

function calcScore(picks, results) {
  let score=0,correct=0,total=0,maxRemaining=0;
  Object.keys(MATCHUP_ROUND).forEach(m => {
    const pts = POINTS[MATCHUP_ROUND[m]]||100;
    if (picks[m] && results[m]) {
      total++;
      if (picks[m]===results[m]) { score+=pts; correct++; }
    } else if (picks[m] && !results[m]) { maxRemaining+=pts; }
  });
  const pct = total>0 ? Math.round((correct/total)*100) : 0;
  return {score,correct,total,pct,maxRemaining};
}

function getTopChampPicks(allBrackets) {
  const counts = {};
  allBrackets.forEach(b => {
    const champ = b.picks && b.picks.finals;
    if (champ) { counts[champ] = (counts[champ]||0) + 1; }
  });
  return Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,3);
}

function getPickOfRound(allBrackets, results) {
  const rounds = [1,2,4,8];
  const roundWinners = {};
  rounds.forEach(round => {
    const matchupsInRound = Object.keys(MATCHUP_ROUND).filter(m => MATCHUP_ROUND[m]===round);
    const completedMatchups = matchupsInRound.filter(m => results[m]);
    if (completedMatchups.length === 0) return;
    let best = 0;
    let winners = [];
    allBrackets.forEach(b => {
      const correct = completedMatchups.filter(m => b.picks && b.picks[m] === results[m]).length;
      if (correct > best) { best = correct; winners = [b.name]; }
      else if (correct === best && correct > 0) { winners.push(b.name); }
    });
    if (best > 0) roundWinners[round] = { names: winners, correct: best, total: completedMatchups.length };
  });
  return roundWinners;
}

export default function App() {
  const isAdmin = window.location.pathname === '/admin';
  const isLocked = new Date() >= LOCK_DATE;

  const [page, setPage] = useState('home');
  const [name, setName] = useState('');
  const [picks, setPicks] = useState(INITIAL_PICKS);
  const [teams, setTeams] = useState(INITIAL_TEAMS);
  const [results, setResults] = useState({});
  const [series, setSeries] = useState({});
  const [allBrackets, setAllBrackets] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [myId, setMyId] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [countdown, setCountdown] = useState('');
  const [banner, setBanner] = useState(null);
  const [lookupName, setLookupName] = useState('');
  const [lookupError, setLookupError] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [adminPass, setAdminPass] = useState('');
  const [adminAuthed, setAdminAuthed] = useState(false);
  const [adminResults, setAdminResults] = useState({});
  const [adminSeries, setAdminSeries] = useState({});
  const [adminTeams, setAdminTeams] = useState(INITIAL_TEAMS);
  const [adminSaved, setAdminSaved] = useState(false);
  const [adminLookupName, setAdminLookupName] = useState('');
  const [adminLookupError, setAdminLookupError] = useState('');
  const [adminLookupLoading, setAdminLookupLoading] = useState(false);
  const [adminEditId, setAdminEditId] = useState(null);
  const [adminEditName, setAdminEditName] = useState('');
  const [adminEditPicks, setAdminEditPicks] = useState(INITIAL_PICKS);
  const [adminEditSaving, setAdminEditSaving] = useState(false);
  const [adminEditSaved, setAdminEditSaved] = useState(false);
  const bannerTimeout = useRef(null);
  const prevResults = useRef({});

  useEffect(() => { loadResults(); fetchBrackets(); }, []);

  useEffect(() => {
    const tick = () => {
      const diff = LOCK_DATE - new Date();
      if (diff <= 0) { setCountdown('Locked!'); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(d + 'd ' + h + 'h ' + m + 'm ' + s + 's');
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const poll = setInterval(async () => {
      const result = await supabase.from('results').select('*').eq('id', 1).single();
      if (result.data && result.data.results) {
        const newResults = result.data.results;
        const oldResults = prevResults.current;
        Object.entries(newResults).forEach(function(entry) {
          const matchup = entry[0];
          const winner = entry[1];
          if (!oldResults[matchup] && winner) {
            showBanner('🏀 ' + winner + ' wins!');
          }
        });
        if (JSON.stringify(newResults) !== JSON.stringify(oldResults)) {
          setResults(newResults);
          if (result.data.teams) setTeams(result.data.teams);
          if (result.data.series) setSeries(result.data.series);
          prevResults.current = newResults;
        }
      }
    }, 30000);
    return () => clearInterval(poll);
  }, []);

  function showBanner(message) {
    setBanner(message);
    if (bannerTimeout.current) clearTimeout(bannerTimeout.current);
    bannerTimeout.current = setTimeout(function() { setBanner(null); }, 5000);
  }

  async function loadResults() {
    const result = await supabase.from('results').select('*').eq('id', 1).single();
    if (result.data) {
      setResults(result.data.results || {});
      setAdminResults(result.data.results || {});
      setSeries(result.data.series || {});
      setAdminSeries(result.data.series || {});
      prevResults.current = result.data.results || {};
      if (result.data.teams) {
        setTeams(result.data.teams);
        setAdminTeams(result.data.teams);
      }
    }
  }

  async function fetchBrackets() {
    const result = await supabase.from('brackets').select('*').order('created_at', { ascending: true });
    if (result.data) setAllBrackets(result.data);
  }

  async function saveBracket() {
    if (!name.trim()) { alert('Enter your name first!'); return; }
    setSaving(true);
    if (myId) {
      await supabase.from('brackets').update({ picks: picks, name: name }).eq('id', myId);
    } else {
      const result = await supabase.from('brackets').insert([{ name: name.trim(), picks: picks }]).select();
      if (result.data && result.data[0]) setMyId(result.data[0].id);
    }
    setSaving(false);
    setSaved(true);
    setTimeout(function() { setSaved(false); }, 2000);
  }

  async function lookupBracket() {
    if (!lookupName.trim()) return;
    setLookupLoading(true);
    setLookupError('');
    const result = await supabase.from('brackets').select('*').ilike('name', lookupName.trim()).limit(1);
    if (result.data && result.data.length > 0) {
      const b = result.data[0];
      setMyId(b.id);
      setName(b.name);
      setPicks(b.picks || INITIAL_PICKS);
      setPage('bracket');
    } else {
      setLookupError('No bracket found! Check your spelling.');
    }
    setLookupLoading(false);
  }

  async function adminLookupBracket() {
    if (!adminLookupName.trim()) return;
    setAdminLookupLoading(true);
    setAdminLookupError('');
    const result = await supabase.from('brackets').select('*').ilike('name', adminLookupName.trim()).limit(1);
    if (result.data && result.data.length > 0) {
      const b = result.data[0];
      setAdminEditId(b.id);
      setAdminEditName(b.name);
      setAdminEditPicks(b.picks || INITIAL_PICKS);
    } else {
      setAdminLookupError('No bracket found! Check spelling.');
    }
    setAdminLookupLoading(false);
  }

  async function saveAdminEditBracket() {
    if (!adminEditId) return;
    setAdminEditSaving(true);
    await supabase.from('brackets').update({ picks: adminEditPicks, name: adminEditName }).eq('id', adminEditId);
    setAdminEditSaving(false);
    setAdminEditSaved(true);
    setTimeout(function() { setAdminEditSaved(false); }, 2000);
  }

  function adminPickWinner(matchup, team) {
    const newPicks = Object.assign({}, adminEditPicks);
    newPicks[matchup] = team;
    const downstream = {
      w1: ['ws1', 'wcf', 'finals'], w2: ['ws1', 'wcf', 'finals'],
      w3: ['ws2', 'wcf', 'finals'], w4: ['ws2', 'wcf', 'finals'],
      ws1: ['wcf', 'finals'], ws2: ['wcf', 'finals'], wcf: ['finals'],
      e1: ['es1', 'ecf', 'finals'], e2: ['es1', 'ecf', 'finals'],
      e3: ['es2', 'ecf', 'finals'], e4: ['es2', 'ecf', 'finals'],
      es1: ['ecf', 'finals'], es2: ['ecf', 'finals'], ecf: ['finals'],
    };
    if (adminEditPicks[matchup] !== team && downstream[matchup]) {
      downstream[matchup].forEach(function(d) { newPicks[d] = null; });
    }
    setAdminEditPicks(newPicks);
  }

  async function saveAdminResults() {
    const check = await supabase.from('results').select('id').eq('id', 1).single();
    const payload = { results: adminResults, teams: adminTeams, series: adminSeries };
    if (check.data) {
      await supabase.from('results').update(payload).eq('id', 1);
    } else {
      await supabase.from('results').insert([Object.assign({ id: 1 }, payload)]);
    }
    setResults(adminResults);
    setTeams(adminTeams);
    setSeries(adminSeries);
    setAdminSaved(true);
    setTimeout(function() { setAdminSaved(false); }, 2000);
  }

  function pickWinner(matchup, team) {
    if (isLocked) return;
    const newPicks = Object.assign({}, picks);
    newPicks[matchup] = team;
    const downstream = {
      w1: ['ws1', 'wcf', 'finals'], w2: ['ws1', 'wcf', 'finals'],
      w3: ['ws2', 'wcf', 'finals'], w4: ['ws2', 'wcf', 'finals'],
      ws1: ['wcf', 'finals'], ws2: ['wcf', 'finals'], wcf: ['finals'],
      e1: ['es1', 'ecf', 'finals'], e2: ['es1', 'ecf', 'finals'],
      e3: ['es2', 'ecf', 'finals'], e4: ['es2', 'ecf', 'finals'],
      es1: ['ecf', 'finals'], es2: ['ecf', 'finals'], ecf: ['finals'],
    };
    if (picks[matchup] !== team && downstream[matchup]) {
      downstream[matchup].forEach(function(d) { newPicks[d] = null; });
    }
    setPicks(newPicks);
  }

  function getTeamList(id, myPicks) {
    const w = teams.west;
    const e = teams.east;
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

  const sty = {
    page: { padding: '16px 12px' },
    label: { fontSize: '0.68rem', color: MUTED, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 5 },
    input: { background: PANEL, border: '1px solid ' + BORDER, borderRadius: 4, color: '#e8e8f0', fontFamily: 'inherit', fontSize: '1rem', padding: '9px 12px', width: '100%', boxSizing: 'border-box', marginBottom: 14 },
    btn: function(bg, fg) { return { background: bg || GOLD, color: fg || '#000', border: 'none', borderRadius: 3, padding: '11px 24px', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 700, letterSpacing: 2, cursor: 'pointer', textTransform: 'uppercase' }; },
    navBtn: function(active) { return { background: active ? GOLD : 'transparent', color: active ? '#000' : MUTED, border: '1px solid ' + (active ? GOLD : BORDER), borderRadius: 3, padding: '7px 16px', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 700, letterSpacing: 2, cursor: 'pointer', textTransform: 'uppercase' }; },
    secLabel: function(color) { return { fontSize: '0.62rem', fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: color || MUTED, textAlign: 'center', margin: '16px 0 6px' }; },
    mbox: function(conf) { return { background: PANEL, border: '1px solid ' + BORDER, borderRadius: 6, overflow: 'hidden', marginBottom: 7, borderTop: '2px solid ' + (conf === 'west' ? WEST_ACC : conf === 'east' ? EAST_ACC : GOLD) }; },
    trow: function(status) { return { display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', cursor: 'pointer', background: status === 'correct' ? 'rgba(46,204,113,0.1)' : status === 'wrong' ? 'rgba(231,76,60,0.07)' : status === 'selected' ? 'rgba(200,168,75,0.1)' : 'transparent', borderLeft: status === 'correct' ? '3px solid ' + GREEN : status === 'wrong' ? '3px solid ' + RED : status === 'selected' ? '3px solid ' + GOLD : '3px solid transparent' }; },
    seed: { fontSize: '0.62rem', color: MUTED, width: 14, textAlign: 'center', flexShrink: 0 },
    tname: function(status) { return { fontWeight: status === 'correct' || status === 'selected' ? 700 : 400, fontSize: '0.88rem', flex: 1, color: status === 'correct' ? GREEN : status === 'wrong' ? RED : status === 'selected' ? GOLD : '#e8e8f0', textDecoration: status === 'wrong' ? 'line-through' : 'none' }; },
    vs: { textAlign: 'center', fontSize: '0.55rem', color: BORDER, padding: '2px', background: 'rgba(255,255,255,0.02)' },
  };

  function renderMatchup(id, conf, myPicks, myResults, onPick) {
    const t = getTeamList(id, myPicks);
    const seriesData = series[id];
    let seriesLabel = null;
    if (seriesData && (seriesData.w || seriesData.l)) {
      if (myResults[id]) {
        seriesLabel = myResults[id] + ' wins ' + seriesData.w + '-' + seriesData.l;
      } else if (seriesData.leader === 'tied' || seriesData.w === seriesData.l) {
        seriesLabel = 'Tied ' + seriesData.w + '-' + seriesData.l;
      } else if (seriesData.leader) {
        seriesLabel = seriesData.leader + ' leads ' + seriesData.w + '-' + seriesData.l;
      }
    }
    return React.createElement('div', { key: id, style: sty.mbox(conf) },
      t.map(function(team, i) {
        const isSelected = myPicks[id] === team.name && team.name !== '?';
        const hasResult = !!myResults[id];
        const isCorrect = hasResult && myPicks[id] === team.name && myPicks[id] === myResults[id];
        const isWrong = hasResult && myPicks[id] === team.name && myPicks[id] !== myResults[id];
        const status = isCorrect ? 'correct' : isWrong ? 'wrong' : isSelected ? 'selected' : 'none';
        return React.createElement(React.Fragment, { key: i },
          i === 1 ? React.createElement('div', { style: sty.vs }, 'VS') : null,
          React.createElement('div', {
            style: sty.trow(status),
            onClick: function() { if (onPick && team.name !== '?') onPick(id, team.name); }
          },
            React.createElement('span', { style: sty.seed }, team.seed),
            React.createElement('span', { style: sty.tname(status) }, team.name),
            isCorrect ? React.createElement('span', { style: { fontSize: '0.6rem', background: GREEN, color: '#000', padding: '1px 5px', borderRadius: 2, fontWeight: 700 } }, '✓') : null,
            isWrong ? React.createElement('span', { style: { fontSize: '0.6rem', background: RED, color: '#fff', padding: '1px 5px', borderRadius: 2, fontWeight: 700 } }, '✗') : null,
            (!hasResult && isSelected) ? React.createElement('span', { style: { fontSize: '0.6rem', background: GOLD, color: '#000', padding: '1px 5px', borderRadius: 2, fontWeight: 700 } }, 'WIN') : null
          )
        );
      }),
      seriesLabel ? React.createElement('div', { style: { textAlign: 'center', fontSize: '0.65rem', color: GOLD, padding: '4px', background: 'rgba(255,255,255,0.03)', borderTop: '1px solid ' + BORDER, letterSpacing: 1 } }, seriesLabel) : null
    );
  }

  function renderBracket(myPicks, myResults, onPick) {
    return React.createElement('div', null,
      React.createElement('div', { style: sty.secLabel(WEST_ACC) }, '🏀 Western Conference'),
      React.createElement('div', { style: sty.secLabel() }, 'First Round'),
      renderMatchup('w1', 'west', myPicks, myResults, onPick),
      renderMatchup('w2', 'west', myPicks, myResults, onPick),
      renderMatchup('w3', 'west', myPicks, myResults, onPick),
      renderMatchup('w4', 'west', myPicks, myResults, onPick),
      React.createElement('div', { style: sty.secLabel() }, 'Semifinals'),
      renderMatchup('ws1', 'west', myPicks, myResults, onPick),
      renderMatchup('ws2', 'west', myPicks, myResults, onPick),
      React.createElement('div', { style: sty.secLabel() }, 'Conference Finals'),
      renderMatchup('wcf', 'west', myPicks, myResults, onPick),
      React.createElement('div', { style: { marginTop: 20 } }),
      React.createElement('div', { style: sty.secLabel(EAST_ACC) }, '🏀 Eastern Conference'),
      React.createElement('div', { style: sty.secLabel() }, 'First Round'),
      renderMatchup('e1', 'east', myPicks, myResults, onPick),
      renderMatchup('e2', 'east', myPicks, myResults, onPick),
      renderMatchup('e3', 'east', myPicks, myResults, onPick),
      renderMatchup('e4', 'east', myPicks, myResults, onPick),
      React.createElement('div', { style: sty.secLabel() }, 'Semifinals'),
      renderMatchup('es1', 'east', myPicks, myResults, onPick),
      renderMatchup('es2', 'east', myPicks, myResults, onPick),
      React.createElement('div', { style: sty.secLabel() }, 'Conference Finals'),
      renderMatchup('ecf', 'east', myPicks, myResults, onPick),
      React.createElement('div', { style: { marginTop: 20 } }),
      React.createElement('div', { style: sty.secLabel(GOLD) }, '🏆 NBA Finals'),
      renderMatchup('finals', 'finals', myPicks, myResults, onPick)
    );
  }

  const topChampPicks = getTopChampPicks(allBrackets);
  const pickOfRound = getPickOfRound(allBrackets, results);
  const ranked = allBrackets.map(function(b) {
    const scores = calcScore(b.picks || {}, results);
    const champEliminated = b.picks && b.picks.finals && Object.keys(results).some(function(m) {   const winner = results[m];   const teamList = getTeamList(m, b.picks || INITIAL_PICKS);   return teamList.some(function(t) { return t.name === b.picks.finals; }) && winner && winner !== b.picks.finals; });
    return Object.assign({}, b, scores, { champEliminated: champEliminated });
  }).sort(function(a, b) { return b.score - a.score; });

  const adminMatchups = [
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

  if (isAdmin) {
    return (
      <div style={{ minHeight: '100vh', background: DARK, color: '#e8e8f0', fontFamily: "'Barlow Condensed','Arial Narrow',sans-serif", padding: '0 0 60px' }}>
        <div style={{ textAlign: 'center', padding: '20px 16px 14px', borderBottom: '1px solid ' + BORDER }}>
          <div style={{ fontSize: '2rem', fontWeight: 700, letterSpacing: 3, color: GOLD }}>NBA 2026 BRACKET</div>
          <div style={{ fontSize: '0.75rem', color: MUTED, letterSpacing: 2, marginTop: 3 }}>ADMIN PANEL</div>
        </div>
        <div style={sty.page}>
          {!adminAuthed ? (
            <div style={{ maxWidth: 320, margin: '60px auto' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: GOLD, letterSpacing: 2, marginBottom: 20, textAlign: 'center' }}>🔒 ADMIN LOGIN</div>
              <div style={sty.label}>Password</div>
              <input style={sty.input} type="password" placeholder="Password..." value={adminPass} onChange={function(e) { setAdminPass(e.target.value); }} />
              <button style={Object.assign({}, sty.btn(), { width: '100%' })} onClick={function() { if (adminPass === ADMIN_PASSWORD) setAdminAuthed(true); else alert('Wrong password!'); }}>Login</button>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: GOLD, letterSpacing: 2, marginBottom: 16 }}>ENTER RESULTS</div>
              <div style={{ background: PANEL, border: '1px solid ' + BORDER, borderRadius: 6, padding: 12, marginBottom: 14 }}>
                <div style={{ fontSize: '0.65rem', color: GOLD, letterSpacing: 2, marginBottom: 10 }}>PLAY-IN SEEDS (7 & 8)</div>
                {['west', 'east'].map(function(conf) {
                  return (
                    <div key={conf} style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: '0.62rem', color: conf === 'west' ? WEST_ACC : EAST_ACC, letterSpacing: 2, marginBottom: 5 }}>{conf.toUpperCase()}</div>
                      {[7, 8].map(function(seed) {
                        return (
                          <div key={seed} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <span style={{ fontSize: '0.7rem', color: MUTED, width: 50 }}>Seed {seed}:</span>
                            <input style={Object.assign({}, sty.input, { marginBottom: 0, flex: 1, fontSize: '0.85rem', padding: '6px 10px' })}
                              placeholder={conf + ' ' + seed + ' seed...'} value={adminTeams[conf][seed]}
                              onChange={function(e) {
                                const val = e.target.value;
                                setAdminTeams(function(prev) {
                                  const next = Object.assign({}, prev);
                                  next[conf] = Object.assign({}, prev[conf]);
                                  next[conf][seed] = val;
                                  return next;
                                });
                              }} />
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>

              {adminMatchups.map(function(item) {
                const id = item.id;
                const label = item.label;
                const mTeams = item.teams;
                const ser = adminSeries[id] || { w: '', l: '', leader: '' };
                return (
                  <div key={id} style={{ background: PANEL, border: '1px solid ' + BORDER, borderRadius: 6, padding: '10px 12px', marginBottom: 8 }}>
                    <div style={{ fontSize: '0.62rem', color: MUTED, letterSpacing: 2, marginBottom: 7 }}>{label}</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                      {mTeams.length > 0 ? mTeams.map(function(team) {
                        return (
                          <button key={team} style={Object.assign({}, sty.btn(adminResults[id] === team ? GREEN : PANEL, adminResults[id] === team ? '#000' : '#e8e8f0'), { border: '1px solid ' + (adminResults[id] === team ? GREEN : BORDER), padding: '6px 12px', fontSize: '0.78rem' })}
                            onClick={function() {
                              setAdminResults(function(prev) {
                                const next = Object.assign({}, prev);
                                next[id] = team;
                                return next;
                              });
                            }}>{team}</button>
                        );
                      }) : React.createElement('span', { style: { fontSize: '0.75rem', color: MUTED } }, 'Enter earlier rounds first')}
                      {adminResults[id] ? (
                        <button style={Object.assign({}, sty.btn(PANEL, RED), { border: '1px solid ' + RED, padding: '6px 10px', fontSize: '0.75rem' })}
                          onClick={function() {
                            setAdminResults(function(prev) {
                              const next = Object.assign({}, prev);
                              delete next[id];
                              return next;
                            });
                          }}>Clear</button>
                      ) : null}
                    </div>
                    {mTeams.length > 0 ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.65rem', color: MUTED }}>Series:</span>
                        <select style={{ background: PANEL, border: '1px solid ' + BORDER, borderRadius: 3, color: '#e8e8f0', padding: '4px 8px', fontSize: '0.8rem' }}
                          value={ser.leader || ''}
                          onChange={function(e) {
                            const val = e.target.value;
                            setAdminSeries(function(prev) {
                              const next = Object.assign({}, prev);
                              next[id] = Object.assign({}, ser, { leader: val });
                              return next;
                            });
                          }}>
                          <option value="">Leader...</option>
                          {mTeams.map(function(t) { return React.createElement('option', { key: t, value: t }, t); })}
                          <option value="tied">Tied</option>
                        </select>
                        <input type="number" min="0" max="4" style={{ background: PANEL, border: '1px solid ' + BORDER, borderRadius: 3, color: '#e8e8f0', padding: '4px 6px', fontSize: '0.8rem', width: 46 }}
                          placeholder="W" value={ser.w || ''}
                          onChange={function(e) {
                            const val = e.target.value;
                            setAdminSeries(function(prev) {
                              const next = Object.assign({}, prev);
                              next[id] = Object.assign({}, ser, { w: val });
                              return next;
                            });
                          }} />
                        <span style={{ color: MUTED }}>-</span>
                        <input type="number" min="0" max="4" style={{ background: PANEL, border: '1px solid ' + BORDER, borderRadius: 3, color: '#e8e8f0', padding: '4px 6px', fontSize: '0.8rem', width: 46 }}
                          placeholder="L" value={ser.l || ''}
                          onChange={function(e) {
                            const val = e.target.value;
                            setAdminSeries(function(prev) {
                              const next = Object.assign({}, prev);
                              next[id] = Object.assign({}, ser, { l: val });
                              return next;
                            });
                          }} />
                      </div>
                    ) : null}
                  </div>
                );
              })}

              <div style={{ textAlign: 'center', marginTop: 16, marginBottom: 32 }}>
                <button style={sty.btn()} onClick={saveAdminResults}>{adminSaved ? '✅ Saved!' : '💾 Save Results'}</button>
              </div>

              <div style={{ borderTop: '1px solid ' + BORDER, paddingTop: 24 }}>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: GOLD, letterSpacing: 2, marginBottom: 16 }}>✏️ EDIT A PLAYER'S BRACKET</div>
                <input style={sty.input} placeholder="Type player name exactly..." value={adminLookupName} onChange={function(e) { setAdminLookupName(e.target.value); }} autoComplete="off" />
                {adminLookupError ? <div style={{ fontSize: '0.75rem', color: RED, marginBottom: 10 }}>{adminLookupError}</div> : null}
                <button style={Object.assign({}, sty.btn(), { width: '100%', marginBottom: 16 })} onClick={adminLookupBracket} disabled={adminLookupLoading}>
                  {adminLookupLoading ? 'Looking up...' : 'Find Bracket'}
                </button>
                {adminEditId ? (
                  <div style={{ background: PANEL, border: '1px solid ' + GOLD, borderRadius: 6, padding: 12 }}>
                    <div style={{ fontSize: '0.75rem', color: GOLD, fontWeight: 700, marginBottom: 12 }}>Editing: {adminEditName}</div>
                    {renderBracket(adminEditPicks, results, adminPickWinner)}
                    <div style={{ textAlign: 'center', marginTop: 16 }}>
                      <button style={sty.btn()} onClick={saveAdminEditBracket} disabled={adminEditSaving}>
                        {adminEditSaving ? 'Saving...' : adminEditSaved ? '✅ Saved!' : '💾 Save Bracket'}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: DARK, color: '#e8e8f0', fontFamily: "'Barlow Condensed','Arial Narrow',sans-serif", padding: '0 0 60px' }}>
      <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700&display=swap" rel="stylesheet" />

      {banner ? (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999, background: GREEN, color: '#000', textAlign: 'center', padding: '14px', fontFamily: "'Barlow Condensed',sans-serif", fontSize: '1.1rem', fontWeight: 700, letterSpacing: 2, boxShadow: '0 4px 20px rgba(0,0,0,0.5)', cursor: 'pointer' }} onClick={function() { setBanner(null); }}>
          {banner} <span style={{ opacity: 0.6, fontSize: '0.8rem', marginLeft: 8 }}>tap to dismiss</span>
        </div>
      ) : null}

      <div style={{ textAlign: 'center', padding: '20px 16px 14px', borderBottom: '1px solid ' + BORDER, marginTop: banner ? 52 : 0 }}>
        <div style={{ fontSize: '2rem', fontWeight: 700, letterSpacing: 3, color: GOLD }}>NBA 2026 BRACKET</div>
        <div style={{ fontSize: '0.75rem', color: MUTED, letterSpacing: 2, marginTop: 3 }}>PLAYOFF PREDICTIONS</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid ' + BORDER }}>
        <button style={sty.navBtn(page === 'home')} onClick={function() { setPage('home'); }}>Home</button>
        <button style={sty.navBtn(page === 'bracket')} onClick={function() { setPage('bracket'); }}>My Picks</button>
        <button style={sty.navBtn(page === 'leaderboard')} onClick={function() { fetchBrackets(); setPage('leaderboard'); }}>Leaderboard</button>
      </div>

      {page === 'home' ? (
        <div style={Object.assign({}, sty.page, { textAlign: 'center', paddingTop: 28 })}>
          <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>🏀</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 700, color: GOLD, letterSpacing: 2, marginBottom: 4 }}>NBA 2026 PLAYOFFS</div>
          {!isLocked ? (
            <div style={{ background: PANEL, border: '1px solid ' + GOLD, borderRadius: 8, padding: '14px 20px', margin: '16px auto', maxWidth: 280, display: 'inline-block' }}>
              <div style={{ fontSize: '0.6rem', color: GOLD, letterSpacing: 3, marginBottom: 4 }}>⏰ BRACKETS LOCK IN</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#e8c86b', letterSpacing: 2 }}>{countdown}</div>
            </div>
          ) : (
            <div style={{ background: 'rgba(231,76,60,0.1)', border: '1px solid ' + RED, borderRadius: 8, padding: '10px 20px', margin: '16px auto', maxWidth: 280, display: 'inline-block' }}>
              <div style={{ fontSize: '0.9rem', color: RED, fontWeight: 700 }}>🔒 Brackets Locked!</div>
            </div>
          )}

          {topChampPicks.length > 0 ? (
            <div style={{ background: PANEL, border: '1px solid ' + BORDER, borderRadius: 8, padding: '14px', margin: '12px auto', maxWidth: 300, textAlign: 'left' }}>
              <div style={{ fontSize: '0.6rem', color: GOLD, letterSpacing: 3, marginBottom: 10, textAlign: 'center' }}>🔥 MOST POPULAR CHAMPION PICKS</div>
              {topChampPicks.map(function(entry, i) {
                const team = entry[0];
                const count = entry[1];
                return (
                  <div key={team} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: i < topChampPicks.length - 1 ? '1px solid ' + BORDER : 'none' }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'} {team}</span>
                    <span style={{ fontSize: '0.7rem', color: MUTED }}>{count} of {allBrackets.length} picks</span>
                  </div>
                );
              })}
            </div>
          ) : null}

          {Object.keys(pickOfRound).length > 0 ? (
            <div style={{ background: PANEL, border: '1px solid ' + BORDER, borderRadius: 8, padding: '14px', margin: '12px auto', maxWidth: 300, textAlign: 'left' }}>
              <div style={{ fontSize: '0.6rem', color: GOLD, letterSpacing: 3, marginBottom: 10, textAlign: 'center' }}>👑 PICK OF THE ROUND</div>
              {Object.entries(pickOfRound).reverse().map(function(entry) {
                const round = entry[0];
                const data = entry[1];
                return (
                  <div key={round} style={{ padding: '6px 0', borderBottom: '1px solid ' + BORDER }}>
                    <div style={{ fontSize: '0.6rem', color: MUTED, letterSpacing: 2, marginBottom: 3 }}>{ROUND_NAMES[round]}</div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: GOLD }}>👑 {data.names.join(', ')}</div>
                    <div style={{ fontSize: '0.65rem', color: MUTED }}>{data.correct}/{data.total} correct</div>
                  </div>
                );
              })}
            </div>
          ) : null}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 260, margin: '16px auto 0' }}>
            {!isLocked ? <button style={sty.btn()} onClick={function() { setPicks(INITIAL_PICKS); setMyId(null); setPage('bracket'); }}>📝 Fill Out My Bracket</button> : null}
            {!isLocked ? <button style={Object.assign({}, sty.btn(PANEL, MUTED), { border: '1px solid ' + BORDER })} onClick={function() { setPage('edit'); }}>✏️ Edit My Bracket</button> : null}
            <button style={Object.assign({}, sty.btn(PANEL, MUTED), { border: '1px solid ' + BORDER })} onClick={function() { fetchBrackets(); setPage('leaderboard'); }}>🏆 Leaderboard</button>
          </div>
          <p style={{ color: MUTED, fontSize: '0.65rem', marginTop: 20, letterSpacing: 1 }}>Play-In: April 14-17 · Playoffs Begin: April 18</p>
        </div>
      ) : null}

      {page === 'edit' ? (
        <div style={Object.assign({}, sty.page, { maxWidth: 340, margin: '0 auto' })}>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: GOLD, letterSpacing: 2, marginBottom: 16 }}>✏️ EDIT MY BRACKET</div>
          <div style={sty.label}>Your Name</div>
          <input style={sty.input} placeholder="Enter your name exactly as saved..." value={lookupName} onChange={function(e) { setLookupName(e.target.value); }} autoComplete="off" />
          {lookupError ? <div style={{ fontSize: '0.75rem', color: RED, marginBottom: 10 }}>{lookupError}</div> : null}
          <button style={Object.assign({}, sty.btn(), { width: '100%' })} onClick={lookupBracket} disabled={lookupLoading}>
            {lookupLoading ? 'Looking up...' : 'Find My Bracket'}
          </button>
          <p style={{ color: MUTED, fontSize: '0.7rem', marginTop: 12, textAlign: 'center' }}>Spell your name exactly as you entered it!</p>
        </div>
      ) : null}

      {page === 'bracket' ? (
        <div style={sty.page}>
          {isLocked ? (
            <div style={{ background: 'rgba(231,76,60,0.1)', border: '1px solid ' + RED, borderRadius: 6, padding: 12, marginBottom: 14, textAlign: 'center' }}>
              <div style={{ fontSize: '0.9rem', color: RED, fontWeight: 700 }}>🔒 Brackets are locked!</div>
            </div>
          ) : null}
          <div style={sty.label}>Your Name</div>
          <input style={sty.input} placeholder="Enter your name..." defaultValue={name} onBlur={function(e) { setName(e.target.value); }} autoComplete="off" />
          {renderBracket(picks, results, isLocked ? null : pickWinner)}
          <div style={{ textAlign: 'center', background: 'linear-gradient(135deg,rgba(200,168,75,0.15),rgba(200,168,75,0.05))', border: '1px solid rgba(200,168,75,0.4)', borderRadius: 8, padding: '18px', margin: '18px 0' }}>
            <div style={{ fontSize: '0.7rem', color: GOLD, letterSpacing: 4, textTransform: 'uppercase' }}>🏆 My Champion Pick</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#e8c86b', marginTop: 5 }}>{picks.finals || '?'}</div>
          </div>
          {!isLocked ? (
            <div style={{ textAlign: 'center' }}>
              <button style={sty.btn()} onClick={saveBracket} disabled={saving}>
                {saving ? 'Saving...' : saved ? '✅ Saved!' : '💾 Save My Picks'}
              </button>
            </div>
          ) : null}
          <p style={{ textAlign: 'center', color: MUTED, fontSize: '0.68rem', marginTop: 14, letterSpacing: 1 }}>
            {isLocked ? 'Playoffs are underway! 🏀' : 'Locks in: ' + countdown}
          </p>
        </div>
      ) : null}

      {page === 'leaderboard' ? (
        <div style={sty.page}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: GOLD, letterSpacing: 2 }}>LEADERBOARD</div>
            <button style={Object.assign({}, sty.btn(), { padding: '5px 12px', fontSize: '0.68rem' })} onClick={fetchBrackets}>Refresh</button>
          </div>
          {ranked.length === 0 ? <p style={{ color: MUTED, textAlign: 'center', marginTop: 40 }}>No brackets yet!</p> : null}
          {ranked.map(function(b, idx) {
            return (
              <div key={b.id} style={{ background: PANEL, border: '1px solid ' + (idx === 0 ? GOLD : BORDER), borderRadius: 6, marginBottom: 10, overflow: 'hidden' }}>
                <div style={{ padding: '12px 14px', cursor: 'pointer' }} onClick={function() { setExpanded(expanded === b.id ? null : b.id); }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ fontSize: '1.2rem', width: 28 }}>{idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : (idx + 1) + '.'}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: idx === 0 ? GOLD : '#e8e8f0' }}>{b.name}</span>
                        {b.champEliminated ? <span style={{ fontSize: '0.55rem', background: RED, color: '#fff', padding: '1px 5px', borderRadius: 2, fontWeight: 700 }}>💀 ELIM</span> : null}
                        {Object.entries(pickOfRound).some(function(entry) { return entry[1].names.includes(b.name); }) ? <span style={{ fontSize: '0.55rem', background: GOLD, color: '#000', padding: '1px 5px', borderRadius: 2, fontWeight: 700 }}>👑 ROUND WINNER</span> : null}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: MUTED, marginTop: 2 }}>{b.picks && b.picks.finals ? b.picks.finals : '—'} to win</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: GOLD }}>{b.score}pts</div>
                      <div style={{ fontSize: '0.62rem', color: MUTED }}>max: {b.score + b.maxRemaining}</div>
                      <div style={{ fontSize: '0.65rem', color: b.pct >= 60 ? GREEN : b.pct >= 40 ? GOLD : MUTED }}>{b.pct}% correct</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 8, background: BORDER, borderRadius: 3, height: 4 }}>
                    <div style={{ width: b.pct + '%', background: b.pct >= 60 ? GREEN : b.pct >= 40 ? GOLD : MUTED, height: '100%', borderRadius: 3 }} />
                  </div>
                </div>
                {expanded === b.id ? (
                  <div style={{ borderTop: '1px solid ' + BORDER, padding: '12px 14px' }}>
                    {renderBracket(b.picks || INITIAL_PICKS, results, null)}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
