'use strict';

const API_BASE = 'https://pokeapi.co/api/v2/pokemon/';
const POKEMON_CACHE_KEY = 'pokeDraft_gen1_v1';
const CAREER_KEY = 'pokeDraft_career_v1';
const SETTINGS_KEY = 'pokeDraft_settings_v1';
const TOTAL_POKEMON = 151;
const TEAM_COUNT = 8;
const ROSTER_SIZE = 6;
const TOTAL_PICKS = TEAM_COUNT * ROSTER_SIZE;
const LEGENDARY_IDS = new Set([144,145,146,150,151]);
const KANTO_FINAL_STARTERS = new Set([3,6,9]);

const CHALLENGES = [
  { id:'no_legends', code:'NL', name:'No Legends', description:'Win a championship without drafting Articuno, Zapdos, Moltres, Mewtwo or Mew.' },
  { id:'professor_oak', code:'PO', name:'Professor Oak', description:'Win a championship with at least six unique types represented on your roster.' },
  { id:'underdogs', code:'UD', name:'Underdogs', description:'Win a championship without drafting any Pokémon projected in the top 10.' },
  { id:'kanto_starter', code:'KS', name:'Kanto Starter', description:'Win a championship with Venusaur, Charizard or Blastoise on your roster.' },
  { id:'mono_master', code:'MM', name:'Mono Master', description:'Win a championship with at least three Pokémon sharing the same type.' },
  { id:'perfect_season', code:'14', name:'Perfect Season', description:'Finish the regular season 14-0 and win the championship.' },
  { id:'from_bottom', code:'4', name:'From the Bottom', description:'Win the championship as the number 4 playoff seed.' }
];

const app = document.getElementById('app');

let deferredInstallPrompt = null;
let appInstallStatus = '';

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  appInstallStatus = '';
  syncInstallButton();
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  appInstallStatus = 'Pokémon Draft League is installed.';
  syncInstallButton();
  toast('App installed');
});

const TYPE_CHART = {
  normal:   { rock:.5, ghost:0, steel:.5 },
  fire:     { fire:.5, water:.5, grass:2, ice:2, bug:2, rock:.5, dragon:.5, steel:2 },
  water:    { fire:2, water:.5, grass:.5, ground:2, rock:2, dragon:.5 },
  electric: { water:2, electric:.5, grass:.5, ground:0, flying:2, dragon:.5 },
  grass:    { fire:.5, water:2, grass:.5, poison:.5, ground:2, flying:.5, bug:.5, rock:2, dragon:.5, steel:.5 },
  ice:      { fire:.5, water:.5, grass:2, ice:.5, ground:2, flying:2, dragon:2, steel:.5 },
  fighting: { normal:2, ice:2, poison:.5, flying:.5, psychic:.5, bug:.5, rock:2, ghost:0, dark:2, steel:2, fairy:.5 },
  poison:   { grass:2, poison:.5, ground:.5, rock:.5, ghost:.5, steel:0, fairy:2 },
  ground:   { fire:2, electric:2, grass:.5, poison:2, flying:0, bug:.5, rock:2, steel:2 },
  flying:   { electric:.5, grass:2, fighting:2, bug:2, rock:.5, steel:.5 },
  psychic:  { fighting:2, poison:2, psychic:.5, dark:0, steel:.5 },
  bug:      { fire:.5, grass:2, fighting:.5, poison:.5, flying:.5, psychic:2, ghost:.5, dark:2, steel:.5, fairy:.5 },
  rock:     { fire:2, ice:2, fighting:.5, ground:.5, flying:2, bug:2, steel:.5 },
  ghost:    { normal:0, psychic:2, ghost:2, dark:.5 },
  dragon:   { dragon:2, steel:.5, fairy:0 },
  dark:     { fighting:.5, psychic:2, ghost:2, dark:.5, fairy:.5 },
  steel:    { fire:.5, water:.5, electric:.5, ice:2, rock:2, steel:.5, fairy:2 },
  fairy:    { fire:.5, fighting:2, poison:.5, dragon:2, dark:2, steel:.5 }
};

const CPU_ARCHETYPES = [
  { key:'power', name:'Powerhouse', blurb:'Prioritizes overall strength and attacking stats.' },
  { key:'speed', name:'Speed Demon', blurb:'Chases fast Pokémon and offensive pressure.' },
  { key:'balanced', name:'Balanced', blurb:'Values strong stats without sacrificing coverage.' },
  { key:'defense', name:'Defense First', blurb:'Builds around HP, Defense and Special Defense.' },
  { key:'coverage', name:'Coverage Hunter', blurb:'Avoids duplicate types and patches weaknesses.' },
  { key:'value', name:'Value Drafter', blurb:'Follows the board and punishes falling talent.' },
  { key:'wildcard', name:'Wildcard', blurb:'Unpredictable. Reaches, steals and creates chaos.' }
];

const CPU_NAMES = [
  'Lavender Ghosts', 'Cerulean Surge', 'Pewter Titans', 'Cinnabar Burn',
  'Viridian Force', 'Saffron Psyche', 'Fuchsia Fangs', 'Indigo Elite',
  'Celadon Bloom', 'Seafoam Storm', 'Mt. Moon Meteors', 'Power Plant'
];

const state = {
  screen: 'home',
  pokemon: [],
  league: null,
  draft: null,
  season: null,
  modal: null,
  loadingText: 'Loading Pokémon data...',
  championsReturn: 'home'
};

const careerDefaults = {
  drafts: 0,
  championships: 0,
  playoffTrips: 0,
  totalWins: 0,
  totalLosses: 0,
  bestWins: 0,
  pokemonDraftCounts: {},
  pokemonSeasonWins: {},
  championshipTeams: [],
  challengeBadges: {}
};
const career = Object.assign({}, careerDefaults, loadJSON(CAREER_KEY, careerDefaults));
career.pokemonDraftCounts = career.pokemonDraftCounts || {};
career.pokemonSeasonWins = career.pokemonSeasonWins || {};
career.championshipTeams = Array.isArray(career.championshipTeams) ? career.championshipTeams : [];
career.challengeBadges = career.challengeBadges && typeof career.challengeBadges==='object' ? career.challengeBadges : {};

const savedSettings = loadJSON(SETTINGS_KEY, { teamName: 'Kanto Kings' });

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}
function clamp(v,min,max){ return Math.max(min, Math.min(max,v)); }
function avg(arr){ return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0; }
function sum(arr){ return arr.reduce((a,b)=>a+b,0); }
function shuffle(arr){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function titleCase(str){ return str.split('-').map(x=>x.charAt(0).toUpperCase()+x.slice(1)).join(' '); }
function ordinal(n){ const s=['th','st','nd','rd'], v=n%100; return `${n}${s[(v-20)%10]||s[v]||s[0]}`; }
function sleep(ms){ return new Promise(resolve=>setTimeout(resolve,ms)); }

function spriteFallback(id){
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
}

async function fetchPokemon(id){
  const res = await fetch(`${API_BASE}${id}`);
  if(!res.ok) throw new Error(`PokéAPI request failed for #${id}`);
  const p = await res.json();
  const stats = Object.fromEntries(p.stats.map(s => [s.stat.name, s.base_stat]));
  const types = p.types.sort((a,b)=>a.slot-b.slot).map(t=>t.type.name);
  const sprite = p.sprites?.other?.['official-artwork']?.front_default || p.sprites?.front_default || spriteFallback(id);
  return {
    id: p.id,
    name: titleCase(p.name),
    apiName: p.name,
    types,
    hp: stats.hp || 1,
    atk: stats.attack || 1,
    def: stats.defense || 1,
    spa: stats['special-attack'] || 1,
    spd: stats['special-defense'] || 1,
    spe: stats.speed || 1,
    sprite
  };
}

function enrichPokemon(list){
  const scored = list.map(p => {
    const bst = p.hp+p.atk+p.def+p.spa+p.spd+p.spe;
    const offense = Math.max(p.atk,p.spa) * .62 + p.spe * .28 + bst * .10;
    const bulk = p.hp * .34 + p.def * .33 + p.spd * .33;
    const projectionScore = bst*.52 + offense*.28 + bulk*.14 + p.spe*.06;
    return { ...p, bst, offense, bulk, projectionScore };
  }).sort((a,b)=>b.projectionScore-a.projectionScore);
  scored.forEach((p,i)=>p.projRank=i+1);
  return scored.sort((a,b)=>a.id-b.id);
}

async function loadPokemonData(){
  const cached = loadJSON(POKEMON_CACHE_KEY, null);
  if(cached?.length === TOTAL_POKEMON) return enrichPokemon(cached);

  const results = [];
  const queue = Array.from({length:TOTAL_POKEMON},(_,i)=>i+1);
  const workers = Array.from({length:10}, async (_,workerIndex)=>{
    while(queue.length){
      const id = queue.shift();
      if(!id) break;
      state.loadingText = `Loading Gen 1 data... ${results.length}/${TOTAL_POKEMON}`;
      if(results.length % 8 === 0) renderLoading();
      let attempts=0;
      while(attempts<3){
        try { results.push(await fetchPokemon(id)); break; }
        catch(err){ attempts++; if(attempts>=3) throw err; await sleep(350*attempts); }
      }
    }
  });
  await Promise.all(workers);
  results.sort((a,b)=>a.id-b.id);
  saveJSON(POKEMON_CACHE_KEY, results);
  return enrichPokemon(results);
}

function renderLoading(){
  app.innerHTML = `<div class="loading-screen"><div class="ball-loader"></div><h1>Pokémon Draft League</h1><p>${state.loadingText}</p></div>`;
}

function shell(content, actions=''){
  return `<main class="shell">
    <header class="topbar">
      <div class="brand"><span class="brand-ball"></span><span>Pokémon Draft League</span></div>
      <div class="top-actions">${actions}<button class="settings-cog" id="settingsButton" type="button" aria-label="Settings and how to play" title="Settings">⚙️</button></div>
    </header>
    ${content}
  </main>`;
}

function render(){
  if(state.screen==='home') return renderHome();
  if(state.screen==='setup') return renderSetup();
  if(state.screen==='draft') return renderDraft();
  if(state.screen==='grade') return renderGrade();
  if(state.screen==='season') return renderSeason();
  if(state.screen==='hall') return renderHallOfFame();
  if(state.screen==='champions') return renderChampionshipTeams();
  if(state.screen==='recap') return renderRecap();
  if(state.screen==='challenges') return renderChallenges();
}

function goldBadgeHTML(size=''){
  return `<span class="gold-badge ${size}" title="League Champion" aria-label="League Champion"><span>★</span></span>`;
}

function formatChampionshipDate(iso){
  if(!iso) return 'Championship season';
  const d=new Date(iso);
  if(Number.isNaN(d.getTime())) return 'Championship season';
  try { return new Intl.DateTimeFormat(undefined,{year:'numeric',month:'short',day:'numeric'}).format(d); }
  catch { return d.toLocaleDateString(); }
}


function trainerBadgeHTML(challenge,earned=false,size=''){
  return `<div class="trainer-badge ${earned?'earned':'locked'} ${size}" title="${escapeHTML(challenge.name)}"><span>${challenge.code}</span></div>`;
}

function renderChallenges(){
  const earnedCount=Object.keys(career.challengeBadges).length;
  app.innerHTML=shell(`<div class="section-title"><div><h1>Trainer Badges</h1><p>${earnedCount} of ${CHALLENGES.length} earned. Badges are permanent on this device.</p></div></div>
    <section class="badge-case">${CHALLENGES.map(ch=>{
      const earned=career.challengeBadges[ch.id];
      return `<article class="challenge-card ${earned?'earned':''}">${trainerBadgeHTML(ch,!!earned,'large')}<div><div class="challenge-status">${earned?'EARNED':'LOCKED'}</div><h2>${ch.name}</h2><p>${ch.description}</p>${earned?`<small>Earned ${formatChampionshipDate(earned.earnedAt)}${earned.titleNumber?` • Title #${earned.titleNumber}`:''}</small>`:''}</div></article>`;
    }).join('')}</section>`, `<button class="btn ghost" id="backHome">Back</button>`);
  document.getElementById('backHome').onclick=()=>{state.screen='home';render();};
}

function renderHome(){
  const champRate = career.drafts ? Math.round(career.championships/career.drafts*100) : 0;
  const badgeCount=Object.keys(career.challengeBadges).length;
  app.innerHTML = shell(`<section class="hero"><div class="hero-card">
    <div class="eyebrow">Gen 1 • 8 Teams • 6 Rounds</div>
    <h1>Draft.<br>Build.<br>Battle.</h1>
    <p>Compete against seven CPU general managers in a six-round snake draft. Build a balanced roster, set your weekly battle order, then chase a championship and trainer badges.</p>
    <div class="hero-actions"><button class="btn primary" id="newLeagueBtn">Start New League</button><button class="btn" id="careerBtn">Career Stats</button><button class="btn" id="challengesBtn">Trainer Badges</button><button class="btn gold" id="championsBtn">Championship Teams</button></div>
    <div class="stat-strip four">
      <div class="stat-box"><b>${career.drafts}</b><span>Drafts</span></div>
      <div class="stat-box title-stat"><div class="title-stat-line"><b>${career.championships}</b>${career.championships?goldBadgeHTML('tiny'):''}</div><span>Titles</span></div>
      <div class="stat-box"><b>${badgeCount}/${CHALLENGES.length}</b><span>Badges</span></div>
      <div class="stat-box"><b>${champRate}%</b><span>Title Rate</span></div>
    </div>
  </div></section>`);
  document.getElementById('newLeagueBtn').onclick = ()=>{ state.screen='setup'; render(); };
  document.getElementById('careerBtn').onclick = showCareerModal;
  document.getElementById('challengesBtn').onclick = ()=>{state.screen='challenges';render();};
  document.getElementById('championsBtn').onclick = ()=>{state.championsReturn='home';state.screen='champions';render();};
}

function renderSetup(){
  app.innerHTML = shell(`<div class="section-title"><div><h1>League Setup</h1><p>Eight teams. Six rounds. One champion.</p></div></div>
  <div class="setup-grid">
    <section class="panel">
      <div class="field"><label>Your Team Name</label><input id="teamName" maxlength="24" value="${escapeHTML(savedSettings.teamName)}"></div>
      <div class="draft-lottery-teaser">
        <div class="draft-lottery-teaser-ball" aria-hidden="true"></div>
        <div><strong>Draft position is randomized</strong><p>Your starting slot will be drawn from picks 1 through 8. The draft snakes each round, so every position creates a different board.</p></div>
      </div>
      <button class="btn primary lottery-start-btn" id="beginDraftBtn">Draw Draft Position</button>
    </section>
    <aside class="panel"><h3>League Format</h3><div class="cpu-list">
      <div class="cpu-row"><strong>8 Teams</strong><span>7 CPU opponents</span></div>
      <div class="cpu-row"><strong>6 Rounds</strong><span>Snake draft</span></div>
      <div class="cpu-row"><strong>14 Games</strong><span>Everyone twice</span></div>
      <div class="cpu-row"><strong>Top 4</strong><span>Make playoffs</span></div>
      <div class="cpu-row"><strong>Draft Slot</strong><span>Random draw</span></div>
    </div></aside>
  </div>`, `<button class="btn ghost" id="backBtn">Back</button>`);
  document.getElementById('backBtn').onclick=()=>{state.screen='home';render();};
  document.getElementById('beginDraftBtn').onclick=()=>{
    const name=(document.getElementById('teamName').value||'Kanto Kings').trim().slice(0,24);
    savedSettings.teamName=name; saveJSON(SETTINGS_KEY,savedSettings);
    showDraftLottery(name);
  };
}

function createDraftLottery(teamName){
  const cpuNamePool=shuffle(CPU_NAMES).slice(0,7);
  const archetypes=shuffle(CPU_ARCHETYPES);
  const entrants=[{id:'user',name:teamName,user:true,archetype:{key:'user',name:'You'},roster:[]}];
  cpuNamePool.forEach((name,i)=>entrants.push({id:`cpu${i+1}`,name,user:false,archetype:archetypes[i],roster:[]}));
  const teams=shuffle(entrants).map((team,i)=>({...team,slot:i+1}));
  return {teams,userSlot:teams.find(t=>t.user).slot};
}

function showDraftLottery(teamName){
  const previous=document.querySelector('.lottery-backdrop');
  if(previous) previous.remove();
  const lottery=createDraftLottery(teamName);
  const wrap=document.createElement('div');
  wrap.className='modal-backdrop lottery-backdrop';
  wrap.setAttribute('role','dialog');
  wrap.setAttribute('aria-modal','true');
  wrap.setAttribute('aria-labelledby','lotteryTitle');
  wrap.innerHTML=`<div class="modal lottery-modal">
    <div class="lottery-heading">
      <div class="eyebrow">Draft Lottery</div>
      <h2 id="lotteryTitle">Determining your draft position...</h2>
      <p id="lotteryStatus">Eight teams are going into the draw.</p>
    </div>
    <div class="lottery-machine is-spinning" id="lotteryMachine" aria-hidden="true">
      <div class="lottery-ball lottery-ball-1"><span>?</span></div>
      <div class="lottery-ball lottery-ball-2"><span>?</span></div>
      <div class="lottery-ball lottery-ball-3"><span>?</span></div>
      <div class="lottery-ball lottery-ball-4"><span>?</span></div>
      <div class="lottery-ball lottery-ball-5"><span>?</span></div>
      <div class="lottery-ball lottery-ball-6"><span>?</span></div>
      <div class="lottery-ball lottery-ball-7"><span>?</span></div>
      <div class="lottery-ball lottery-ball-8"><span>?</span></div>
      <div class="lottery-draw-window"><small>YOUR PICK</small><strong id="lotteryPick">?</strong></div>
    </div>
    <div class="lottery-reveal" id="lotteryReveal" hidden>
      <div class="lottery-result-callout"><span>You will draft</span><strong>${ordinal(lottery.userSlot)}</strong><small>${lottery.userSlot===1?'First pick in Round 1 • last pick in Round 2':lottery.userSlot===8?'Last pick in Round 1 • first pick in Round 2':`Pick ${lottery.userSlot} in Round 1`}</small></div>
      <div class="lottery-order-wrap">
        <div class="lottery-order-title"><h3>Official Draft Order</h3><span>Round 1</span></div>
        <div class="lottery-order">${lottery.teams.map((team,i)=>`<div class="lottery-order-row ${team.user?'you':''}" style="--reveal-delay:${i*45}ms"><b>${i+1}</b><span>${escapeHTML(team.name)}</span>${team.user?'<em>YOU</em>':''}</div>`).join('')}</div>
      </div>
      <p class="lottery-snake-note">Round 2 reverses this order, then the draft continues in snake format.</p>
      <button class="btn primary lottery-enter-btn" id="enterDraftAfterLottery">Enter Draft Room</button>
    </div>
  </div>`;
  document.body.appendChild(wrap);
  const reduceMotion=window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const reveal=()=>{
    const machine=document.getElementById('lotteryMachine');
    if(!machine || !document.body.contains(wrap)) return;
    machine.classList.remove('is-spinning');
    machine.classList.add('is-revealed');
    document.getElementById('lotteryPick').textContent=lottery.userSlot;
    document.getElementById('lotteryTitle').textContent=`You drew the ${ordinal(lottery.userSlot)} pick!`;
    document.getElementById('lotteryStatus').textContent='The full Round 1 order is locked in.';
    const revealPanel=document.getElementById('lotteryReveal');
    revealPanel.hidden=false;
    requestAnimationFrame(()=>revealPanel.classList.add('show'));
    const enter=document.getElementById('enterDraftAfterLottery');
    enter.onclick=()=>{
      wrap.remove();
      startLeagueWithTeams(lottery.teams);
    };
    enter.focus({preventScroll:true});
  };
  window.setTimeout(reveal, reduceMotion?250:1900);
}

function startLeagueWithTeams(teams){
  state.league={ teams:teams.map(team=>({...team,roster:[]})), userId:'user' };
  state.draft={ pickIndex:0, available:state.pokemon.map(p=>p.id), log:[], search:'', sort:'projection', status:'active' };
  state.season=null;
  state.screen='draft';
  render();
  advanceToUserPick();
}

function draftOrderForPick(index){
  const round=Math.floor(index/TEAM_COUNT)+1;
  const within=index%TEAM_COUNT;
  const slot=round%2===1 ? within+1 : TEAM_COUNT-within;
  const team=state.league.teams.find(t=>t.slot===slot);
  return {round,roundPick:within+1,slot,team,overall:index+1};
}

function projectionList(){ return [...state.pokemon].sort((a,b)=>a.projRank-b.projRank); }
function pokemonById(id){ return state.pokemon.find(p=>p.id===id); }
function teamById(id){ return state.league.teams.find(t=>t.id===id); }
function userTeam(){ return teamById('user'); }

async function advanceToUserPick(){
  while(state.draft.pickIndex<TOTAL_PICKS){
    const current=draftOrderForPick(state.draft.pickIndex);
    if(current.team.user){ render(); return; }
    await sleep(180);
    const id=cpuChoose(current.team);
    makePick(current.team,id,false);
    render();
  }
  finishDraft();
}

function cpuChoose(team){
  const available=state.draft.available.map(pokemonById);
  const roster=team.roster.map(pokemonById);
  const scored=available.map(p=>({p, score:cpuScore(team,p,roster)})).sort((a,b)=>b.score-a.score);
  const pool=team.archetype.key==='wildcard' ? scored.slice(0,Math.min(14,scored.length)) : scored.slice(0,Math.min(6,scored.length));
  const bias=team.archetype.key==='wildcard' ? Math.random() : Math.pow(Math.random(),2.4);
  const index=Math.floor(bias*pool.length);
  return pool[Math.min(index,pool.length-1)].p.id;
}

function cpuScore(team,p,roster){
  let score=p.projectionScore;
  const k=team.archetype.key;
  if(k==='power') score += p.bst*.34 + Math.max(p.atk,p.spa)*.32;
  if(k==='speed') score += p.spe*.9 + Math.max(p.atk,p.spa)*.22;
  if(k==='defense') score += p.bulk*.8 + p.hp*.25;
  if(k==='value') score += (152-p.projRank)*1.25;
  if(k==='balanced') score += p.bulk*.25 + p.spe*.25 + Math.min(p.atk,p.spa)*.08;
  if(k==='coverage') score += coverageFit(roster,p)*22;
  if(k==='wildcard') score += (Math.random()-.5)*120;
  score += coverageFit(roster,p)*8;
  return score;
}

function coverageFit(roster,p){
  if(!roster.length) return 1;
  const existing=new Set(roster.flatMap(x=>x.types));
  const fresh=p.types.filter(t=>!existing.has(t)).length;
  const dup=p.types.filter(t=>existing.has(t)).length;
  return fresh - dup*.65;
}

function makePick(team,id,isUser){
  if(!state.draft.available.includes(id)) return;
  const p=pokemonById(id);
  const current=draftOrderForPick(state.draft.pickIndex);
  team.roster.push(id);
  state.draft.available=state.draft.available.filter(x=>x!==id);
  state.draft.log.push({ overall:current.overall, round:current.round, roundPick:current.roundPick, slot:current.slot, teamId:team.id, pokemonId:id, valueDelta:p.projRank-current.overall });
  state.draft.pickIndex++;
  if(isUser) toast(`${p.name} added to ${team.name}`);
}

function renderDraft(){
  const d=state.draft;
  const current=d.pickIndex<TOTAL_PICKS ? draftOrderForPick(d.pickIndex) : null;
  const you=userTeam();
  const available=d.available.map(pokemonById);
  const filtered=available.filter(p=>p.name.toLowerCase().includes((d.search||'').toLowerCase()));
  const sorted=[...filtered].sort((a,b)=>{
    if(d.sort==='bst') return b.bst-a.bst;
    if(d.sort==='speed') return b.spe-a.spe;
    if(d.sort==='name') return a.name.localeCompare(b.name);
    return a.projRank-b.projRank;
  });
  const cards=sorted.slice(0,36);
  const pickText=current ? `Round ${current.round} • Pick ${current.overall} • ${current.team.user?'<strong>YOU ARE ON THE CLOCK</strong>':`${current.team.name} is selecting...`}` : 'Draft complete';

  app.innerHTML=shell(`<div class="draft-layout">
  <section class="draft-main">
    ${draftBoardHTML()}
    <div class="controls"><input id="searchPokemon" placeholder="Search Pokémon" value="${escapeHTML(d.search||'')}"><select id="sortPokemon"><option value="projection" ${d.sort==='projection'?'selected':''}>Projected</option><option value="bst" ${d.sort==='bst'?'selected':''}>Total Stats</option><option value="speed" ${d.sort==='speed'?'selected':''}>Speed</option><option value="name" ${d.sort==='name'?'selected':''}>Name</option></select></div>
    ${cards.length?`<div class="pokemon-grid">${cards.map(p=>pokemonCardHTML(p,current?.team.user)).join('')}</div>`:`<div class="panel">No Pokémon found.</div>`}
  </section>
  <aside class="draft-right">
    <div class="panel draft-status-panel">
      <div class="draft-room-title"><h1>Draft Room</h1><p>${escapeHTML(state.league.teams.find(t=>t.user).name)} • Pick ${you.slot}</p></div>
      <div class="pick-banner">${pickText}</div>
      <div class="draft-status-meta"><span>${d.available.length} available</span><span>${d.log.length}/${TOTAL_PICKS} picks made</span></div>
    </div>
    <div class="panel draft-team-panel"><h3>Your Team</h3><div class="roster-slots">${rosterHTML(you.roster)}</div></div>
  </aside></div>`, `<button class="btn ghost" id="quitDraft">Quit Draft</button>`);

  document.getElementById('quitDraft').onclick=()=>{ if(confirm('Quit this draft and return to the menu?')){ state.screen='home'; state.league=null; state.draft=null; render(); } };
  const search=document.getElementById('searchPokemon');
  search.oninput=e=>{ d.search=e.target.value; renderDraft(); const el=document.getElementById('searchPokemon'); el.focus(); el.setSelectionRange(el.value.length,el.value.length); };
  document.getElementById('sortPokemon').onchange=e=>{d.sort=e.target.value;renderDraft();};
  document.querySelectorAll('[data-draft-id]').forEach(btn=>btn.onclick=async()=>{
    if(!current?.team.user) return;
    const id=Number(btn.dataset.draftId);
    makePick(current.team,id,true);
    render();
    await advanceToUserPick();
  });
  bindPokemonDetailTriggers();
}

function pokemonCardHTML(p,canDraft){
  return `<article class="poke-card"><button ${canDraft?'':'disabled'} data-draft-id="${p.id}">
    <div class="poke-top"><span class="rank-pill">#${p.projRank}</span><img src="${p.sprite}" onerror="this.src='${spriteFallback(p.id)}'" alt="${p.name}"></div>
    <div class="poke-info"><div class="poke-name"><strong>${p.name}</strong></div><div class="types">${p.types.map(t=>`<span class="type">${t}</span>`).join('')}</div>
    <div class="mini-stats full-base-stats">
      <div><b>${p.hp}</b><span>HP</span></div>
      <div><b>${p.atk}</b><span>ATK</span></div>
      <div><b>${p.def}</b><span>DEF</span></div>
      <div><b>${p.spa}</b><span>SP ATK</span></div>
      <div><b>${p.spd}</b><span>SP DEF</span></div>
      <div><b>${p.spe}</b><span>SPEED</span></div>
    </div></div>
  </button></article>`;
}
function rosterHTML(ids){
  return Array.from({length:ROSTER_SIZE},(_,i)=>{
    const p=ids[i]&&pokemonById(ids[i]);
    return p?`<button type="button" class="roster-slot roster-slot-trigger" data-pokemon-detail="${p.id}" aria-label="View ${p.name} stats"><img src="${p.sprite}" alt=""><span><strong>${p.name}</strong><small>${p.types.join(' / ')}</small></span></button>`:`<div class="roster-slot"><span class="empty">Round ${i+1} pick</span></div>`;
  }).join('');
}
function logHTML(x){
  const p=pokemonById(x.pokemonId), t=teamById(x.teamId);
  const pick=`${x.round}.${String(x.roundPick).padStart(2,'0')}`;
  return `<div class="log-item ${t.user?'you':''}"><span class="log-pick">${pick}</span><span><strong>${p.name}</strong><br><span class="muted">${t.name}</span></span></div>`;
}


function pickIndexForRoundAndSlot(round,slot){
  const within = round % 2 === 1 ? slot - 1 : TEAM_COUNT - slot;
  return (round - 1) * TEAM_COUNT + within;
}

function draftBoardHTML(){
  const teams=[...state.league.teams].sort((a,b)=>a.slot-b.slot);
  const currentIndex=state.draft.pickIndex;
  const headers=teams.map(team=>`<div class="board-team-head ${team.user?'you':''}">
    <span class="board-slot">${team.slot}</span>
    <strong class="board-team-name">${escapeHTML(team.name)}</strong>
    ${team.user?'<small>YOU</small>':''}
  </div>`).join('');

  const rows=Array.from({length:ROSTER_SIZE},(_,i)=>{
    const round=i+1;
    const direction=round%2===1?'→':'←';
    const cells=teams.map(team=>draftBoardCellHTML(round,team,currentIndex)).join('');
    return `<div class="board-round-label"><strong>R${round}</strong><span>${direction}</span></div>${cells}`;
  }).join('');

  return `<section class="draft-board-section">
    <div class="draft-board-title"><div><h3>Draft Board</h3><p>Every team, every pick. The board snakes each round.</p></div><span>${state.draft.log.length}/${TOTAL_PICKS} picks</span></div>
    <div class="draft-board-scroll">
      <div class="draft-board">
        <div class="board-corner">Round</div>${headers}${rows}
      </div>
    </div>
  </section>`;
}

function draftBoardCellHTML(round,team,currentIndex){
  const index=pickIndexForRoundAndSlot(round,team.slot);
  const overall=index+1;
  const within=index%TEAM_COUNT;
  const roundPick=within+1;
  const log=state.draft.log.find(x=>x.overall===overall);
  const isCurrent=index===currentIndex && currentIndex<TOTAL_PICKS;
  const pickLabel=`${round}.${String(roundPick).padStart(2,'0')}`;

  if(log){
    const p=pokemonById(log.pokemonId);
    const primary=p.types[0]||'normal';
    const title=`${p.name} • ${p.types.join(' / ')} • Pick ${pickLabel}`;
    return `<div class="board-cell filled type-bg-${primary} ${team.user?'user-pick':''}" title="${escapeHTML(title)}">
      <div class="board-pick-meta"><span>${pickLabel}</span><span>#${overall}</span></div>
      <div class="board-pick-body"><img src="${p.sprite}" onerror="this.src='${spriteFallback(p.id)}'" alt="${p.name}"><div><strong class="board-poke-name">${p.name}</strong><small class="board-pick-types">${p.types.map(t=>`<span>${t}</span>`).join('')}</small></div></div>
    </div>`;
  }

  return `<div class="board-cell pending ${isCurrent?'current':''} ${team.user?'user-column':''}">
    <div class="board-pick-meta"><span>${pickLabel}</span><span>#${overall}</span></div>
    <div class="board-empty">${isCurrent?(team.user?'YOUR PICK':'ON CLOCK'):'—'}</div>
  </div>`;
}

function finishDraft(){
  state.draft.status='complete';
  career.drafts++;
  userTeam().roster.forEach(id=>{career.pokemonDraftCounts[id]=(career.pokemonDraftCounts[id]||0)+1;});
  saveJSON(CAREER_KEY,career);
  state.screen='grade';
  render();
}

function teamMetrics(team){
  const roster=team.roster.map(pokemonById);
  const avgBst=avg(roster.map(p=>p.bst));
  const power=clamp(50+(avgBst-400)*.32,0,100);
  const speed=clamp(55+(avg(roster.map(p=>p.spe))-55)*.65,0,100);
  const bulk=clamp(55+(avg(roster.map(p=>p.bulk))-65)*.8,0,100);
  const uniqueTypes=new Set(roster.flatMap(p=>p.types)).size;
  const diversity=clamp(uniqueTypes*10,0,100);
  const coverage=calculateCoverage(roster);
  const weakness=calculateWeaknessManagement(roster);
  const draftValue=calculateDraftValue(team);
  const overall=power*.30+speed*.12+bulk*.17+diversity*.12+coverage*.16+weakness*.08+draftValue*.05;
  return {power,speed,bulk,diversity,coverage,weakness,draftValue,overall};
}

function calculateCoverage(roster){
  const targetTypes=Object.keys(TYPE_CHART);
  const covered=targetTypes.filter(defType=>roster.some(p=>p.types.some(atkType=>(TYPE_CHART[atkType]?.[defType]||1)>1))).length;
  return clamp(45+(covered/targetTypes.length)*55,0,100);
}
function typeDefenseMultiplier(attType,pokemon){
  // Multiply across every defending type so dual typings behave like the real games:
  // 2× + 2× = 4×, 0.5× + 0.5× = 0.25×, and any immunity makes the attack 0×.
  return pokemon.types.reduce((m,defType)=>m*(TYPE_CHART[attType]?.[defType] ?? 1),1);
}
function bestTypeMultiplier(attacker,defender){
  // There is no moveset system in Draft League, so each Pokémon is assumed to be
  // able to use an attack matching either of its own types. Use its best STAB matchup.
  return Math.max(...attacker.types.map(attType=>typeDefenseMultiplier(attType,defender)));
}
function typeMultiplierStage(multiplier){
  // Convert effectiveness to evenly spaced matchup steps.
  // 0.25×=-2, 0.5×=-1, 1×=0, 2×=+1, 4×=+2. Immunity is intentionally worse.
  if(multiplier===0) return -3;
  return Math.log2(multiplier);
}
function typeMatchupData(a,b){
  const aMultiplier=bestTypeMultiplier(a,b);
  const bMultiplier=bestTypeMultiplier(b,a);
  return {
    aMultiplier,
    bMultiplier,
    aStage:typeMultiplierStage(aMultiplier),
    bStage:typeMultiplierStage(bMultiplier)
  };
}
function calculateWeaknessManagement(roster){
  let danger=0;
  for(const attackType of Object.keys(TYPE_CHART)){
    const weak=roster.filter(p=>typeDefenseMultiplier(attackType,p)>1).length;
    if(weak>=3) danger += (weak-2)*8;
  }
  return clamp(100-danger,0,100);
}
function calculateDraftValue(team){
  const picks=state.draft.log.filter(x=>x.teamId===team.id);
  const deltas=picks.map(x=>pokemonById(x.pokemonId).projRank-x.overall);
  return clamp(60-avg(deltas)*2.2,0,100);
}
function letterGrade(score){
  if(score>=94)return'A+'; if(score>=90)return'A'; if(score>=87)return'A-';
  if(score>=84)return'B+'; if(score>=80)return'B'; if(score>=77)return'B-';
  if(score>=74)return'C+'; if(score>=70)return'C'; if(score>=67)return'C-';
  if(score>=64)return'D+'; if(score>=60)return'D'; return'F';
}

function renderGrade(){
  const team=userTeam(), m=teamMetrics(team), grade=letterGrade(m.overall);
  const metrics=[['Power',m.power],['Speed',m.speed],['Bulk',m.bulk],['Type Diversity',m.diversity],['Coverage',m.coverage],['Weakness Mgmt',m.weakness],['Draft Value',m.draftValue]];
  const steal=[...state.draft.log.filter(x=>x.teamId==='user')].sort((a,b)=>a.valueDelta-b.valueDelta)[0];
  const reach=[...state.draft.log.filter(x=>x.teamId==='user')].sort((a,b)=>b.valueDelta-a.valueDelta)[0];
  app.innerHTML=shell(`<div class="section-title"><div><h1>Draft Report Card</h1><p>${team.name}</p></div></div>
  <section class="panel"><div class="grade-hero"><div class="grade-letter">${grade}</div><div class="grade-bars">${metrics.map(([label,v])=>`<div class="grade-row"><span>${label}</span><div class="bar"><i style="width:${Math.round(v)}%"></i></div><b>${Math.round(v)}</b></div>`).join('')}</div></div>
  <div class="team-cards">${team.roster.map(id=>teamMiniHTML(pokemonById(id))).join('')}</div></section>
  <div class="setup-grid" style="margin-top:16px"><section class="panel"><h3>Best Value</h3><p><strong>${pokemonById(steal.pokemonId).name}</strong> at pick ${steal.overall}</p><p class="muted small">Projected #${pokemonById(steal.pokemonId).projRank} on our board.</p></section><section class="panel"><h3>Biggest Reach</h3><p><strong>${pokemonById(reach.pokemonId).name}</strong> at pick ${reach.overall}</p><p class="muted small">Projected #${pokemonById(reach.pokemonId).projRank} on our board.</p></section></div>
  <div style="margin-top:16px"><button class="btn primary" id="startSeasonBtn">Start Season</button></div>`);
  document.getElementById('startSeasonBtn').onclick=()=>{ createSeason(); state.screen='season'; render(); };
}
function teamMiniHTML(p){ return `<div class="team-mini"><img src="${p.sprite}" alt="${p.name}"><strong>${p.name}</strong><span class="muted small">${p.types.join(' / ')}</span></div>`; }

function createSeason(){
  const teams=state.league.teams;
  const schedule=[];
  let rotating=teams.map(t=>t.id);
  const fixed=rotating[0];
  let others=rotating.slice(1);
  const firstHalf=[];
  for(let round=0;round<TEAM_COUNT-1;round++){
    const arrangement=[fixed,...others];
    const games=[];
    for(let i=0;i<TEAM_COUNT/2;i++) games.push([arrangement[i],arrangement[TEAM_COUNT-1-i]]);
    firstHalf.push(games);
    others=[others[others.length-1],...others.slice(0,-1)];
  }
  for(let week=1;week<=14;week++){
    const base=firstHalf[(week-1)%7];
    const games=base.map(pair=>{
      const ids=week<=7?pair:[pair[1],pair[0]];
      return { week, homeId:ids[0], awayId:ids[1], played:false, result:null, cpuOrder:null };
    });
    schedule.push(...games);
  }
  const playerStats={};
  teams.forEach(team=>team.roster.forEach(id=>{
    playerStats[id]={pokemonId:id,teamId:team.id,gp:0,w:0,l:0,kos:0,playoffW:0,playoffL:0};
  }));
  state.season={
    week:0,
    schedule,
    standings:teams.map(t=>({teamId:t.id,w:0,l:0,pf:0,pa:0})),
    playoffs:null,
    playoffPhase:null,
    champion:null,
    complete:false,
    userLineup:[...userTeam().roster],
    playerStats,
    biggestUpset:null,
    awards:null,
    newBadges:[]
  };
}

function duelComponents(a,b){
  const speedEdge=(a.spe-b.spe)*.12;
  const type=typeMatchupData(a,b);
  // One effectiveness step (1× -> 2×, or 1× -> 0.5×) is meaningful without
  // automatically overriding every stat advantage. 4× weaknesses and immunities
  // naturally create much larger swings because the stages stack.
  const matchupEdge=(type.aStage-type.bStage)*14;
  const powerEdge=(a.projectionScore-b.projectionScore)*.28;
  return {speedEdge,matchupEdge,powerEdge,type,total:powerEdge+speedEdge+matchupEdge};
}

function duelExpectedEdge(a,b){
  return duelComponents(a,b).total;
}

function duelWinProbability(a,b){
  // Duel variance is uniform from -23 to +23. This gives an exact pregame
  // probability for the stat/type/speed edge before the random roll happens.
  const edge=duelExpectedEdge(a,b);
  if(edge>=23) return 1;
  if(edge<=-23) return 0;
  return (edge+23)/46;
}

function lineupWinProbability(teamA,teamB,aOrder,bOrder){
  const aRoster=normalizeLineup(teamA,aOrder);
  const bRoster=normalizeLineup(teamB,bOrder);
  let dist=[1,0,0,0,0,0,0];
  for(let i=0;i<ROSTER_SIZE;i++){
    const p=duelWinProbability(aRoster[i],bRoster[i]);
    const next=Array(7).fill(0);
    for(let wins=0;wins<=i;wins++){
      next[wins]+=dist[wins]*(1-p);
      next[wins+1]+=dist[wins]*p;
    }
    dist=next;
  }
  const aPower=sum(aRoster.map(p=>p.projectionScore));
  const bPower=sum(bRoster.map(p=>p.projectionScore));
  const tiebreak=clamp(.5+(aPower-bPower)/Math.max(1,aPower+bPower)*3,.32,.68);
  return clamp(dist[4]+dist[5]+dist[6]+dist[3]*tiebreak,0,1);
}

function simulateDuel(a,b){
  const expectedEdge=duelExpectedEdge(a,b);
  const noise=(Math.random()-.5)*46;
  return { winner:expectedEdge+noise>=0?a:b, expectedEdge, noise };
}

function cpuStrategicOrder(team,opponentTeam){
  const opponents=opponentTeam.roster.map(pokemonById);
  return [...team.roster].map(id=>{
    const p=pokemonById(id);
    const matchup=avg(opponents.map(o=>duelExpectedEdge(p,o)));
    const archetype=team.archetype?.key;
    let bonus=0;
    if(archetype==='speed') bonus=p.spe*.18;
    if(archetype==='power') bonus=Math.max(p.atk,p.spa)*.12;
    if(archetype==='defense') bonus=p.bulk*.11;
    return {id,score:p.projectionScore*.55+matchup*.24+bonus+(Math.random()-.5)*18};
  }).sort((a,b)=>b.score-a.score).map(x=>x.id);
}

function normalizeLineup(team,order){
  const valid=Array.isArray(order)?order.filter(id=>team.roster.includes(id)):[];
  const missing=team.roster.filter(id=>!valid.includes(id));
  return [...valid,...missing].slice(0,ROSTER_SIZE).map(pokemonById);
}

function simulateMatch(teamA,teamB,options={}){
  const aRoster=normalizeLineup(teamA,options.aOrder || cpuStrategicOrder(teamA,teamB));
  const bRoster=normalizeLineup(teamB,options.bOrder || cpuStrategicOrder(teamB,teamA));
  const battles=[]; let aWins=0,bWins=0;
  for(let i=0;i<ROSTER_SIZE;i++){
    const a=aRoster[i], b=bRoster[i];
    const duel=simulateDuel(a,b), winner=duel.winner;
    winner.id===a.id?aWins++:bWins++;
    battles.push({aId:a.id,bId:b.id,winnerId:winner.id,expectedEdge:duel.expectedEdge,noise:duel.noise});
  }
  if(aWins===bWins){
    const aPower=sum(aRoster.map(p=>p.projectionScore))*(.96+Math.random()*.08);
    const bPower=sum(bRoster.map(p=>p.projectionScore))*(.96+Math.random()*.08);
    if(aPower>=bPower)aWins++; else bWins++;
  }
  return {aWins,bWins,winnerId:aWins>bWins?teamA.id:teamB.id,battles,aOrder:aRoster.map(p=>p.id),bOrder:bRoster.map(p=>p.id)};
}

function recordPlayerStats(result,stageLabel='Regular Season',isPlayoff=false){
  result.battles.forEach(b=>{
    const a=state.season.playerStats[b.aId], c=state.season.playerStats[b.bId];
    if(!a||!c) return;
    a.gp++; c.gp++;
    const winner=b.winnerId===b.aId?a:c;
    const loser=b.winnerId===b.aId?c:a;
    winner.w++; winner.kos++; loser.l++;
    if(isPlayoff){ winner.playoffW++; loser.playoffL++; }

    const underdogWon=(b.expectedEdge>8 && b.winnerId===b.bId) || (b.expectedEdge<-8 && b.winnerId===b.aId);
    const magnitude=Math.abs(b.expectedEdge);
    if(underdogWon && (!state.season.biggestUpset || magnitude>state.season.biggestUpset.magnitude)){
      state.season.biggestUpset={winnerId:b.winnerId,loserId:b.winnerId===b.aId?b.bId:b.aId,magnitude,stageLabel};
    }
  });
}

function simulateScheduledGame(game){
  const home=teamById(game.homeId), away=teamById(game.awayId);
  const userIsHome=home.user, userIsAway=away.user;
  let aOrder,bOrder;
  if(userIsHome){
    aOrder=state.season.userLineup;
    if(!game.cpuOrder) game.cpuOrder=cpuStrategicOrder(away,home);
    bOrder=game.cpuOrder;
  } else if(userIsAway){
    if(!game.cpuOrder) game.cpuOrder=cpuStrategicOrder(home,away);
    aOrder=game.cpuOrder;
    bOrder=state.season.userLineup;
  } else {
    aOrder=cpuStrategicOrder(home,away);
    bOrder=cpuStrategicOrder(away,home);
  }
  return simulateMatch(home,away,{aOrder,bOrder});
}

function nextUserGame(){
  if(!state.season || state.season.week>=14) return null;
  const week=state.season.week+1;
  return state.season.schedule.find(g=>g.week===week&&(g.homeId==='user'||g.awayId==='user')) || null;
}

function typePressure(teamA,teamB){
  const a=teamA.roster.map(pokemonById), b=teamB.roster.map(pokemonById);
  // Average matchup stage across the full opposing roster, using exact dual-type
  // effectiveness. This powers the preview and CPU lineup decisions consistently.
  return avg(a.map(p=>avg(b.map(o=>typeMultiplierStage(bestTypeMultiplier(p,o))))));
}

function matchupPreview(teamA,teamB,aOrder=null,bOrder=null){
  const ma=teamMetrics(teamA), mb=teamMetrics(teamB);
  const pa=typePressure(teamA,teamB), pb=typePressure(teamB,teamA);
  const genericScoreA=ma.power*.34+ma.speed*.18+ma.bulk*.18+ma.coverage*.12+(pa-pb)*18;
  const genericScoreB=mb.power*.34+mb.speed*.18+mb.bulk*.18+mb.coverage*.12+(pb-pa)*18;
  const genericPct=clamp(Math.round(50+(genericScoreA-genericScoreB)*.72),22,78);
  const pct=aOrder&&bOrder
    ? clamp(Math.round(lineupWinProbability(teamA,teamB,aOrder,bOrder)*100),5,95)
    : genericPct;
  return {
    pct,
    categories:[
      ['Power',ma.power,mb.power],
      ['Speed',ma.speed,mb.speed],
      ['Bulk',ma.bulk,mb.bulk],
      ['Type Matchup',50+(pa-pb)*20,50+(pb-pa)*20]
    ]
  };
}

function playWeek(){
  if(!state.season || state.season.week>=14) return;
  const nextWeek=state.season.week+1;
  const games=state.season.schedule.filter(g=>g.week===nextWeek);
  games.forEach(g=>{
    const r=simulateScheduledGame(g); g.played=true; g.result=r;
    applyResult(g,r);
    recordPlayerStats(r,`Week ${nextWeek}`,false);
  });
  state.season.week=nextWeek;
  if(nextWeek===14) createPlayoffs();
  render();
}

function applyResult(game,r){
  const h=state.season.standings.find(s=>s.teamId===game.homeId);
  const a=state.season.standings.find(s=>s.teamId===game.awayId);
  h.pf+=r.aWins; h.pa+=r.bWins; a.pf+=r.bWins; a.pa+=r.aWins;
  if(r.winnerId===game.homeId){h.w++;a.l++;}else{a.w++;h.l++;}
}

function rankedStandings(){
  return [...state.season.standings].sort((a,b)=>b.w-a.w || (b.pf-b.pa)-(a.pf-a.pa) || b.pf-a.pf);
}

function createPlayoffs(){
  const top=rankedStandings().slice(0,4);
  state.season.playoffs={
    seeds:top.map((s,i)=>({seed:i+1,teamId:s.teamId})),
    semis:[{aId:top[0].teamId,bId:top[3].teamId,result:null,cpuOrder:null},{aId:top[1].teamId,bId:top[2].teamId,result:null,cpuOrder:null}],
    final:null
  };
  state.season.playoffPhase='semis';
}

function simulatePlayoffGame(game,stageLabel){
  const a=teamById(game.aId), b=teamById(game.bId);
  let aOrder,bOrder;
  if(a.user){
    aOrder=state.season.userLineup;
    if(!game.cpuOrder) game.cpuOrder=cpuStrategicOrder(b,a);
    bOrder=game.cpuOrder;
  } else if(b.user){
    if(!game.cpuOrder) game.cpuOrder=cpuStrategicOrder(a,b);
    aOrder=game.cpuOrder;
    bOrder=state.season.userLineup;
  } else {
    aOrder=cpuStrategicOrder(a,b);
    bOrder=cpuStrategicOrder(b,a);
  }
  const result=simulateMatch(a,b,{aOrder,bOrder});
  recordPlayerStats(result,stageLabel,true);
  return result;
}

function currentPlayoffUserGame(){
  const p=state.season?.playoffs;
  if(!p) return null;
  if(state.season.playoffPhase==='semis'){
    return p.semis.find(x=>!x.result&&(x.aId==='user'||x.bId==='user')) || null;
  }
  if(state.season.playoffPhase==='final' && p.final && !p.final.result && (p.final.aId==='user'||p.final.bId==='user')) return p.final;
  return null;
}

function currentPlayoffUserOpponent(){
  const g=currentPlayoffUserGame();
  if(!g) return null;
  return teamById(g.aId==='user'?g.bId:g.aId);
}

function simulatePlayoffs(){
  const p=state.season.playoffs;
  if(!p || state.season.complete) return;

  if(state.season.playoffPhase==='semis'){
    p.semis.forEach(g=>{ if(!g.result) g.result=simulatePlayoffGame(g,'Semifinal'); });
    const finalists=p.semis.map(g=>g.result.winnerId);
    p.final={aId:finalists[0],bId:finalists[1],result:null,cpuOrder:null};
    state.season.playoffPhase='final';
    render();
    return;
  }

  if(state.season.playoffPhase==='final'){
    p.final.result=simulatePlayoffGame(p.final,'Championship');
    state.season.champion=p.final.result.winnerId;
    state.season.complete=true;
    state.season.playoffPhase='complete';
    state.season.awards=buildSeasonAwards();
    const wonTitle=finalizeCareer();
    state.screen=wonTitle?'hall':'recap';
    render();
  }
}

function rankedPlayerStats(filterFn=()=>true){
  return Object.values(state.season.playerStats).filter(filterFn).sort((a,b)=>{
    const ap=a.gp?a.w/a.gp:0, bp=b.gp?b.w/b.gp:0;
    return b.w-a.w || bp-ap || b.kos-a.kos || pokemonById(b.pokemonId).projectionScore-pokemonById(a.pokemonId).projectionScore;
  });
}

function buildSeasonAwards(){
  const leagueMvp=rankedPlayerStats()[0] || null;
  const userMvp=rankedPlayerStats(x=>x.teamId==='user')[0] || null;
  const steal=[...state.draft.log].sort((a,b)=>a.valueDelta-b.valueDelta)[0] || null;
  return {
    leagueMvpId:leagueMvp?.pokemonId || null,
    leagueMvpTeamId:leagueMvp?.teamId || null,
    userMvpId:userMvp?.pokemonId || null,
    draftStealId:steal?.pokemonId || null,
    draftStealTeamId:steal?.teamId || null,
    draftStealPick:steal?.overall || null,
    draftStealDelta:steal?.valueDelta || 0,
    biggestUpset:state.season.biggestUpset ? {...state.season.biggestUpset} : null
  };
}

function evaluateChallenges(wonTitle,userStanding,seed,championshipId){
  const roster=userTeam().roster.map(pokemonById);
  const uniqueTypes=new Set(roster.flatMap(p=>p.types)).size;
  const typeCounts={};
  roster.forEach(p=>p.types.forEach(t=>typeCounts[t]=(typeCounts[t]||0)+1));
  const passed={
    no_legends:wonTitle && roster.every(p=>!LEGENDARY_IDS.has(p.id)),
    professor_oak:wonTitle && uniqueTypes>=6,
    underdogs:wonTitle && roster.every(p=>p.projRank>10),
    kanto_starter:wonTitle && roster.some(p=>KANTO_FINAL_STARTERS.has(p.id)),
    mono_master:wonTitle && Object.values(typeCounts).some(n=>n>=3),
    perfect_season:wonTitle && userStanding.w===14,
    from_bottom:wonTitle && seed===4
  };
  const newlyEarned=[];
  CHALLENGES.forEach(ch=>{
    if(passed[ch.id] && !career.challengeBadges[ch.id]){
      career.challengeBadges[ch.id]={earnedAt:new Date().toISOString(),titleNumber:career.championships||null,championshipId:championshipId||null};
      newlyEarned.push(ch.id);
    }
  });
  return newlyEarned;
}

function finalizeCareer(){
  const userStanding=state.season.standings.find(s=>s.teamId==='user');
  career.totalWins+=userStanding.w; career.totalLosses+=userStanding.l; career.bestWins=Math.max(career.bestWins,userStanding.w);
  const madePlayoffs=state.season.playoffs.seeds.some(s=>s.teamId==='user');
  if(madePlayoffs) career.playoffTrips++;
  const wonTitle=state.season.champion==='user';
  const seed=state.season.playoffs.seeds.find(s=>s.teamId==='user')?.seed || null;
  let entry=null;

  if(wonTitle){
    career.championships++;
    const metrics=teamMetrics(userTeam());
    entry={
      id:`champ-${Date.now()}-${career.championships}`,
      titleNumber:career.championships,
      teamName:userTeam().name,
      roster:[...userTeam().roster],
      wins:userStanding.w,
      losses:userStanding.l,
      seed,
      draftGrade:letterGrade(metrics.overall),
      draftScore:Math.round(metrics.overall),
      teamMvpId:state.season.awards?.userMvpId || null,
      playerStats:userTeam().roster.map(id=>({...state.season.playerStats[id]})),
      wonAt:new Date().toISOString(),
      badges:[]
    };
    career.championshipTeams.push(entry);
    state.season.championshipId=entry.id;
  }

  const newlyEarned=evaluateChallenges(wonTitle,userStanding,seed,entry?.id || null);
  state.season.newBadges=newlyEarned;
  if(entry) entry.badges=[...newlyEarned];

  userTeam().roster.forEach(id=>{
    const wins=state.season.playerStats[id]?.w || 0;
    career.pokemonSeasonWins[id]=(career.pokemonSeasonWins[id]||0)+wins;
  });
  saveJSON(CAREER_KEY,career);
  return wonTitle;
}

function lineupRowHTML(id,index){
  const p=pokemonById(id);
  return `<div class="lineup-row" data-lineup-slot="${index}">
    <span class="lineup-number">${index+1}</span>
    <button type="button" class="lineup-mon-trigger" data-pokemon-detail="${p.id}" aria-label="View ${p.name} stats">
      <img src="${p.sprite}" onerror="this.src='${spriteFallback(p.id)}'" alt="">
      <span class="lineup-name"><strong>${p.name}</strong><small>${p.types.join(' / ')}</small></span>
    </button>
    <button type="button" class="lineup-drag-handle" data-lineup-drag="${p.id}" aria-label="Reorder ${p.name}. Drag to a new slot, or use the up and down arrow keys." title="Drag to reorder"><span aria-hidden="true">⠿</span></button>
  </div>`;
}

function matchupOrderRowHTML(userId,opponentId,index){
  const userP=pokemonById(userId), oppP=pokemonById(opponentId);
  const type=typeMatchupData(userP,oppP);
  const edge=duelExpectedEdge(userP,oppP);
  const edgeClass=Math.abs(edge)<4?'even':edge>0?'you':'them';
  const edgeLabel=Math.abs(edge)<4?'Even':edge>0?'You':'CPU';
  return `<div class="matchup-order-row" data-lineup-slot="${index}">
    <div class="matchup-side user-side" data-lineup-id="${userP.id}">
      <span class="lineup-number">${index+1}</span>
      <button type="button" class="lineup-mon-trigger" data-pokemon-detail="${userP.id}" aria-label="View ${userP.name} stats">
        <img src="${userP.sprite}" onerror="this.src='${spriteFallback(userP.id)}'" alt="">
        <span class="lineup-name"><strong>${userP.name}</strong><small>${userP.types.join(' / ')}</small></span>
      </button>
      <button type="button" class="lineup-drag-handle" data-lineup-drag="${userP.id}" aria-label="Reorder ${userP.name}. Drag to a new slot, or use the up and down arrow keys." title="Drag to reorder"><span aria-hidden="true">⠿</span></button>
    </div>
    <div class="matchup-vs"><span>VS</span><small class="slot-edge ${edgeClass}">${edgeLabel}</small></div>
    <div class="matchup-side cpu-side">
      <span class="cpu-slot-number">${index+1}</span>
      <img src="${oppP.sprite}" onerror="this.src='${spriteFallback(oppP.id)}'" alt="${oppP.name}">
      <span class="lineup-name"><strong>${oppP.name}</strong><small>${oppP.types.join(' / ')}</small></span>
      <span class="type-preview">${formatMultiplier(type.bMultiplier)} / ${formatMultiplier(type.aMultiplier)}</span>
    </div>
  </div>`;
}

function matchupPanelHTML(opponent,label,opponentOrder){
  if(!opponent) return '';
  const lockedOrder=(opponentOrder?.length?opponentOrder:cpuStrategicOrder(opponent,userTeam()));
  const preview=matchupPreview(userTeam(),opponent,state.season.userLineup,lockedOrder);
  return `<section class="panel matchup-panel">
    <div class="matchup-head"><div><div class="eyebrow">${label}</div><h2>${escapeHTML(userTeam().name)} vs ${escapeHTML(opponent.name)}</h2><p>Opponent order is scouted and locked. Drag your six Pokémon into the slots you want to choose the 1v1 matchups.</p></div><div class="projection"><b>${preview.pct}%</b><span>Projected Win</span></div></div>
    <div class="matchup-order-head"><span>Your lineup</span><span></span><span>${escapeHTML(opponent.name)}</span></div>
    <div class="matchup-order-board">${state.season.userLineup.map((id,i)=>matchupOrderRowHTML(id,lockedOrder[i],i)).join('')}</div>
    <div class="matchup-edges">${preview.categories.map(([name,a,b])=>{const diff=a-b;const who=Math.abs(diff)<4?'Even':diff>0?'You':opponent.name;return `<div><span>${name}</span><strong class="${who==='You'?'edge-you':who==='Even'?'':'edge-them'}">${escapeHTML(who)}</strong></div>`;}).join('')}</div>
    <p class="matchup-scout-note">The CPU lineup will not change after you see it. Drag a Pokémon by the handle and the projected win chance updates after you drop it.</p>
  </section>`;
}

function playerStatsTableHTML(teamId='user'){
  const team=teamById(teamId);
  const stats=team.roster.map(id=>state.season.playerStats[id]).filter(Boolean).sort((a,b)=>b.w-a.w || b.kos-a.kos);
  return `<div class="player-stats-wrap"><table class="player-stats"><thead><tr><th>Pokémon</th><th>W</th><th>L</th><th>KO</th><th>Win%</th></tr></thead><tbody>${stats.map(st=>{const p=pokemonById(st.pokemonId);const pct=st.gp?Math.round(st.w/st.gp*100):0;const trigger=teamId==='user';return `<tr><td>${trigger?`<button type="button" class="stat-mon stat-mon-trigger" data-pokemon-detail="${p.id}" aria-label="View ${p.name} stats"><img src="${p.sprite}" onerror="this.src='${spriteFallback(p.id)}'" alt=""><strong>${p.name}</strong></button>`:`<span class="stat-mon"><img src="${p.sprite}" onerror="this.src='${spriteFallback(p.id)}'" alt=""><strong>${p.name}</strong></span>`}</td><td>${st.w}</td><td>${st.l}</td><td>${st.kos}</td><td>${pct}%</td></tr>`;}).join('')}</tbody></table></div>`;
}

function leagueLeadersHTML(){
  const leaders=rankedPlayerStats().slice(0,5);
  return `<div class="league-leaders">${leaders.map((st,i)=>{const p=pokemonById(st.pokemonId), team=teamById(st.teamId);return `<div><span class="leader-rank">${i+1}</span><img src="${p.sprite}" onerror="this.src='${spriteFallback(p.id)}'" alt=""><span><strong>${p.name}</strong><small>${team.name}</small></span><b>${st.w}-${st.l}</b></div>`;}).join('')}</div>`;
}

function moveUserLineup(id,direction){
  const arr=state.season.userLineup;
  const index=arr.indexOf(id);
  const target=index+direction;
  if(index<0||target<0||target>=arr.length) return;
  [arr[index],arr[target]]=[arr[target],arr[index]];
  renderSeason();
}

function moveUserLineupToIndex(id,targetIndex){
  const arr=state.season.userLineup;
  const from=arr.indexOf(id);
  const target=clamp(Number(targetIndex),0,arr.length-1);
  if(from<0 || from===target) return false;
  const [moved]=arr.splice(from,1);
  arr.splice(target,0,moved);
  return true;
}

function bindLineupDrag(){
  document.querySelectorAll('[data-lineup-drag]').forEach(handle=>{
    handle.addEventListener('keydown',event=>{
      const id=Number(handle.dataset.lineupDrag);
      if(event.key==='ArrowUp'){
        event.preventDefault();
        moveUserLineup(id,-1);
      } else if(event.key==='ArrowDown'){
        event.preventDefault();
        moveUserLineup(id,1);
      } else if(event.key==='Home'){
        event.preventDefault();
        if(moveUserLineupToIndex(id,0)) renderSeason();
      } else if(event.key==='End'){
        event.preventDefault();
        if(moveUserLineupToIndex(id,state.season.userLineup.length-1)) renderSeason();
      }
    });

    handle.addEventListener('pointerdown',event=>{
      if(event.pointerType==='mouse' && event.button!==0) return;
      const id=Number(handle.dataset.lineupDrag);
      const startIndex=state.season.userLineup.indexOf(id);
      const row=handle.closest('.matchup-order-row');
      const source=row?.querySelector('.user-side');
      if(startIndex<0 || !row || !source) return;

      event.preventDefault();
      const rect=source.getBoundingClientRect();
      const ghost=source.cloneNode(true);
      ghost.classList.add('lineup-drag-ghost');
      ghost.removeAttribute('data-lineup-id');
      ghost.querySelectorAll('button').forEach(btn=>btn.setAttribute('tabindex','-1'));
      ghost.style.width=`${rect.width}px`;
      document.body.appendChild(ghost);

      let targetIndex=startIndex;
      let active=true;
      const xOffset=Math.min(Math.max(event.clientX-rect.left,18),rect.width-18);
      const yOffset=Math.min(Math.max(event.clientY-rect.top,18),rect.height-18);

      source.classList.add('drag-source');
      document.body.classList.add('lineup-dragging');
      handle.setAttribute('aria-grabbed','true');

      const positionGhost=ev=>{
        ghost.style.transform=`translate3d(${Math.round(ev.clientX-xOffset)}px,${Math.round(ev.clientY-yOffset)}px,0)`;
      };
      positionGhost(event);

      const clearTargets=()=>document.querySelectorAll('.matchup-order-row.drag-target').forEach(el=>el.classList.remove('drag-target'));

      const onMove=ev=>{
        if(!active) return;
        ev.preventDefault();
        positionGhost(ev);

        const hovered=document.elementFromPoint(ev.clientX,ev.clientY)?.closest('.matchup-order-row');
        if(hovered?.dataset.lineupSlot!==undefined){
          const next=Number(hovered.dataset.lineupSlot);
          if(Number.isInteger(next)) targetIndex=next;
          clearTargets();
          hovered.classList.add('drag-target');
        }

        // Small edge scroll assist for phones when all six rows are not visible at once.
        const edge=72;
        if(ev.clientY<edge) window.scrollBy(0,-10);
        else if(ev.clientY>window.innerHeight-edge) window.scrollBy(0,10);
      };

      const finish=()=>{
        if(!active) return;
        active=false;
        document.removeEventListener('pointermove',onMove);
        document.removeEventListener('pointerup',onUp);
        document.removeEventListener('pointercancel',onCancel);
        clearTargets();
        ghost.remove();
        document.body.classList.remove('lineup-dragging');
        source.classList.remove('drag-source');
        handle.removeAttribute('aria-grabbed');
        if(moveUserLineupToIndex(id,targetIndex)) renderSeason();
      };
      const onUp=()=>finish();
      const onCancel=()=>finish();

      document.addEventListener('pointermove',onMove,{passive:false});
      document.addEventListener('pointerup',onUp);
      document.addEventListener('pointercancel',onCancel);
    });
  });
}

function playoffStanding(teamId){
  return state.season?.standings?.find(x=>x.teamId===teamId) || null;
}

function playoffSeed(teamId){
  return state.season?.playoffs?.seeds?.find(x=>x.teamId===teamId)?.seed || null;
}

function playoffScore(game,teamId){
  if(!game?.result) return null;
  if(game.aId===teamId) return game.result.aWins;
  if(game.bId===teamId) return game.result.bWins;
  return null;
}

function playoffTeamRowHTML(teamId,game){
  if(!teamId){
    return `<div class="bracket-team bracket-team-tbd"><span class="bracket-seed">—</span><span class="bracket-team-copy"><strong>TBD</strong><small>Awaiting semifinal</small></span><span class="bracket-score">—</span></div>`;
  }
  const team=teamById(teamId);
  const st=playoffStanding(teamId);
  const seed=playoffSeed(teamId);
  const score=playoffScore(game,teamId);
  const won=!!game?.result && game.result.winnerId===teamId;
  const lost=!!game?.result && game.result.winnerId!==teamId;
  return `<div class="bracket-team ${won?'winner':''} ${lost?'loser':''} ${teamId==='user'?'you':''}">
    <span class="bracket-seed">${seed?`#${seed}`:'—'}</span>
    <span class="bracket-team-copy"><strong>${escapeHTML(team.name)}</strong><small>${st?`${st.w}-${st.l} regular season`:'Record unavailable'}</small></span>
    <span class="bracket-score">${score===null?'—':score}</span>
  </div>`;
}

function playoffUpsetHTML(game){
  if(!game?.result) return '';
  const winnerSeed=playoffSeed(game.result.winnerId);
  const loserId=game.result.winnerId===game.aId?game.bId:game.aId;
  const loserSeed=playoffSeed(loserId);
  return winnerSeed && loserSeed && winnerSeed>loserSeed ? `<span class="bracket-upset">Upset</span>` : '';
}

function playoffMatchHTML(game,label,key){
  const clickable=!!game?.result;
  const Tag=clickable?'button':'div';
  const attrs=clickable?` type="button" data-playoff-game="${key}" aria-label="View ${label} details"`:'';
  return `<${Tag} class="bracket-match ${clickable?'complete':''}"${attrs}>
    <div class="bracket-match-top"><span>${label}</span>${game?.result?`<span class="bracket-final-label">Final</span>${playoffUpsetHTML(game)}`:'<span class="bracket-pending">Pending</span>'}</div>
    ${playoffTeamRowHTML(game?.aId || null,game)}
    ${playoffTeamRowHTML(game?.bId || null,game)}
  </${Tag}>`;
}

function playoffBracketHTML(compact=false){
  const p=state.season.playoffs;
  if(!p) return '';
  const finalGame=p.final || {aId:null,bId:null,result:null};
  const championId=p.final?.result?.winnerId || null;
  const champion=championId?teamById(championId):null;
  const championStanding=championId?playoffStanding(championId):null;
  return `<div class="playoff-bracket-wrap ${compact?'compact':''}">
    <div class="playoff-bracket">
      <div class="bracket-round bracket-semis-stage">
        <div class="bracket-round-title"><span>Semifinals</span><small>#1 vs #4 • #2 vs #3</small></div>
        <div class="bracket-semi-stack">
          ${playoffMatchHTML(p.semis[0],'Semifinal 1','semi-0')}
          ${playoffMatchHTML(p.semis[1],'Semifinal 2','semi-1')}
        </div>
      </div>
      <div class="bracket-connector" aria-hidden="true"><i class="branch-top"></i><i class="branch-bottom"></i><i class="branch-spine"></i><i class="branch-final"></i></div>
      <div class="bracket-round bracket-final-stage">
        <div class="bracket-round-title"><span>Championship</span><small>Winners advance</small></div>
        ${playoffMatchHTML(finalGame,'League Final','final')}
        ${champion?`<div class="bracket-champion">${goldBadgeHTML('tiny')}<div><span>League Champion</span><strong>${escapeHTML(champion.name)}</strong><small>${championStanding?`${championStanding.w}-${championStanding.l} regular season • #${playoffSeed(championId)} seed`:'Champions'}</small></div></div>`:''}
      </div>
    </div>
    ${p.semis.some(g=>g.result)||p.final?.result?'<p class="bracket-hint">Tap a completed playoff matchup to view all six battles.</p>':''}
  </div>`;
}

function playoffLiveHTML(){
  return playoffBracketHTML(false);
}

function simToPlayoffs(){
  while(state.season.week<14){
    const next=state.season.week+1;
    state.season.schedule.filter(g=>g.week===next).forEach(g=>{
      const r=simulateScheduledGame(g);g.played=true;g.result=r;applyResult(g,r);recordPlayerStats(r,`Week ${next}`,false);
    });
    state.season.week=next;
  }
  if(!state.season.playoffs) createPlayoffs();
  render();
}

function userSeasonStanding(){
  return state.season?.standings?.find(x=>x.teamId==='user') || {w:0,l:0,pf:0,pa:0};
}

function userSeasonRank(){
  const i=rankedStandings().findIndex(x=>x.teamId==='user');
  return i>=0?i+1:null;
}

function userSeasonStreak(){
  const games=state.season.schedule.filter(g=>g.played&&(g.homeId==='user'||g.awayId==='user')).sort((a,b)=>a.week-b.week);
  if(!games.length) return {text:'—',type:'even'};
  const last=games[games.length-1];
  const lastWon=last.result.winnerId==='user';
  let count=0;
  for(let i=games.length-1;i>=0;i--){
    const won=games[i].result.winnerId==='user';
    if(won!==lastWon) break;
    count++;
  }
  return {text:`${lastWon?'W':'L'}${count}`,type:lastWon?'win':'loss'};
}

function currentUserMvp(){
  return rankedPlayerStats(x=>x.teamId==='user' && x.gp>0)[0] || null;
}

function teamRecordText(teamId){
  const st=state.season.standings.find(x=>x.teamId===teamId);
  return st?`${st.w}-${st.l}`:'0-0';
}

function playoffPictureText(){
  const s=state.season, rank=userSeasonRank();
  if(s.complete) return s.champion==='user'?'CHAMPION':'Season complete';
  if(s.week>=14){
    const seed=s.playoffs?.seeds?.find(x=>x.teamId==='user')?.seed;
    return seed?`#${seed} seed`:'Missed playoffs';
  }
  if(!rank) return '—';
  return rank<=4?`In • #${rank}`:`Outside • #${rank}`;
}

function lastUserPlayedGame(){
  const games=state.season.schedule.filter(g=>g.played&&(g.homeId==='user'||g.awayId==='user'));
  return games.sort((a,b)=>b.week-a.week)[0] || null;
}

function formatMultiplier(mult){
  if(mult===0) return '0×';
  if(mult===.25) return '¼×';
  if(mult===.5) return '½×';
  if(Number.isInteger(mult)) return `${mult}×`;
  return `${mult}×`;
}

function battleFeedbackData(battle){
  const a=pokemonById(battle.aId), b=pokemonById(battle.bId);
  const winner=battle.winnerId===a.id?a:b;
  const loser=winner.id===a.id?b:a;
  const comp=duelComponents(a,b);
  const winnerIsA=winner.id===a.id;
  const winnerMult=winnerIsA?comp.type.aMultiplier:comp.type.bMultiplier;
  const loserMult=winnerIsA?comp.type.bMultiplier:comp.type.aMultiplier;
  const favoredId=battle.expectedEdge>=0?a.id:b.id;
  const upset=winner.id!==favoredId && Math.abs(battle.expectedEdge)>=6;
  const speedDiff=winner.spe-loser.spe;
  const statDiff=winner.projectionScore-loser.projectionScore;
  const tags=[];
  if(upset) tags.push({text:'UPSET',kind:'upset'});
  if(winnerMult>=4) tags.push({text:`${formatMultiplier(winnerMult)} TYPE`,kind:'type'});
  else if(winnerMult>=2 && winnerMult>loserMult) tags.push({text:'TYPE EDGE',kind:'type'});
  if(speedDiff>=18) tags.push({text:'SPEED EDGE',kind:'speed'});
  if(statDiff>=22) tags.push({text:'STAT EDGE',kind:'stats'});
  if(!tags.length) tags.push({text:'CLOSE MATCHUP',kind:'even'});

  let reason='Won a close matchup where no single edge dominated.';
  if(upset){
    reason=`Pulled the upset despite the pre-battle matchup favoring ${loser.name}.`;
  } else if(winnerMult>=4){
    reason=`Exploited a huge ${formatMultiplier(winnerMult)} type matchup against ${loser.name}.`;
  } else if(winnerMult>=2 && winnerMult>loserMult){
    reason=`Had the stronger type matchup (${formatMultiplier(winnerMult)} offense vs ${formatMultiplier(loserMult)}).`;
  } else if(speedDiff>=18){
    reason=`Used a ${speedDiff}-point Speed advantage to swing the matchup.`;
  } else if(statDiff>=22){
    reason='Had the stronger overall base-stat profile.';
  }
  return {a,b,winner,loser,winnerMult,loserMult,upset,speedDiff,statDiff,tags,reason};
}

function battleFeedbackRowHTML(battle){
  const d=battleFeedbackData(battle);
  return `<div class="battle-feedback-row">
    <div class="battle-feedback-main"><span class="${battle.winnerId===d.a.id?'winner':''}">${d.a.name}</span><b>VS</b><span class="${battle.winnerId===d.b.id?'winner':''}">${d.b.name}</span></div>
    <div class="battle-feedback-tags">${d.tags.slice(0,3).map(t=>`<span class="${t.kind}">${t.text}</span>`).join('')}</div>
    <p><strong>${d.winner.name}</strong>: ${d.reason}</p>
  </div>`;
}

function battleRecapHTML(result){
  const feedback=result.battles.map(battleFeedbackData);
  const upsets=feedback.filter(x=>x.upset).length;
  const typeWins=feedback.filter(x=>x.winnerMult>=2 && x.winnerMult>x.loserMult).length;
  const speedWins=feedback.filter(x=>x.speedDiff>=18).length;
  return `<div class="battle-story-summary">
    <div><strong>${typeWins}</strong><span>Type-edge wins</span></div>
    <div><strong>${speedWins}</strong><span>Speed-edge wins</span></div>
    <div><strong>${upsets}</strong><span>Upsets</span></div>
  </div>
  <div class="battle-feedback-list">${result.battles.map(battleFeedbackRowHTML).join('')}</div>`;
}

function lastGameHighlight(game){
  if(!game?.result) return '';
  const userHome=game.homeId==='user';
  const opponent=teamById(userHome?game.awayId:game.homeId);
  const uw=userHome?game.result.aWins:game.result.bWins;
  const ow=userHome?game.result.bWins:game.result.aWins;
  const won=game.result.winnerId==='user';
  const all=game.result.battles.map(battleFeedbackData);
  const best=all.find(x=>x.upset) || [...all].sort((x,y)=>Math.max(y.winnerMult,1/y.loserMult)-Math.max(x.winnerMult,1/x.loserMult))[0];
  const story=best?`${best.winner.name}: ${best.reason}`:'';
  return `<div class="last-game-strip ${won?'win':'loss'}"><span>Last Game</span><strong>${won?'W':'L'} ${uw}-${ow} vs ${escapeHTML(opponent.name)}</strong><small>${escapeHTML(story)}</small></div>`;
}

function seasonHubHTML(nextOpponent){
  const st=userSeasonStanding();
  const rank=userSeasonRank();
  const streak=userSeasonStreak();
  const mvp=currentUserMvp();
  const mvpP=mvp?pokemonById(mvp.pokemonId):null;
  const nextRecord=nextOpponent?teamRecordText(nextOpponent.id):'';
  const last=lastUserPlayedGame();
  return `<section class="panel season-hub">
    <div class="season-hub-head"><div><span class="eyebrow">Season Hub</span><h2>${escapeHTML(userTeam().name)}</h2></div><span class="hub-week">${state.season.week<14?`Week ${state.season.week} / 14`:'Postseason'}</span></div>
    <div class="season-hub-grid">
      <div class="hub-stat primary"><span>Record</span><strong>${st.w}-${st.l}</strong></div>
      <div class="hub-stat"><span>League Rank</span><strong>${rank?`#${rank}`:'—'}</strong></div>
      <div class="hub-stat"><span>Streak</span><strong class="${streak.type}">${streak.text}</strong></div>
      <div class="hub-stat"><span>Playoff Picture</span><strong>${playoffPictureText()}</strong></div>
      <div class="hub-feature"><span>Next Opponent</span>${nextOpponent?`<strong>${escapeHTML(nextOpponent.name)}</strong><small>${nextRecord} record</small>`:'<strong>Season complete</strong><small>No game scheduled</small>'}</div>
      <div class="hub-feature mvp"><span>Team MVP</span>${mvpP?`<div><img src="${mvpP.sprite}" onerror="this.src='${spriteFallback(mvpP.id)}'" alt=""><strong>${mvpP.name}</strong></div><small>${mvp.w}-${mvp.l} • ${mvp.kos} KO</small>`:'<strong>Not yet</strong><small>Stats begin after Week 1</small>'}</div>
    </div>
    ${last?lastGameHighlight(last):''}
  </section>`;
}

function renderSeason(){
  const s=state.season, standings=rankedStandings();
  const userGames=s.schedule.filter(g=>g.homeId==='user'||g.awayId==='user');
  const regularGame=nextUserGame();
  const regularOpponent=regularGame?teamById(regularGame.homeId==='user'?regularGame.awayId:regularGame.homeId):null;
  let opponentOrder=null;
  if(regularGame&&regularOpponent){
    if(!regularGame.cpuOrder) regularGame.cpuOrder=cpuStrategicOrder(regularOpponent,userTeam());
    opponentOrder=regularGame.cpuOrder;
  }
  const playoffGame=s.week>=14?currentPlayoffUserGame():null;
  const playoffOpponent=playoffGame?teamById(playoffGame.aId==='user'?playoffGame.bId:playoffGame.aId):null;
  if(playoffGame&&playoffOpponent){
    if(!playoffGame.cpuOrder) playoffGame.cpuOrder=cpuStrategicOrder(playoffOpponent,userTeam());
    opponentOrder=playoffGame.cpuOrder;
  }
  const nextOpponent=regularOpponent || playoffOpponent;
  const matchup=regularOpponent?matchupPanelHTML(regularOpponent,`Week ${s.week+1}`,opponentOrder):playoffOpponent?matchupPanelHTML(playoffOpponent,state.season.playoffPhase==='semis'?'Playoff Semifinal':'Championship Match',opponentOrder):'';
  const title=s.week<14?'Regular Season':'Playoffs';
  const subtitle=s.week<14?`Week ${s.week} of 14`:`Regular season: ${state.season.standings.find(x=>x.teamId==='user').w}-${state.season.standings.find(x=>x.teamId==='user').l}`;
  const playoffButtonText=s.playoffPhase==='semis'?'Sim Semifinals':s.playoffPhase==='final'?'Sim Championship':'';
  const userAlive=!!playoffOpponent;
  const madePlayoffs=!!s.playoffs?.seeds?.some(x=>x.teamId==='user');
  const playoffNote=!madePlayoffs?'You did not qualify for the playoffs.':s.playoffPhase==='final'?'Your playoff run is over.':'Playoffs ready.';

  app.innerHTML=shell(`<div class="section-title"><div><h1>${title}</h1><p>${subtitle}</p></div></div>
  ${seasonHubHTML(nextOpponent)}
  ${matchup}
  <div class="season-actions">
    ${s.week<14?`<button class="btn primary" id="playWeek">Sim Week ${s.week+1}</button><button class="btn" id="simAll">Sim to Playoffs</button>`:''}
    ${s.week>=14&&!s.complete&&playoffButtonText?`<button class="btn primary" id="playoffsBtn">${playoffButtonText}</button>`:''}
  </div>
  ${s.week>=14&&!userAlive&&!s.complete?`<div class="panel playoff-note"><strong>${playoffNote}</strong><span class="muted"> You can still simulate the remaining round.</span></div>`:''}
  ${s.week>=14?`<section class="panel playoff-panel"><div class="playoff-panel-head"><div><h3>Playoff Bracket</h3><p>Seeds and records are from the regular season.</p></div></div>${playoffLiveHTML()}</section>`:''}
  <div class="season-grid">
    <section class="panel"><h3>Standings</h3><table class="standings"><thead><tr><th>#</th><th>Team</th><th>W</th><th>L</th><th>PF</th><th>PA</th></tr></thead><tbody>${standings.map((x,i)=>`<tr class="${x.teamId==='user'?'you':''}"><td>${i+1}</td><td>${teamById(x.teamId).name}</td><td>${x.w}</td><td>${x.l}</td><td>${x.pf}</td><td>${x.pa}</td></tr>`).join('')}</tbody></table>${s.week>=14?'<p class="muted small" style="margin-top:10px">Top four qualified for the playoffs.</p>':''}</section>
    <section class="panel"><h3>Your Pokémon</h3>${playerStatsTableHTML('user')}</section>
  </div>
  <div class="season-lower-grid">
    <section class="panel"><h3>Your Schedule</h3><div class="schedule">${userGames.map(gameRowHTML).join('')}</div></section>
    <section class="panel"><h3>League Leaders</h3>${leagueLeadersHTML()}</section>
  </div>`);

  const play=document.getElementById('playWeek'); if(play) play.onclick=playWeek;
  const all=document.getElementById('simAll'); if(all) all.onclick=simToPlayoffs;
  const po=document.getElementById('playoffsBtn'); if(po) po.onclick=simulatePlayoffs;
  bindLineupDrag();
  document.querySelectorAll('[data-game-index]').forEach(btn=>btn.onclick=()=>showGameModal(Number(btn.dataset.gameIndex)));
  document.querySelectorAll('[data-playoff-game]').forEach(btn=>btn.onclick=()=>showPlayoffGameModal(btn.dataset.playoffGame));
  bindPokemonDetailTriggers();
}

function gameRowHTML(g){
  const idx=state.season.schedule.indexOf(g);
  const opponentId=g.homeId==='user'?g.awayId:g.homeId;
  const opp=teamById(opponentId);
  if(!g.played) return `<div class="game-row"><span class="week">Wk ${g.week}</span><span>${opp.name}</span><span class="muted">—</span></div>`;
  const userHome=g.homeId==='user', uw=userHome?g.result.aWins:g.result.bWins, ow=userHome?g.result.bWins:g.result.aWins, won=g.result.winnerId==='user';
  return `<button class="game-row ${won?'win':'loss'}" data-game-index="${idx}" style="width:100%;color:inherit;text-align:left"><span class="week">Wk ${g.week}</span><span>${opp.name}</span><span class="result ${won?'win':'loss'}">${won?'W':'L'} ${uw}-${ow}</span></button>`;
}

function showGameModal(index){
  const g=state.season.schedule[index]; if(!g?.played)return;
  const home=teamById(g.homeId), away=teamById(g.awayId);
  state.modal={title:`${home.name} vs ${away.name}`,html:`
    <div class="battle-modal-score"><span>${escapeHTML(home.name)}</span><strong>${g.result.aWins}-${g.result.bWins}</strong><span>${escapeHTML(away.name)}</span></div>
    <p class="battle-feedback-intro">Battle feedback shows the biggest stat, Speed and type factors behind each 1v1 result. Upsets mean the random battle roll overcame the pre-battle edge.</p>
    ${battleRecapHTML(g.result)}`};
  renderModal();
}

function showPlayoffGameModal(key){
  const p=state.season?.playoffs;
  if(!p) return;
  let game=null,label='Playoff Match';
  if(key==='semi-0'){game=p.semis[0];label='Semifinal 1';}
  else if(key==='semi-1'){game=p.semis[1];label='Semifinal 2';}
  else if(key==='final'){game=p.final;label='Championship';}
  if(!game?.result) return;
  const a=teamById(game.aId), b=teamById(game.bId);
  const aSt=playoffStanding(a.id), bSt=playoffStanding(b.id);
  const winner=teamById(game.result.winnerId);
  state.modal={title:`${label}: ${a.name} vs ${b.name}`,html:`
    <div class="playoff-modal-summary">
      <div><span>#${playoffSeed(a.id)} ${escapeHTML(a.name)}</span><small>${aSt?`${aSt.w}-${aSt.l} regular season`:''}</small><strong>${game.result.aWins}</strong></div>
      <b>FINAL</b>
      <div><span>#${playoffSeed(b.id)} ${escapeHTML(b.name)}</span><small>${bSt?`${bSt.w}-${bSt.l} regular season`:''}</small><strong>${game.result.bWins}</strong></div>
    </div>
    <p class="playoff-modal-winner"><strong>${escapeHTML(winner.name)}</strong> advances${key==='final'?' as league champion':''}.</p>
    <p class="battle-feedback-intro">Battle feedback shows the biggest stat, Speed and type factors behind each 1v1 result.</p>
    ${battleRecapHTML(game.result)}`};
  renderModal();
}

function championshipEntryById(id){
  return career.championshipTeams.find(x=>x.id===id) || null;
}

function hallPokemonHTML(id,index,entry=null){
  const p=pokemonById(id);
  if(!p) return '';
  const st=entry?.playerStats?.find(x=>x.pokemonId===id);
  return `<div class="hall-mon" style="--delay:${index*55}ms"><span class="hall-number">${String(index+1).padStart(2,'0')}</span><img src="${p.sprite}" onerror="this.src='${spriteFallback(p.id)}'" alt="${p.name}"><strong>${p.name}</strong><small>${p.types.join(' / ')}</small>${st?`<span class="hall-record">${st.w}-${st.l} • ${st.kos} KO</span>`:''}</div>`;
}

function renderHallOfFame(){
  const entry=championshipEntryById(state.season?.championshipId) || career.championshipTeams[career.championshipTeams.length-1];
  if(!entry){ state.screen='recap'; render(); return; }
  const mvp=entry.teamMvpId?pokemonById(entry.teamMvpId):null;
  const currentEntry=state.season?.championshipId===entry.id;
  const newBadgeIds=currentEntry?(state.season?.newBadges||[]):[];
  app.innerHTML=shell(`<section class="hall-hero">
    <div class="hall-topline"><span>HALL OF CHAMPIONS</span><span>Title #${entry.titleNumber}</span></div>
    <div class="hall-title">${goldBadgeHTML('large')}<div><h1>${escapeHTML(entry.teamName)}</h1><p>League Champions • ${formatChampionshipDate(entry.wonAt)}</p></div></div>
    <div class="hall-team">${entry.roster.map((id,i)=>hallPokemonHTML(id,i,entry)).join('')}</div>
    <div class="hall-summary"><div><b>${entry.wins}-${entry.losses}</b><span>Regular Season</span></div><div><b>${entry.seed?`#${entry.seed}`:'—'}</b><span>Playoff Seed</span></div><div><b>${entry.draftGrade}</b><span>Draft Grade</span></div><div><b>${mvp?mvp.name:'—'}</b><span>Team MVP</span></div></div>
    ${newBadgeIds.length?`<div class="new-badges"><h3>New Trainer Badges</h3><div>${newBadgeIds.map(id=>{const ch=CHALLENGES.find(x=>x.id===id);return ch?`<div class="new-badge-item">${trainerBadgeHTML(ch,true,'small')}<strong>${ch.name}</strong></div>`:'';}).join('')}</div></div>`:''}
    <p class="hall-enshrined">This roster and its season stats have been permanently enshrined in Championship Teams.</p>
  </section>
  <div class="hall-actions"><button class="btn primary" id="continueRecap">Continue to Season Recap</button><button class="btn gold" id="viewChampions">View Championship Teams</button><button class="btn" id="viewBadges">Trainer Badges</button></div>`);
  document.getElementById('continueRecap').onclick=()=>{state.screen='recap';render();};
  document.getElementById('viewChampions').onclick=()=>{state.championsReturn='hall';state.screen='champions';render();};
  document.getElementById('viewBadges').onclick=()=>{state.screen='challenges';render();};
}

function championshipCardHTML(entry){
  const mvp=entry.teamMvpId?pokemonById(entry.teamMvpId):null;
  return `<article class="championship-card">
    <div class="championship-card-head">${goldBadgeHTML('small')}<div><div class="eyebrow">Title #${entry.titleNumber}</div><h2>${escapeHTML(entry.teamName)}</h2><p>${formatChampionshipDate(entry.wonAt)}</p></div><div class="championship-record"><b>${entry.wins}-${entry.losses}</b><span>Record</span></div></div>
    <div class="championship-meta"><span>Draft Grade <strong>${entry.draftGrade||'—'}</strong></span><span>Playoff Seed <strong>${entry.seed?`#${entry.seed}`:'—'}</strong></span>${mvp?`<span>Team MVP <strong>${mvp.name}</strong></span>`:''}${entry.badges?.length?`<span>Badges Earned <strong>${entry.badges.length}</strong></span>`:''}</div>
    <div class="championship-roster">${entry.roster.map(id=>{const p=pokemonById(id);const st=entry.playerStats?.find(x=>x.pokemonId===id);return p?`<div><img src="${p.sprite}" onerror="this.src='${spriteFallback(p.id)}'" alt="${p.name}"><strong>${p.name}</strong>${st?`<small>${st.w}-${st.l} • ${st.kos} KO</small>`:''}</div>`:'';}).join('')}</div>
  </article>`;
}

function renderChampionshipTeams(){
  const entries=[...career.championshipTeams].reverse();
  const legacyNote=!entries.length && career.championships>0 ? `<div class="panel"><p class="muted">Your existing title count is preserved. Championship rosters begin being saved with this version.</p></div>` : '';
  app.innerHTML=shell(`<div class="section-title"><div><h1>Championship Teams</h1><p>Your title-winning rosters are saved here permanently on this device.</p></div></div>
    <div class="championship-list">${entries.length?entries.map(championshipCardHTML).join(''):`<div class="panel empty-champions"><div>${goldBadgeHTML('large')}</div><h2>No championship teams yet</h2><p class="muted">Win the league and your six-Pokémon roster will be enshrined here.</p></div>`}${legacyNote}</div>`, `<button class="btn ghost" id="backHome">Back</button>`);
  document.getElementById('backHome').onclick=()=>{const target=state.championsReturn||'home';state.championsReturn='home';state.screen=target;render();};
}

function seasonAwardsHTML(){
  const a=state.season.awards || buildSeasonAwards();
  const league=a.leagueMvpId?pokemonById(a.leagueMvpId):null;
  const leagueSt=a.leagueMvpId?state.season.playerStats[a.leagueMvpId]:null;
  const user=a.userMvpId?pokemonById(a.userMvpId):null;
  const userSt=a.userMvpId?state.season.playerStats[a.userMvpId]:null;
  const steal=a.draftStealId?pokemonById(a.draftStealId):null;
  const stealTeam=a.draftStealTeamId?teamById(a.draftStealTeamId):null;
  const upset=a.biggestUpset;
  const upsetWinner=upset?pokemonById(upset.winnerId):null;
  const upsetLoser=upset?pokemonById(upset.loserId):null;
  return `<div class="awards-grid">
    <article class="award-card"><span>League MVP</span><strong>${league?league.name:'—'}</strong><small>${leagueSt?`${teamById(leagueSt.teamId).name} • ${leagueSt.w}-${leagueSt.l} • ${leagueSt.kos} KO`:'No stats'}</small></article>
    <article class="award-card"><span>Your Team MVP</span><strong>${user?user.name:'—'}</strong><small>${userSt?`${userSt.w}-${userSt.l} • ${userSt.kos} KO`:'No stats'}</small></article>
    <article class="award-card"><span>Draft Value</span><strong>${steal?steal.name:'—'}</strong><small>${steal?`${stealTeam?.name||''} • Pick ${a.draftStealPick} • Projected #${steal.projRank}`:'No pick'}</small></article>
    <article class="award-card"><span>Biggest Upset</span><strong>${upsetWinner?upsetWinner.name:'—'}</strong><small>${upsetWinner&&upsetLoser?`def. ${upsetLoser.name} • ${upset.stageLabel}`:'No major upset recorded'}</small></article>
  </div>`;
}

function renderRecap(){
  const st=rankedStandings(), you=st.find(x=>x.teamId==='user'), place=st.findIndex(x=>x.teamId==='user')+1;
  const champ=teamById(state.season.champion);
  const p=state.season.playoffs;
  const team=userTeam();
  const m=teamMetrics(team);
  const mvpId=state.season.awards?.userMvpId;
  const mvp=mvpId?pokemonById(mvpId):null;
  const newBadges=state.season.newBadges||[];
  app.innerHTML=shell(`<div class="section-title"><div><h1>Season Recap</h1><div class="recap-champ-line">${champ.id==='user'?goldBadgeHTML('tiny'):''}<p class="${champ.id==='user'?'champion':''}">${champ.id==='user'?'CHAMPIONS!':`${champ.name} won the championship`}</p></div></div></div>
  <section class="panel"><div class="recap-grid"><div class="recap-card"><b>${you.w}-${you.l}</b><span>Record</span></div><div class="recap-card"><b>${ordinal(place)}</b><span>Regular Season</span></div><div class="recap-card"><b>${letterGrade(m.overall)}</b><span>Draft Grade</span></div><div class="recap-card"><b>${mvp?mvp.name:'—'}</b><span>Team MVP</span></div></div>
  <h3>Season Awards</h3>${seasonAwardsHTML()}
  ${newBadges.length?`<div class="recap-badges"><h3>Trainer Badges Earned</h3><div>${newBadges.map(id=>{const ch=CHALLENGES.find(x=>x.id===id);return ch?`<div>${trainerBadgeHTML(ch,true,'small')}<strong>${ch.name}</strong></div>`:'';}).join('')}</div></div>`:''}
  <div class="recap-columns"><div><h3>Your Pokémon Stats</h3>${playerStatsTableHTML('user')}</div><div><h3>Playoffs</h3>${playoffHTML(p)}</div></div>
  </section>
  <div style="margin-top:16px;display:flex;gap:9px;flex-wrap:wrap"><button class="btn primary" id="draftAgain">Draft Again</button><button class="btn" id="badgesBtn">Trainer Badges</button><button class="btn" id="homeBtn">Main Menu</button></div>`);
  document.getElementById('draftAgain').onclick=()=>{state.screen='setup';render();};
  document.getElementById('badgesBtn').onclick=()=>{state.screen='challenges';render();};
  document.getElementById('homeBtn').onclick=()=>{state.screen='home';render();};
  document.querySelectorAll('[data-playoff-game]').forEach(btn=>btn.onclick=()=>showPlayoffGameModal(btn.dataset.playoffGame));
  bindPokemonDetailTriggers();
}

function playoffHTML(p){
  return playoffBracketHTML(true);
}

function pokemonSeasonStats(id){
  return state.season?.playerStats?.[id] || null;
}

function pokemonDetailModalHTML(p,stats=null){
  const totalGp=stats?.gp || 0;
  const totalW=stats?.w || 0;
  const totalL=stats?.l || 0;
  const playoffW=stats?.playoffW || 0;
  const playoffL=stats?.playoffL || 0;
  const regularW=Math.max(0,totalW-playoffW);
  const regularL=Math.max(0,totalL-playoffL);
  const regularGp=Math.max(0,totalGp-playoffW-playoffL);
  const winPct=totalGp?Math.round(totalW/totalGp*100):0;
  return `<div class="pokemon-detail">
    <div class="pokemon-detail-hero">
      <img src="${p.sprite}" onerror="this.src='${spriteFallback(p.id)}'" alt="${p.name}">
      <div><div class="types pokemon-detail-types">${p.types.map(t=>`<span class="type">${t}</span>`).join('')}</div><p>#${String(p.id).padStart(3,'0')} • Projected #${p.projRank}</p></div>
    </div>
    <div class="pokemon-detail-section">
      <h3>Base Stats</h3>
      <div class="pokemon-detail-base-stats">
        <div><span>HP</span><strong>${p.hp}</strong></div>
        <div><span>Attack</span><strong>${p.atk}</strong></div>
        <div><span>Defense</span><strong>${p.def}</strong></div>
        <div><span>Sp. Atk</span><strong>${p.spa}</strong></div>
        <div><span>Sp. Def</span><strong>${p.spd}</strong></div>
        <div><span>Speed</span><strong>${p.spe}</strong></div>
      </div>
    </div>
    <div class="pokemon-detail-section">
      <h3>Season Stats</h3>
      ${stats?`<div class="pokemon-detail-season-stats">
        <div><span>Games</span><strong>${totalGp}</strong></div>
        <div><span>Overall</span><strong>${totalW}-${totalL}</strong></div>
        <div><span>Win %</span><strong>${winPct}%</strong></div>
        <div><span>KOs</span><strong>${stats.kos || 0}</strong></div>
        <div><span>Regular Season</span><strong>${regularW}-${regularL}</strong><small>${regularGp} battles</small></div>
        <div><span>Playoffs</span><strong>${playoffW}-${playoffL}</strong></div>
      </div>`:`<p class="muted pokemon-detail-empty">Season stats will appear once the draft is complete and the season begins.</p>`}
    </div>
  </div>`;
}

function showPokemonDetailModal(id){
  const p=pokemonById(Number(id));
  if(!p) return;
  state.modal={title:p.name,html:pokemonDetailModalHTML(p,pokemonSeasonStats(p.id))};
  renderModal();
}

function bindPokemonDetailTriggers(){
  document.querySelectorAll('[data-pokemon-detail]').forEach(el=>{
    el.onclick=()=>showPokemonDetailModal(Number(el.dataset.pokemonDetail));
  });
}

function isStandaloneApp(){
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isIOSDevice(){
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function settingsInstructionsHTML(){
  return `<div class="settings-intro">
    <span class="settings-kicker">GEN 1 DRAFT LEAGUE</span>
    <p>Draft six Pokémon, manage your weekly battle order, survive the playoffs and build a permanent championship history.</p>
  </div>
  <div class="how-to-play-grid">
    <article class="how-step"><span>1</span><div><strong>Draw Your Draft Slot</strong><p>Every league begins with a random 1–8 draft position. The draft snakes for six rounds, so everyone finishes with six Pokémon.</p></div></article>
    <article class="how-step"><span>2</span><div><strong>Build Your Team</strong><p>Use base stats, typing, speed and roster balance to decide who to draft. Every Pokémon can only be selected once.</p></div></article>
    <article class="how-step"><span>3</span><div><strong>Set Your Battle Order</strong><p>Before each game, scout the CPU's locked order and drag your six Pokémon into the matchup slots you want. Each slot battles the Pokémon directly across from it.</p></div></article>
    <article class="how-step"><span>4</span><div><strong>Win Matchups</strong><p>Battle results use all six base stats, real dual-type effectiveness, speed and controlled randomness. Smart type matchups can overcome stronger Pokémon.</p></div></article>
    <article class="how-step"><span>5</span><div><strong>Reach the Playoffs</strong><p>Play a 14-game regular season. The top four teams advance to the semifinals, then the winners meet for the championship.</p></div></article>
    <article class="how-step"><span>6</span><div><strong>Build Your Legacy</strong><p>Earn trainer badges, track career stats and revisit every championship roster in the Hall of Champions.</p></div></article>
  </div>
  <div class="settings-tip"><strong>Tip</strong><span>Tap your Pokémon during the season or matchup screen to see its full base stats and season record.</span></div>`;
}

function installHelpText(){
  if(isStandaloneApp()) return 'This app is already installed on this device.';
  if(appInstallStatus) return appInstallStatus;
  if(deferredInstallPrompt) return 'Install it for a full-screen app experience and quick access from your home screen.';
  if(isIOSDevice()) return 'On iPhone or iPad, tap Share in Safari, then choose Add to Home Screen.';
  return 'If your browser does not show an install prompt, open its menu and choose Install app or Add to Home screen.';
}

function syncInstallButton(){
  const btn=document.getElementById('installAppButton');
  const help=document.getElementById('installHelp');
  if(!btn) return;
  const installed=isStandaloneApp();
  btn.disabled=installed;
  btn.textContent=installed?'APP INSTALLED':'INSTALL APP';
  if(help) help.textContent=installHelpText();
}

async function handleInstallApp(){
  if(isStandaloneApp()){ syncInstallButton(); return; }
  if(deferredInstallPrompt){
    const prompt=deferredInstallPrompt;
    deferredInstallPrompt=null;
    try{
      await prompt.prompt();
      const choice=await prompt.userChoice;
      appInstallStatus=choice?.outcome==='accepted'?'Install accepted. The app will appear on your device shortly.':'Install cancelled. You can try again from this menu.';
    }catch{
      appInstallStatus='Your browser could not open the install prompt. Try its menu and choose Install app.';
    }
    syncInstallButton();
    return;
  }
  appInstallStatus=isIOSDevice()
    ? 'On iPhone or iPad: tap Share in Safari, then tap Add to Home Screen.'
    : 'Open your browser menu and choose Install app or Add to Home screen.';
  syncInstallButton();
}

function openSettingsModal(){
  const old=document.querySelector('.modal-backdrop');
  if(old) old.remove();
  state.modal=null;
  const wrap=document.createElement('div');
  wrap.className='modal-backdrop settings-backdrop';
  wrap.setAttribute('role','dialog');
  wrap.setAttribute('aria-modal','true');
  wrap.setAttribute('aria-labelledby','settingsModalTitle');
  wrap.innerHTML=`<div class="modal settings-modal">
    <div class="settings-modal-head">
      <div><span class="eyebrow">SETTINGS</span><h2 id="settingsModalTitle">How to Play</h2></div>
      <button class="settings-close" id="closeSettings" type="button" aria-label="Close settings">×</button>
    </div>
    <div class="settings-modal-body">${settingsInstructionsHTML()}</div>
    <div class="settings-install">
      <button class="btn primary install-app-btn" id="installAppButton" type="button">INSTALL APP</button>
      <p id="installHelp"></p>
    </div>
  </div>`;
  document.body.appendChild(wrap);
  const close=()=>{
    document.removeEventListener('keydown',onKey);
    wrap.remove();
  };
  const onKey=e=>{ if(e.key==='Escape') close(); };
  document.addEventListener('keydown',onKey);
  document.getElementById('closeSettings').onclick=close;
  document.getElementById('installAppButton').onclick=handleInstallApp;
  wrap.onclick=e=>{ if(e.target===wrap) close(); };
  syncInstallButton();
}

function showCareerModal(){
  const topDrafted=Object.entries(career.pokemonDraftCounts).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const topWinners=Object.entries(career.pokemonSeasonWins).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const games=career.totalWins+career.totalLosses;
  const badgeCount=Object.keys(career.challengeBadges).length;
  state.modal={title:'Career Stats',html:`<div class="recap-grid"><div class="recap-card"><b>${career.drafts}</b><span>Drafts</span></div><div class="recap-card"><b>${career.championships}</b><span>Titles</span></div><div class="recap-card"><b>${badgeCount}/${CHALLENGES.length}</b><span>Trainer Badges</span></div><div class="recap-card"><b>${games?Math.round(career.totalWins/games*100):0}%</b><span>Career Win Rate</span></div></div><div class="career-lists"><div><h3>Most Drafted</h3><div class="cpu-list">${topDrafted.length?topDrafted.map(([id,count])=>`<div class="cpu-row"><span>${pokemonById(Number(id))?.name||`#${id}`}</span><strong>${count}×</strong></div>`).join(''):'<span class="muted small">Complete a draft to begin tracking.</span>'}</div></div><div><h3>Most Battle Wins</h3><div class="cpu-list">${topWinners.length?topWinners.map(([id,count])=>`<div class="cpu-row"><span>${pokemonById(Number(id))?.name||`#${id}`}</span><strong>${count}</strong></div>`).join(''):'<span class="muted small">Complete a season to begin tracking.</span>'}</div></div></div>`};
  renderModal();
}

function renderModal(){
  const old=document.querySelector('.modal-backdrop'); if(old)old.remove();
  const wrap=document.createElement('div'); wrap.className='modal-backdrop';
  wrap.innerHTML=`<div class="modal"><div class="section-title"><div><h2>${state.modal.title}</h2></div><button class="btn" id="closeModal">Close</button></div>${state.modal.html}</div>`;
  document.body.appendChild(wrap);
  document.getElementById('closeModal').onclick=()=>{wrap.remove();state.modal=null;};
  wrap.onclick=e=>{if(e.target===wrap){wrap.remove();state.modal=null;}};
}

function toast(msg){
  const el=document.createElement('div');el.className='toast';el.textContent=msg;document.body.appendChild(el);setTimeout(()=>el.remove(),1600);
}
function escapeHTML(str){ return String(str).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':'&quot;'}[c])); }

document.addEventListener('click', event => {
  const settingsButton=event.target.closest?.('#settingsButton');
  if(settingsButton){
    event.preventDefault();
    openSettingsModal();
  }
});

async function init(){
  try{
    renderLoading();
    state.pokemon=await loadPokemonData();
    state.screen='home';
    render();
    if('serviceWorker' in navigator){
      let refreshing=false;
      navigator.serviceWorker.addEventListener('controllerchange',()=>{
        if(refreshing) return;
        refreshing=true;
        // As soon as the newest worker takes control, reload once so nobody stays
        // on an old HTML/CSS/JS bundle after an update.
        window.location.reload();
      });

      navigator.serviceWorker.register('./sw.js?v=1.15.0',{updateViaCache:'none'})
        .then(reg=>{
          const activateNow=worker=>{
            if(worker) worker.postMessage({type:'SKIP_WAITING'});
          };
          activateNow(reg.waiting);
          reg.addEventListener('updatefound',()=>{
            const worker=reg.installing;
            if(!worker) return;
            worker.addEventListener('statechange',()=>{
              if(worker.state==='installed' && navigator.serviceWorker.controller){
                activateNow(worker);
              }
            });
          });
          // Explicitly check every time the app starts. updateViaCache:none makes
          // the worker script bypass the HTTP cache for update checks.
          return reg.update();
        })
        .catch(()=>{});
    }
  }catch(err){
    console.error(err);
    app.innerHTML=shell(`<div class="error-box"><h2>Couldn’t load Pokémon data</h2><p>${escapeHTML(err.message||'Unknown error')}</p><p class="small">Check your connection and reload. Once the Gen 1 data loads successfully it is cached locally for future sessions.</p><button class="btn" onclick="location.reload()">Retry</button></div>`);
  }
}

init();
