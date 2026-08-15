import React, { useState, useEffect, useMemo, useCallback } from "react";

/* ============================================================
   RAW PLAYER POOL — real 2026 preseason ADP order, team, bye
   Source: consensus half-PPR positional rankings, July 2026.
   [adpRank, name, team, bye]
   ============================================================ */
const RAW = {
  QB: [
    [1,"Josh Allen","BUF",7],[2,"Joe Burrow","CIN",6],[3,"Lamar Jackson","BAL",13],
    [4,"Dak Prescott","DAL",14],[5,"Drake Maye","NE",11],[6,"Patrick Mahomes","KC",5],
    [7,"Justin Herbert","LAC",7],[8,"Trevor Lawrence","JAX",7],[9,"Jayden Daniels","WAS",7],
    [10,"Jared Goff","DET",6],[11,"Jalen Hurts","PHI",10],[12,"Brock Purdy","SF",8],
    [13,"Matthew Stafford","LAR",11],[14,"Caleb Williams","CHI",10],[15,"Bo Nix","DEN",10],
    [16,"Jaxson Dart","NYG",8],[17,"Baker Mayfield","TB",10],[18,"Jordan Love","GB",11],
    [19,"Sam Darnold","SEA",11],[20,"C.J. Stroud","HOU",8],[21,"Tyler Shough","NO",8],
    [22,"Kyler Murray","MIN",6],[23,"Daniel Jones","IND",13],[24,"Malik Willis","MIA",6],
    [25,"Bryce Young","CAR",5],
  ],
  RB: [
    [1,"Jahmyr Gibbs","DET",6],[2,"Bijan Robinson","ATL",11],[3,"Christian McCaffrey","SF",8],
    [4,"Jonathan Taylor","IND",13],[5,"De'Von Achane","MIA",6],[6,"Derrick Henry","BAL",13],
    [7,"James Cook III","BUF",7],[8,"Ashton Jeanty","LV",13],[9,"Saquon Barkley","PHI",10],
    [10,"Omarion Hampton","LAC",7],[11,"Kenneth Walker III","KC",5],[12,"Chase Brown","CIN",6],
    [13,"Josh Jacobs","GB",11],[14,"Jeremiyah Love","ARI",14],[15,"Breece Hall","NYJ",13],
    [16,"Kyren Williams","LAR",11],[17,"Javonte Williams","DAL",14],[18,"Cam Skattebo","NYG",8],
    [19,"Travis Etienne Jr.","NO",8],[20,"D'Andre Swift","CHI",10],[21,"Bucky Irving","TB",10],
    [22,"Quinshon Judkins","CLE",11],[23,"David Montgomery","HOU",8],[24,"Bhayshul Tuten","JAX",7],
    [25,"TreVeyon Henderson","NE",11],[26,"Jaylen Warren","PIT",9],[27,"Jadarian Price","SEA",11],
    [28,"Tony Pollard","TEN",9],[29,"Rhamondre Stevenson","NE",11],[30,"Rico Dowdle","PIT",9],
    [31,"Chuba Hubbard","CAR",5],[32,"J.K. Dobbins","DEN",10],[33,"Aaron Jones Sr.","MIN",6],
    [34,"RJ Harvey","DEN",10],[35,"Kyle Monangai","CHI",10],[36,"Rachaad White","WAS",7],
    [37,"Kenny Gainwell","TB",10],[38,"Jacory Croskey-Merritt","WAS",7],[39,"Blake Corum","LAR",11],
    [40,"Jordan Mason","MIN",6],[41,"Tyjae Spears","TEN",9],[42,"Jonathon Brooks","CAR",5],
    [43,"Woody Marks","HOU",8],[44,"Chris Rodriguez Jr.","JAX",7],[45,"Tyrone Tracy Jr.","NYG",8],
    [46,"Isiah Pacheco","DET",6],[47,"Zach Charbonnet","SEA",11],[48,"Brian Robinson Jr.","ATL",11],
    [49,"Dylan Sampson","CLE",11],[50,"Alvin Kamara","NO",8],[51,"Tyler Allgeier","ARI",14],
    [52,"Justice Hill","BAL",13],[53,"Braelon Allen","NYJ",13],[54,"Samaje Perine","CIN",6],
    [55,"Keaton Mitchell","LAC",7],[56,"Ty Johnson","BUF",7],[57,"AJ Dillon","CAR",5],
    [58,"Jordan James","SF",8],[59,"Tank Bigsby","PHI",10],[60,"Mike Washington Jr.","LV",13],
    [61,"Kaelon Black","SF",8],[62,"Emari Demercado","KC",5],[63,"Chris Brooks","GB",11],
    [64,"James Conner","ARI",14],[65,"Malik Davis","DAL",14],[66,"Kimani Vidal","LAC",7],
    [67,"MarShawn Lloyd","GB",11],[68,"Sean Tucker","TB",10],[69,"Jaylen Wright","MIA",6],
    [70,"Emanuel Wilson","SEA",11],
  ],
  WR: [
    [1,"Puka Nacua","LAR",11],[2,"Ja'Marr Chase","CIN",6],[3,"Jaxon Smith-Njigba","SEA",11],
    [4,"Amon-Ra St. Brown","DET",6],[5,"Drake London","ATL",11],[6,"CeeDee Lamb","DAL",14],
    [7,"Justin Jefferson","MIN",6],[8,"A.J. Brown","NE",11],[9,"George Pickens","DAL",14],
    [10,"Chris Olave","NO",8],[11,"Tee Higgins","CIN",6],[12,"Nico Collins","HOU",8],
    [13,"Zay Flowers","BAL",13],[14,"Rashee Rice","KC",5],[15,"Garrett Wilson","NYJ",13],
    [16,"DeVonta Smith","PHI",10],[17,"Tetairoa McMillan","CAR",5],[18,"Terry McLaurin","WAS",7],
    [19,"Davante Adams","LAR",11],[20,"Ladd McConkey","LAC",7],[21,"Jameson Williams","DET",6],
    [22,"Jaylen Waddle","DEN",10],[23,"Malik Nabers","NYG",8],[24,"Luther Burden III","CHI",10],
    [25,"Emeka Egbuka","TB",10],[26,"Mike Evans","SF",8],[27,"Rome Odunze","CHI",10],
    [28,"DK Metcalf","PIT",9],[29,"Alec Pierce","IND",13],[30,"Christian Watson","GB",11],
    [31,"Carnell Tate","TEN",9],[32,"Marvin Harrison Jr.","ARI",14],[33,"DJ Moore","BUF",7],
    [34,"Courtland Sutton","DEN",10],[35,"Parker Washington","JAX",7],[36,"Brian Thomas Jr.","JAX",7],
    [37,"Michael Pittman Jr.","PIT",9],[38,"Jayden Reed","GB",11],[39,"Michael Wilson","ARI",14],
    [40,"Jordyn Tyson","NO",8],[41,"Chris Godwin Jr.","TB",10],[42,"Jordan Addison","MIN",6],
    [43,"Josh Downs","IND",13],[44,"Xavier Worthy","KC",5],[45,"Quentin Johnston","LAC",7],
    [46,"Romeo Doubs","NE",11],[47,"Jakobi Meyers","JAX",7],[48,"Ricky Pearsall","SF",8],
    [49,"Wan'Dale Robinson","TEN",9],[50,"Khalil Shakir","BUF",7],[51,"Makai Lemon","PHI",10],
    [52,"Jalen Coker","CAR",5],[53,"Matthew Golden","GB",11],[54,"Jayden Higgins","HOU",8],
    [55,"KC Concepcion","CLE",11],[56,"Rashid Shaheed","SEA",11],[57,"Jauan Jennings","MIN",6],
    [58,"Omar Cooper Jr.","NYJ",13],[59,"Denzel Boston","CLE",11],[60,"Tre Tucker","LV",13],
    [61,"Jalen Nailor","LV",13],[62,"Jalen McMillan","TB",10],[63,"Jerry Jeudy","CLE",11],
    [64,"Antonio Williams","WAS",7],[65,"Brandon Aiyuk","SF",8],[66,"Calvin Ridley","TEN",9],
    [67,"Germie Bernard","PIT",9],[68,"Rashod Bateman","BAL",13],[69,"Malik Washington","MIA",6],
    [70,"Ryan Flournoy","DAL",14],[71,"Adonai Mitchell","NYJ",13],[72,"Isaac TeSlaa","DET",6],
    [73,"Cooper Kupp","SEA",11],[74,"Tank Dell","HOU",8],[75,"Travis Hunter","JAX",7],
    [76,"Chris Bell","MIA",6],
  ],
  TE: [
    [1,"George Kittle","SF",8],[2,"David Njoku","LAC",7],[3,"Brock Bowers","LV",13],
    [4,"Travis Kelce","KC",5],[5,"T.J. Hockenson","MIN",6],[6,"Sam LaPorta","DET",6],
    [7,"Jake Ferguson","DAL",14],[8,"Tucker Kraft","GB",11],[9,"Evan Engram","DEN",10],
    [10,"Mark Andrews","BAL",13],[11,"Cade Otton","TB",10],[12,"Hunter Henry","NE",11],
    [13,"Kyle Pitts Sr.","ATL",11],[14,"Brenton Strange","JAX",7],[15,"Chig Okonkwo","WAS",7],
    [16,"Dallas Goedert","PHI",10],[17,"Dalton Kincaid","BUF",7],[18,"Mike Gesicki","CIN",6],
    [19,"Dalton Schultz","HOU",8],[20,"Theo Johnson","NYG",8],[21,"Juwan Johnson","NO",8],
    [22,"Ja'Tavion Sanders","CAR",5],[23,"Tyler Higbee","LAR",11],[24,"Tyler Conklin","DET",6],
    [25,"Colston Loveland","CHI",10],
  ],
  K: [
    [1,"Brandon Aubrey","DAL",14],[2,"Jason Myers","SEA",11],[3,"Cameron Dicker","LAC",7],
    [4,"Ka'imi Fairbairn","HOU",8],[5,"Harrison Mevis","LAR",11],[6,"Jake Bates","DET",6],
    [7,"Eddy Pineiro","SF",8],[8,"Tyler Loop","BAL",13],[9,"Cairo Santos","CHI",10],
    [10,"Trey Smack","GB",11],[11,"Chase McLaughlin","TB",10],[12,"Harrison Butker","KC",5],
    [13,"Cam Little","JAX",7],[14,"Evan McPherson","CIN",6],[15,"Will Reichard","MIN",6],
    [16,"Wil Lutz","DEN",10],[17,"Nick Folk","ATL",11],[18,"Tyler Bass","BUF",7],
    [19,"Andy Borregales","NE",11],[20,"Charlie Smyth","NO",8],[21,"Chris Boswell","PIT",9],
    [22,"Jake Moody","WAS",7],
  ],
  DEF: [
    [1,"Atlanta","ATL",11],[2,"New Orleans","NO",8],[3,"Dallas","DAL",14],
    [4,"San Francisco","SF",8],[5,"Jacksonville","JAX",7],[6,"Buffalo","BUF",7],
    [7,"Denver","DEN",10],[8,"Las Vegas","LV",13],[9,"Minnesota","MIN",6],
    [10,"Tampa Bay","TB",10],[11,"Detroit","DET",6],[12,"Green Bay","GB",11],
    [13,"NY Giants","NYG",8],[14,"Miami","MIA",6],[15,"Tennessee","TEN",9],
    [16,"Washington","WAS",7],[17,"Pittsburgh","PIT",9],[18,"LA Rams","LAR",11],
    [19,"Philadelphia","PHI",10],[20,"LA Chargers","LAC",7],[21,"Baltimore","BAL",13],
    [22,"New England","NE",11],
  ],
};

/* ============================================================
   DEFAULT ADJUSTABLE PARAMETERS
   Everything below drives the projections/VBD/tiers/auction math
   and is editable live from the "Calculations" tab.
   ============================================================ */
const DEFAULT_WEIGHTS = {
  koi:   { passYdsPerPt:25, passTD:4, intPenalty:2, rushYdsPerPt:10, rushTD:6, rec:0.5, recYdsPerPt:10, recTD:6, fumblePenalty:2 },
  final: { passYdsPerPt:25, passTD:6, intPenalty:4, rushYdsPerPt:10, rushTD:6, rec:1,   recYdsPerPt:10, recTD:6, fumblePenalty:2 },
  jordan:{ passYdsPerPt:25, passTD:6, intPenalty:4, rushYdsPerPt:10, rushTD:6, rec:1,   recYdsPerPt:10, recTD:6, fumblePenalty:2 },
};
// Fallback only — used before /api/leagues resolves (or if it fails).
// The real source of truth is server/leagues.js; keep these in sync with
// it so the fallback doesn't lie in the meantime.
const DEFAULT_REPLACEMENT = {
  koi:   { QB:15, RB:60, WR:66, TE:15, K:12, DEF:12 },
  final: { QB:15, RB:47, WR:55, TE:15, K:12, DEF:12 },
  jordan:{ QB:13, RB:47, WR:49, TE:13, K:10, DEF:10 },
};
const DEFAULT_TEAMS = { koi:12, final:12, jordan:10 };
const DEFAULT_ROSTER_SPOTS = { koi:15, final:15, jordan:16 };

/** /api/leagues rows use lowercase stat keys (qb/rb/wr/te/k/def, matching
 *  the db schema); App.jsx's replacement state uses uppercase (QB/RB/...). */
function replacementFromRow(row) {
  if (!row || !row.replacement) return null;
  const r = row.replacement;
  return { QB:r.qb, RB:r.rb, WR:r.wr, TE:r.te, K:r.k, DEF:r.def };
}
/** Per-league teams/rosterSpots/replacement, preferring the fetched
 *  /api/leagues config and falling back to the DEFAULT_* constants above
 *  for any league not yet loaded (or if the fetch failed). */
function baseLeagueParams(configs) {
  const teams = {}, rosterSpots = {}, replacement = {};
  for (const id of ["koi", "final", "jordan"]) {
    const row = configs[id];
    teams[id] = row?.teams ?? DEFAULT_TEAMS[id];
    rosterSpots[id] = row?.roster_spots ?? DEFAULT_ROSTER_SPOTS[id];
    replacement[id] = replacementFromRow(row) || DEFAULT_REPLACEMENT[id];
  }
  return { teams, rosterSpots, replacement };
}
const DEFAULT_TIER_PARAMS = { minGap:4, pctGap:0.14 };

/* ============================================================
   SCORING ENGINE — one formula, weights swapped per league
   ============================================================ */
function scorePoints(s, w) {
  return (s.passYds / w.passYdsPerPt) + (s.passTD * w.passTD) - (s.INT * w.intPenalty)
       + (s.rushYds / w.rushYdsPerPt) + (s.rushTD * w.rushTD)
       + (s.rec * w.rec) + (s.recYds / w.recYdsPerPt) + (s.recTD * w.recTD)
       - ((s.fumbles||0) * (w.fumblePenalty||0));
}

const NOTES = {
  "Josh Allen":["Complete QB1 package — elite arm plus 7-8 rushing TDs a year, the safest QB in the format.","Buffalo's offense could lean run-first more in tight games, capping ceiling weeks.","green"],
  "Joe Burrow":["Full seasons of Burrow have produced top-3 QB numbers with Chase/Higgins both healthy.","Injury history is the one real red flag after last year's wrist.","green"],
  "Lamar Jackson":["Rushing floor alone makes him a locked-in top-3 QB most weeks.","Ravens' run-heavy identity caps his passing volume relative to peers.","green"],
  "Dak Prescott":["Big arm, full weapons, should post QB1-tier counting stats again.","Turnover-prone in stretches; touchdown regression is possible.","yellow"],
  "Drake Maye":["Year 2 leap candidate with a legitimate rushing floor added to a live arm.","Still unproven — offensive line and weapons are a step behind the top tier.","yellow"],
  "Patrick Mahomes":["Still the standard for offensive execution when the pieces are healthy.","Receiving corps remains a question until it's proven on the field.","green"],
  "Justin Herbert":["Elite arm talent finally has a real backfield/offense around him.","Health and coaching continuity are perennial swing factors.","green"],
  "Trevor Lawrence":["Full arsenal returns and he's shown flashes of true QB1 ceiling.","Consistency has been the missing piece three years running.","yellow"],
  "Jayden Daniels":["Dual-threat production this explosive is basically a QB1 floor by itself.","Second-year defenses will scheme him differently; some regression is normal.","green"],
  "Jared Goff":["Efficient, high-volume passer in one of the league's best offenses.","Almost no rushing floor, so any passing dip hurts more.","yellow"],
  "Jalen Hurts":["Best rushing TD floor at the position when the tush push stays live.","Passing volume gets capped by a run-first gameplan behind Saquon.","green"],
  "Brock Purdy":["Full receiving corps and a great offensive infrastructure around him.","Ceiling is offense-dependent; a scheme change could cap the upside.","yellow"],
  "Matthew Stafford":["Big arm still humming in a great offensive environment.","Zero rushing equity and an age-related injury risk every year now.","yellow"],
  "Caleb Williams":["Year 2 with a real weapon upgrade and more rushing usage expected.","Offensive line questions linger; sacks were a problem as a rookie.","yellow"],
  "Bo Nix":["Comfortable in Payton's system with real weapons finally around him.","Ceiling still capped versus the true top tier of the position.","yellow"],
  "Jaxson Dart":["Rushing equity plus a full season as the starter gives real weekly floor.","Rookie-QB volatility is real — expect some ugly weeks mixed in.","pink"],
  "Baker Mayfield":["Should again push for a top-10 passing-volume season in Tampa's offense.","Turnover risk creeps up whenever the pocket collapses.","yellow"],
  "Jordan Love":["Full complement of weapons and a proven vertical arm.","Turnover bunches have hurt his weekly consistency before.","yellow"],
  "Sam Darnold":["Comfortable, low-mistake game manager in a talented Seattle offense.","Passing ceiling is limited without much rushing equity.","yellow"],
  "C.J. Stroud":["Talented enough to bounce back hard if the line holds up.","O-line and playcalling were real drags on him last season.","yellow"],
  "Kyler Murray":["Rushing equity alone keeps the streaming floor respectable.","Injury history and inconsistent offensive environment remain concerns.","yellow"],
  "Daniel Jones":["Rushing floor gives him streamer appeal in the right matchups.","Ceiling is capped as a game-manager in a run-first offense.","red"],
  "Bryce Young":["Better weapons and continuity finally give him a real shot.","Still needs to prove it after a rocky start to his career.","red"],

  "Jahmyr Gibbs":["Explosive, three-down workhorse now that Montgomery's been traded to Houston — no committee left to cap him.","Detroit's offensive line health and scheme continuity are the real swing factors now.","green"],
  "Bijan Robinson":["Full workhorse role now with receiving work added — elite floor and ceiling.","No real red flags — as safe a top pick as exists.","green"],
  "Christian McCaffrey":["When healthy, still the most complete back in football with receiving work galore.","Age and recent injury history are legitimate concerns on draft day.","yellow"],
  "Jonathan Taylor":["Bell-cow volume in a run-funnel offense — huge floor.","Limited receiving role caps the PPR ceiling somewhat.","green"],
  "De'Von Achane":["Home-run speed with real receiving work now — league-winner upside.","Touch total still shared in a crowded Miami backfield.","green"],
  "Derrick Henry":["Still bulldozing at an ageless rate with a great offensive line.","Receiving work is minimal, and the workload is finally a real age concern.","yellow"],
  "James Cook III":["Every-down role and goal-line usage in an explosive Buffalo offense.","Contract situation is worth monitoring for motivation/usage chatter.","green"],
  "Ashton Jeanty":["Talented rookie workhorse, immediately the clear lead back in Vegas.","Rookie-year offensive line and passing-down role are unproven.","yellow"],
  "Saquon Barkley":["Elite offensive line and a dominant offense make him a locked-in RB1.","Touch total could dip late in blowouts given Philly's depth.","green"],
  "Omarion Hampton":["Explosive rookie who profiles as an immediate three-down back.","Rookie learning curve and a crowded backfield to start are real risks.","yellow"],
  "Kenneth Walker III":["New offense/weapons around him should boost his efficiency further.","Receiving role has never fully been unlocked.","yellow"],
  "Chase Brown":["Proven three-down producer now firmly entrenched as the lead back.","Touch total dips whenever the offense scripts more pass-heavy.","green"],
  "Josh Jacobs":["Bell-cow workload in a good offensive situation again.","Age and wear are ticking up; efficiency could regress.","yellow"],
  "Jeremiyah Love":["Explosive rookie talent that could take over the backfield fast.","Committee to start his rookie year caps the immediate floor.","pink"],
  "Breece Hall":["Talent for a true three-down role if the Jets commit to him.","Offensive line and QB situation have capped efficiency before.","yellow"],
  "Kyren Williams":["Proven, goal-line-friendly early-down producer in a good offense.","Receiving role remains limited relative to his ADP.","yellow"],
  "Javonte Williams":["Fresh start with real early-down volume upside.","Efficiency has never matched the volume in his career.","yellow"],
  "Cam Skattebo":["Physical, three-down rookie profile that the Giants lean on early.","Offensive line and passing game around him are shaky.","pink"],
  "Travis Etienne Jr.":["Every-down role in an offense that should improve.","Efficiency dipped hard last year and touches could be shared.","yellow"],
  "D'Andre Swift":["Comfortable, receiving-friendly role in a decent offense.","Committee risk caps the weekly ceiling.","yellow"],
  "Bucky Irving":["Explosive, PPR-friendly role as a clear early-down/passing-down hybrid.","Size/workload concerns if touches climb even higher.","green"],
  "Quinshon Judkins":["Powerful early-down rookie with real touchdown equity.","Receiving-down role likely goes elsewhere, capping PPR value.","yellow"],
  "David Montgomery":["Traded to Houston and projected as the presumptive lead back, with Mixon expected to be released.","Woody Marks is a real threat to cut into his workload from day one in a new backfield.","yellow"],
  "Bhayshul Tuten":["Explosive rookie speed threat who could quickly force touches.","Timeshare at the start of his rookie year is a real risk.","pink"],
  "TreVeyon Henderson":["Talented pass-catching complement in an ascending Pats offense.","Early-down work likely shared, keeping this a committee role.","yellow"],
  "Jaylen Warren":["Proven, well-rounded back who produces whenever given volume.","Timeshare risk if the Steelers add competition.","yellow"],
  "Alvin Kamara":["Still an every-down, target-monster floor whenever healthy.","Age and a crowded backfield behind him are real concerns.","yellow"],
  "Tank Bigsby":["Change-of-pace back who could see a real bump in touches.","Buried on the depth chart unless something changes ahead of him.","red"],

  "Puka Nacua":["Elite target share in a pass-funnel offense — true WR1 upside.","Health has been the swing factor the last two seasons.","green"],
  "Ja'Marr Chase":["Best receiver in football when healthy, full target monopoly.","Very little downside here beyond generic injury risk.","green"],
  "Jaxon Smith-Njigba":["Emerged as a true alpha WR1 with a massive target share.","Efficiency regression is possible after a career year.","green"],
  "Amon-Ra St. Brown":["Elite, high-floor target hog in an explosive offense.","Touchdown equity could dip if the run game vultures scores.","green"],
  "Drake London":["Full-time WR1 role with a big catch radius and target volume.","Touchdown efficiency lagged behind his volume last year.","green"],
  "CeeDee Lamb":["Bounce-back candidate as the clear top target in Dallas.","Quarterback and offensive-line health are lingering concerns.","green"],
  "Justin Jefferson":["Simply an elite, matchup-proof alpha receiver every week.","Little real risk here beyond normal injury variance.","green"],
  "A.J. Brown":["Elite talent, but reunited with familiar concerns about target share.","Run-first gameplans have capped his weekly ceiling before.","yellow"],
  "George Pickens":["Big-play, high-catch-radius WR1 role in a new offense.","Volume consistency has been an issue throughout his career.","yellow"],
  "Chris Olave":["Proven, high-target WR1 whenever the QB play is stable.","Concussion history is a real lingering concern.","yellow"],
  "Tee Higgins":["Elite big-play threat opposite Chase, huge TD equity.","Injury history keeps him unavailable for stretches most years.","yellow"],
  "Nico Collins":["True alpha WR1 in a pass-heavy, explosive offense.","Health derailed last season and is worth tracking.","green"],
  "Zay Flowers":["Emerging as the clear go-to target in Baltimore's passing game.","Touchdown loop is capped by Lamar vulturing rushing scores.","yellow"],
  "Rashee Rice":["True target hog whenever available in a Mahomes-led offense.","Off-field/suspension risk has loomed over his outlook.","yellow"],
  "Garrett Wilson":["Full target monopoly regardless of QB play.","Quarterback instability keeps a lid on efficiency.","yellow"],
  "DeVonta Smith":["Reliable, high-floor route runner in an explosive offense.","Touchdown equity is capped behind Hurts/Barkley near the goal line.","yellow"],
  "Malik Nabers":["Elite target volume even in a rough offensive situation.","Quarterback play around him remains a real concern.","green"],
  "Mike Evans":["Still a touchdown machine whenever on the field.","Age and a crowded WR room could dent target share.","yellow"],
  "DK Metcalf":["Fresh start with a real chance to reclaim true WR1 volume.","New offense/QB chemistry is an unknown to open the year.","yellow"],
  "Marvin Harrison Jr.":["Elite talent poised for a big Year 2 target-share jump.","Rookie-year inconsistency showed up often; QB play is a question.","yellow"],

  "George Kittle":["Elite, matchup-proof TE1 whenever healthy and featured.","Health and target competition (Pearsall/Aiyuk) can dent volume.","green"],
  "David Njoku":["Proven high-volume producer now in a fresh situation.","New offense/QB chemistry is an unknown after the move.","yellow"],
  "Brock Bowers":["Elite target hog at the position — locked-in TE1 with WR-level volume.","Touchdown scoring has lagged the target share so far.","green"],
  "Travis Kelce":["Still productive when the offense funnels through him.","Father Time is undefeated — decline risk grows every year.","yellow"],
  "T.J. Hockenson":["Full recovery and a featured role make him a high-end TE1 bet.","Health track record adds real downside risk.","yellow"],
  "Sam LaPorta":["Proven, high-volume producer in the league's best offense.","Touchdown regression is possible in a crowded red zone.","green"],
  "Brock Bowers2":[],
};

function noteFor(pos, name, rank) {
  if (NOTES[name] && NOTES[name].length === 3) return NOTES[name];
  const genericPos = {
    QB:"Late-round streamer/backup with situational spot-start appeal.",
    RB:"Depth back who's one injury away from relevance — cheap stash.",
    WR:"Bench/depth receiver — role hinges on camp battles and target competition.",
    TE:"Streaming-tier TE, matchup and target-share dependent week to week.",
    K:"Kicker — draft last, stream if needed. Job security is the only real variable.",
    DEF:"Matchup-dependent streaming defense; schedule matters more than talent.",
  }[pos];
  const genericNeg = "Limited proven role — update this note after camp/preseason news.";
  const color = rank <= 8 ? "yellow" : "red";
  return [genericPos, genericNeg, color];
}

/* ============================================================
   BUILD PLAYER POOL — no synthetic stats. Every player starts
   blank (stats/flatPts null) until a real projection is imported
   via the CSV import panel; see computeLeagueFields below for how
   that blank is carried through points/VBD/tier/auction.
   ============================================================ */
function buildPool() {
  const players = [];
  let uid = 1;
  for (const pos of ["QB","RB","WR","TE","K","DEF"]) {
    for (const [rank, name, team, bye] of RAW[pos]) {
      const [pos1, neg1, outlook1] = noteFor(pos, name, rank);
      players.push({
        id: uid++, pos, name, team, bye, adpRank: rank,
        stats: null, flatPts: null,
        note: { pos: pos1, neg: neg1, outlook: outlook1 },
      });
    }
  }
  return players;
}

function computeLeagueFields(players, weights, rep, overrides) {
  const byPos = {};
  for (const p of players) (byPos[p.pos] = byPos[p.pos] || []).push(p);
  const ptsById = {};
  const importedById = {};
  for (const p of players) {
    const ov = overrides && overrides[p.id];
    if (ov && ov.points != null) {
      ptsById[p.id] = ov.points;
      importedById[p.id] = true;
    } else if (p.pos === "K" || p.pos === "DEF") {
      // No synthetic flat-points curve anymore — blank until a points column is imported.
      ptsById[p.id] = p.flatPts != null ? p.flatPts : null;
      importedById[p.id] = false;
    } else if (p.stats) {
      // Only reachable via an imported raw-stat line (statsOverride) — there's no
      // synthetic stat generator to fall back to anymore.
      ptsById[p.id] = Math.round(scorePoints(p.stats, weights)*10)/10;
      importedById[p.id] = false;
    } else {
      ptsById[p.id] = null;
      importedById[p.id] = false;
    }
  }
  const out = {};
  for (const pos of Object.keys(byPos)) {
    // Only players with a real projection participate in position rank/VBD/replacement —
    // a blank projection has no meaningful value yet, so it's excluded rather than
    // ranked last with a fabricated score.
    const list = [...byPos[pos]].filter(p => ptsById[p.id] != null).sort((a,b) => ptsById[b.id]-ptsById[a.id]);
    const repIdx = Math.min(rep[pos]||1, list.length) - 1;
    const repPts = list.length ? (list[repIdx] ? ptsById[list[repIdx].id] : ptsById[list[list.length-1].id]) : null;
    list.forEach((p, i) => {
      const vbd = Math.round((ptsById[p.id]-repPts)*10)/10;
      out[p.id] = { posRank: i+1, vbd, pts: ptsById[p.id], imported: importedById[p.id] };
    });
    for (const p of byPos[pos]) {
      if (!(p.id in out)) out[p.id] = { posRank: null, vbd: null, pts: null, imported: false };
    }
  }
  return out;
}

function computeTiers(players, fields, tierParams) {
  const byPos = {};
  for (const p of players) (byPos[p.pos] = byPos[p.pos] || []).push(p);
  const tiers = {};
  for (const pos of Object.keys(byPos)) {
    const list = [...byPos[pos]].filter(p => fields[p.id].vbd != null).sort((a,b) => fields[b.id].vbd - fields[a.id].vbd);
    let tier = 1;
    list.forEach((p, i) => {
      if (i > 0) {
        const prevVbd = fields[list[i-1].id].vbd;
        const curVbd = fields[p.id].vbd;
        const gap = prevVbd - curVbd;
        const threshold = Math.max(tierParams.minGap, Math.abs(prevVbd) * tierParams.pctGap);
        if (gap > threshold) tier++;
      }
      tiers[p.id] = tier;
    });
    for (const p of byPos[pos]) { if (!(p.id in tiers)) tiers[p.id] = null; }
  }
  return tiers;
}

function computeAuctionValues(players, fields, teams, rosterSpots, auctionOverrides) {
  const totalPool = teams * 200;
  const totalSpots = teams * rosterSpots;
  const hasOverride = (id) => auctionOverrides && auctionOverrides[id] != null;
  const importedTotal = players.reduce((s,p) => s + (hasOverride(p.id) ? auctionOverrides[p.id] : 0), 0);
  const importedSpots = players.filter(p => hasOverride(p.id)).length;
  const draftable = players.filter(p => !hasOverride(p.id) && fields[p.id].vbd > 0);
  const sumVbd = draftable.reduce((s,p) => s + fields[p.id].vbd, 0) || 1;
  const remaining = Math.max(0, totalPool - importedTotal - Math.max(0, totalSpots - importedSpots)*1);
  const values = {};
  for (const p of players) {
    if (hasOverride(p.id)) { values[p.id] = auctionOverrides[p.id]; continue; }
    if (fields[p.id].vbd == null) { values[p.id] = null; continue; }
    if (fields[p.id].vbd > 0) {
      values[p.id] = Math.max(1, Math.round(1 + (fields[p.id].vbd/sumVbd)*remaining));
    } else {
      values[p.id] = 1;
    }
  }
  return values;
}

/* ============================================================
   CSV IMPORT — for real projections/auction values from an
   external source (e.g. an exported UDK CSV)
   ============================================================ */
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i+1] === '"') { field += '"'; i++; } else { inQuotes = false; } }
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i+1] === "\n") i++;
        row.push(field); field = "";
        if (row.length > 1 || row[0] !== "") rows.push(row);
        row = [];
      } else field += c;
    }
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}
function normName(s) {
  return String(s || "").toLowerCase()
    .replace(/[.']/g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* ============================================================
   SLEEPER LIVE-DRAFT SYNC (Final Fantasy only) — read-only,
   advisory sync against the manually-entered draft board.
   There's no player-ID crosswalk yet (blocked on Will's UDK
   export, see PROJECT_CONTEXT.md), so matching is by normalized
   name + position — the same normName() already used for CSV-
   import matching. DEF picks match by team abbreviation instead
   (Sleeper's DEF pick metadata.team is already the same code the
   pool uses, e.g. "BAL" — verified against real Sleeper data).
   ============================================================ */
function buildPoolMatchIndex(pool) {
  const byNamePos = new Map();
  const byDefTeam = new Map();
  for (const p of pool) {
    if (p.pos === "DEF") byDefTeam.set(p.team, p.id);
    else byNamePos.set(normName(p.name) + "|" + p.pos, p.id);
  }
  return { byNamePos, byDefTeam };
}
function matchSleeperPick(pick, index) {
  const meta = pick.metadata || {};
  if (meta.position === "DEF") return index.byDefTeam.get(meta.team) ?? null;
  const name = `${meta.first_name || ""} ${meta.last_name || ""}`.trim();
  return index.byNamePos.get(normName(name) + "|" + meta.position) ?? null;
}
/** Compares fetched Sleeper picks against the current Final Fantasy draft
 *  board. Never mutates anything — returns what the caller should do with
 *  it, so this is testable independent of the polling/UI component. */
function reconcileSleeperPicks(picks, index, currentDraft, managerNameFor, nameById) {
  const patchMap = {};
  const unmatched = [];
  const conflicts = [];
  for (const pick of picks) {
    const id = matchSleeperPick(pick, index);
    const managerName = managerNameFor(pick.roster_id) || `Sleeper roster ${pick.roster_id}`;
    if (id == null) {
      const meta = pick.metadata || {};
      unmatched.push({ name: `${meta.first_name || ""} ${meta.last_name || ""}`.trim(), pos: meta.position, pickNo: pick.pick_no });
      continue;
    }
    const existing = currentDraft[id];
    if (!existing || !existing.drafted) {
      patchMap[id] = { drafted:true, manager:managerName, paid:"", sleeperPickNo:pick.pick_no, sleeperRound:pick.round, syncedFromSleeper:true };
    } else if (existing.syncedFromSleeper || existing.manager === managerName) {
      if (existing.sleeperPickNo !== pick.pick_no || existing.manager !== managerName) {
        patchMap[id] = { manager:managerName, sleeperPickNo:pick.pick_no, sleeperRound:pick.round, syncedFromSleeper:true };
      }
    } else {
      conflicts.push({ id, name: (nameById && nameById[id]) || id, localManager: existing.manager, sleeperManager: managerName });
    }
  }
  return { patchMap, unmatched, conflicts };
}


const OUTLOOK_STYLE = {
  green:  { bg:"#1c3a2a", border:"#3f9e5e", label:"Green — go get him" },
  yellow: { bg:"#3a3418", border:"#c9a227", label:"Yellow — proceed with caution" },
  red:    { bg:"#3a1f1f", border:"#c0453f", label:"Red — stay away" },
  pink:   { bg:"#3a1f30", border:"#d162a4", label:"Pink — late flyer" },
  purple: { bg:"#241a3a", border:"#8a63d1", label:"Purple — ignore" },
};
const POS_COLORS = { QB:"#d162a4", RB:"#3f9e5e", WR:"#4f8fd1", TE:"#c9a227", K:"#9a9a9a", DEF:"#c0453f" };
const LEAGUE_LABELS = { koi:"Koi", final:"Final Fantasy", jordan:"Jordan" };

function NumField({ label, value, onChange, step }) {
  return (
    <label style={{ display:"flex", flexDirection:"column", gap:2, fontSize:11, opacity:0.85, width:118 }}>
      <span style={{ opacity:0.65 }}>{label}</span>
      <input type="number" step={step || "any"} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ background:"#0f100b", border:"1px solid #33362a", borderRadius:6, color:"#e9e6dd", padding:"5px 6px", fontSize:12 }} />
    </label>
  );
}
function CurveCard({ title, desc, fields, values, onSet }) {
  return (
    <div style={{ background:"#15160f", border:"1px solid #262819", borderRadius:10, padding:12, flex:"1 1 320px", minWidth:300 }}>
      <div style={{ fontWeight:700, fontSize:13, color:"#f0d97a", marginBottom:2 }}>{title}</div>
      {desc && <div style={{ fontSize:11.5, opacity:0.65, marginBottom:10, lineHeight:1.4 }}>{desc}</div>}
      <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
        {fields.map(([key,label,step]) => (
          <NumField key={key} label={label} step={step} value={values[key]}
            onChange={v => onSet(key, v)} />
        ))}
      </div>
    </div>
  );
}

export default function DraftPrepApp() {
  const [users, setUsers] = useState([{ name: "Will" }]); // [{id,name}] — who can be picked in the header
  const [view, setView] = useState("koi"); // "koi" | "final" | "jordan" | "how"
  const [posFilter, setPosFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("vbd");
  const [sortDir, setSortDir] = useState("desc");
  const [draftByLeague, setDraftByLeague] = useState({ koi:{}, final:{}, jordan:{} });
  const [notesOverride, setNotesOverride] = useState({});
  const [managersByLeague, setManagersByLeague] = useState({ koi:["Will"], final:["Will"], jordan:["Will"] });
  const [managersTextByLeague, setManagersTextByLeague] = useState({ koi:"Will", final:"Will", jordan:"Will" });
  const [leagueConfigs, setLeagueConfigs] = useState({}); // id -> row from /api/leagues
  const [teamsByLeague, setTeamsByLeague] = useState(DEFAULT_TEAMS);
  const [rosterSpotsByLeague, setRosterSpotsByLeague] = useState(DEFAULT_ROSTER_SPOTS);
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);
  const [replacement, setReplacement] = useState(DEFAULT_REPLACEMENT);
  const [tierParams, setTierParams] = useState(DEFAULT_TIER_PARAMS);
  const [playerImports, setPlayerImports] = useState({}); // id -> {statsOverride, flatPtsOverride, koiPoints, finalPoints, auction}
  const [showSettings, setShowSettings] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/users").then(res => (res.ok ? res.json() : null)).then(list => {
      if (list && list.length) setUsers(list);
    }).catch(() => {}); // never blocks the app — solo/"Will" use works with no server round-trip
  }, []);

  useEffect(() => {
    (async () => {
      const [d, leagueRows] = await Promise.all([
        window.storage.get("ffb-draft-state").catch(() => null),
        fetch("/api/leagues").then(res => (res.ok ? res.json() : [])).catch(() => []),
      ]);

      const configs = {};
      for (const row of leagueRows || []) configs[row.id] = row;
      setLeagueConfigs(configs);
      const base = baseLeagueParams(configs);

      let teamsOverride = null, rosterSpotsOverride = null, replacementOverride = null;
      try {
        if (d && d.value) {
          const parsed = JSON.parse(d.value);
          let dbl = parsed.draftByLeague;
          if (!dbl && parsed.draft) dbl = { koi: parsed.draft, final: {} };
          dbl = dbl || {};
          setDraftByLeague({ koi:{}, final:{}, jordan:{}, ...dbl });
          setNotesOverride(parsed.notesOverride || {});
          let mbl = parsed.managersByLeague;
          if (!mbl && parsed.managers) mbl = { koi: parsed.managers, final: parsed.managers };
          mbl = { koi:["Will"], final:["Will"], jordan:["Will"], ...(mbl || {}) };
          setManagersByLeague(mbl);
          setManagersTextByLeague({
            koi:(mbl.koi||["Will"]).join(", "),
            final:(mbl.final||["Will"]).join(", "),
            jordan:(mbl.jordan||["Will"]).join(", "),
          });
          teamsOverride = parsed.teamsByLeague
            // migrate from the old global teams/rosterSpots format — only Koi's
            // settings panel ever exposed editing these, so a saved flat value
            // becomes a Koi-specific override.
            || (parsed.teams != null ? { koi: parsed.teams } : null);
          rosterSpotsOverride = parsed.rosterSpotsByLeague
            || (parsed.rosterSpots != null ? { koi: parsed.rosterSpots } : null);
          replacementOverride = parsed.replacement || null;
          setWeights({
            koi: { ...DEFAULT_WEIGHTS.koi, ...((parsed.weights||{}).koi||{}) },
            final: { ...DEFAULT_WEIGHTS.final, ...((parsed.weights||{}).final||{}) },
            jordan: { ...DEFAULT_WEIGHTS.jordan, ...((parsed.weights||{}).jordan||{}) },
          });
          setTierParams(parsed.tierParams || DEFAULT_TIER_PARAMS);
          let pImp = parsed.playerImports;
          if (!pImp && parsed.importsByLeague) {
            // migrate from the old per-league import format
            pImp = {};
            const koiOld = parsed.importsByLeague.koi || {};
            const finalOld = parsed.importsByLeague.final || {};
            for (const id of new Set([...Object.keys(koiOld), ...Object.keys(finalOld)])) {
              pImp[id] = {};
              if (koiOld[id] && koiOld[id].points != null) pImp[id].koiPoints = koiOld[id].points;
              if (koiOld[id] && koiOld[id].auction != null) pImp[id].auction = koiOld[id].auction;
              if (finalOld[id] && finalOld[id].points != null) pImp[id].finalPoints = finalOld[id].points;
            }
          }
          setPlayerImports(pImp || {});
        }
      } catch (e) { /* first run, no saved state */ }

      setTeamsByLeague({ ...base.teams, ...(teamsOverride || {}) });
      setRosterSpotsByLeague({ ...base.rosterSpots, ...(rosterSpotsOverride || {}) });
      setReplacement({
        koi: { ...base.replacement.koi, ...((replacementOverride||{}).koi||{}) },
        final: { ...base.replacement.final, ...((replacementOverride||{}).final||{}) },
        jordan: { ...base.replacement.jordan, ...((replacementOverride||{}).jordan||{}) },
      });
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const payload = JSON.stringify({
      draftByLeague, notesOverride, managersByLeague, teamsByLeague, rosterSpotsByLeague,
      weights, replacement, tierParams, playerImports,
    });
    window.storage.set("ffb-draft-state", payload).catch(() => {});
  }, [draftByLeague, notesOverride, managersByLeague, teamsByLeague, rosterSpotsByLeague, weights, replacement, tierParams, playerImports, loaded]);

  const pool = useMemo(() => buildPool(), []);
  const poolFinal = useMemo(() => pool.map(p => {
    const imp = playerImports[p.id];
    if (!imp) return p;
    const hasImport = !!(imp.statsOverride || imp.flatPtsOverride != null || imp.koiPoints != null || imp.finalPoints != null
      || imp.tier != null || imp.posRank != null || imp.risk != null || imp.upside != null || imp.outlook != null || imp.bye != null);
    return {
      ...p,
      stats: imp.statsOverride ? { ...(p.stats || {}), ...imp.statsOverride } : p.stats,
      flatPts: imp.flatPtsOverride != null ? imp.flatPtsOverride : p.flatPts,
      note: imp.outlook != null ? { ...p.note, pos: imp.outlook } : p.note,
      tierOverride: imp.tier != null ? imp.tier : null,
      posRankOverride: imp.posRank != null ? imp.posRank : null,
      risk: imp.risk != null ? imp.risk : null,
      upside: imp.upside != null ? imp.upside : null,
      outlookImported: imp.outlook != null,
      bye: imp.bye != null ? imp.bye : p.bye,
      byeImported: imp.bye != null,
      imported: hasImport,
      importSources: imp.sources || [],
    };
  }), [pool, playerImports]);
  const koiPointOverrides = useMemo(() => {
    const o = {};
    for (const id in playerImports) { if (playerImports[id].koiPoints != null) o[id] = { points: playerImports[id].koiPoints }; }
    return o;
  }, [playerImports]);
  const finalPointOverrides = useMemo(() => {
    const o = {};
    for (const id in playerImports) { if (playerImports[id].finalPoints != null) o[id] = { points: playerImports[id].finalPoints }; }
    return o;
  }, [playerImports]);
  const koiFields = useMemo(() => computeLeagueFields(poolFinal, weights.koi, replacement.koi, koiPointOverrides), [poolFinal, weights.koi, replacement.koi, koiPointOverrides]);
  const finalFields = useMemo(() => computeLeagueFields(poolFinal, weights.final, replacement.final, finalPointOverrides), [poolFinal, weights.final, replacement.final, finalPointOverrides]);
  const jordanFields = useMemo(() => computeLeagueFields(poolFinal, weights.jordan, replacement.jordan, {}), [poolFinal, weights.jordan, replacement.jordan]);
  const koiTiers = useMemo(() => computeTiers(poolFinal, koiFields, tierParams), [poolFinal, koiFields, tierParams]);
  const finalTiers = useMemo(() => computeTiers(poolFinal, finalFields, tierParams), [poolFinal, finalFields, tierParams]);
  const jordanTiers = useMemo(() => computeTiers(poolFinal, jordanFields, tierParams), [poolFinal, jordanFields, tierParams]);
  const koiAuctionOverrides = useMemo(() => {
    const o = {};
    for (const id in playerImports) { if (playerImports[id].auction != null) o[id] = playerImports[id].auction; }
    return o;
  }, [playerImports]);
  // Koi's is the only board with an auction, so its teams/rosterSpots are
  // always what drive the $200/team pool math, regardless of which tab is active.
  const auctionValues = useMemo(() => computeAuctionValues(poolFinal, koiFields, teamsByLeague.koi, rosterSpotsByLeague.koi, koiAuctionOverrides), [poolFinal, koiFields, teamsByLeague.koi, rosterSpotsByLeague.koi, koiAuctionOverrides]);

  const league = view === "how" ? "koi" : view;
  const teams = teamsByLeague[league];
  const rosterSpots = rosterSpotsByLeague[league];
  const fields = league === "koi" ? koiFields : league === "jordan" ? jordanFields : finalFields;
  const tiers = league === "koi" ? koiTiers : league === "jordan" ? jordanTiers : finalTiers;
  const draft = draftByLeague[league] || {};
  const managers = managersByLeague[league] || ["Will"];
  const managersText = managersTextByLeague[league] || "";

  const rows = useMemo(() => {
    let list = poolFinal.map(p => ({
      ...p,
      vbd: fields[p.id].vbd,
      posRank: p.posRankOverride != null ? p.posRankOverride : fields[p.id].posRank,
      posRankImported: p.posRankOverride != null,
      tier: p.tierOverride != null ? p.tierOverride : tiers[p.id],
      tierImported: p.tierOverride != null,
      auction: auctionValues[p.id],
      auctionImported: koiAuctionOverrides[p.id] != null,
      pts: fields[p.id].pts,
      ptsImported: !!p.imported,
      d: draft[p.id] || { drafted:false, manager:"", paid:"" },
      noteData: notesOverride[p.id] || p.note,
    }));
    if (posFilter !== "ALL") list = list.filter(p => p.pos === posFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(s) || p.team.toLowerCase().includes(s));
    }
    const sortVal = (r, key) => {
      switch (key) {
        case "tier": return r.tier;
        case "pos": return r.pos;
        case "name": return r.name;
        case "team": return r.team;
        case "bye": return r.bye;
        case "adp": return r.adpRank;
        case "posRank": return parseInt(String(r.posRank).replace(/[^0-9]/g,""), 10) || 0;
        case "pts": return r.pts;
        case "vbd": return r.vbd;
        case "auction": return r.auction;
        case "risk": return r.risk || "";
        case "upside": return r.upside || "";
        case "outlook": return r.noteData.outlook;
        default: return r.vbd;
      }
    };
    list.sort((a, b) => {
      const av = sortVal(a, sortKey), bv = sortVal(b, sortKey);
      // Blank projections (null) always sort last, regardless of direction —
      // there's nothing to rank them by.
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = (typeof av === "string" || typeof bv === "string")
        ? String(av).localeCompare(String(bv))
        : av - bv;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [poolFinal, fields, tiers, auctionValues, koiAuctionOverrides, draft, notesOverride, posFilter, search, sortKey, sortDir]);

  const SORT_DEFAULT_DIR = { tier:"asc", pos:"asc", name:"asc", team:"asc", bye:"asc", adp:"asc",
    posRank:"asc", pts:"desc", vbd:"desc", auction:"desc", risk:"asc", upside:"asc", outlook:"asc" };
  const handleSort = useCallback((key) => {
    setSortKey(prev => {
      if (prev === key) { setSortDir(d => d === "asc" ? "desc" : "asc"); return prev; }
      setSortDir(SORT_DEFAULT_DIR[key] || "desc");
      return key;
    });
  }, []);

  const setDraftField = useCallback((id, patch) => {
    setDraftByLeague(all => {
      const cur = all[league] || {};
      return { ...all, [league]: { ...cur, [id]: { ...(cur[id]||{drafted:false,manager:"",paid:""}), ...patch } } };
    });
  }, [league]);
  const setManagersForLeague = useCallback((text) => {
    setManagersTextByLeague(all => ({ ...all, [league]: text }));
    setManagersByLeague(all => ({ ...all, [league]: text.split(",").map(s=>s.trim()).filter(Boolean) }));
  }, [league]);
  // Sleeper sync always targets Final Fantasy specifically, regardless of
  // which tab is currently active — unlike setDraftField/setManagersForLeague
  // above, which close over whichever league the user is currently viewing.
  const mergeSyncedFinalPicks = useCallback((patchMap) => {
    setDraftByLeague(all => {
      const cur = all.final || {};
      const merged = { ...cur };
      for (const id in patchMap) {
        merged[id] = { ...(merged[id] || {drafted:false,manager:"",paid:""}), ...patchMap[id] };
      }
      return { ...all, final: merged };
    });
  }, []);
  const addManagersForFinal = useCallback((names) => {
    if (!names.length) return;
    setManagersByLeague(all => {
      const merged = [...new Set([...(all.final || []), ...names])];
      return { ...all, final: merged };
    });
    setManagersTextByLeague(all => {
      const curList = (all.final || "").split(",").map(s=>s.trim()).filter(Boolean);
      const merged = [...new Set([...curList, ...names])];
      return { ...all, final: merged.join(", ") };
    });
  }, []);
  const setNote = useCallback((id, patch, base) => {
    setNotesOverride(n => ({ ...n, [id]: { ...(n[id]||base), ...patch } }));
  }, []);
  const setWeight = useCallback((lg, key, value) => {
    setWeights(w => ({ ...w, [lg]: { ...w[lg], [key]: value } }));
  }, []);
  const setRep = useCallback((lg, key, value) => {
    setReplacement(r => ({ ...r, [lg]: { ...r[lg], [key]: value } }));
  }, []);
  const setTeamsFor = useCallback((lg, value) => {
    setTeamsByLeague(t => ({ ...t, [lg]: value }));
  }, []);
  const setRosterSpotsFor = useCallback((lg, value) => {
    setRosterSpotsByLeague(r => ({ ...r, [lg]: value }));
  }, []);
  const applyImport = useCallback((overridesById) => {
    setPlayerImports(all => {
      const merged = { ...all };
      for (const id in overridesById) {
        const prior = merged[id] || {};
        const incoming = overridesById[id];
        merged[id] = {
          ...prior, ...incoming,
          statsOverride: (prior.statsOverride || incoming.statsOverride)
            ? { ...(prior.statsOverride||{}), ...(incoming.statsOverride||{}) }
            : undefined,
          sources: [...(prior.sources || []), ...(incoming.sources || [])],
        };
      }
      return merged;
    });
  }, []);
  const clearImport = useCallback(() => {
    setPlayerImports({});
  }, []);
  const resetAllCalcParams = () => {
    if (confirm("Reset all scoring weights, replacement levels, and team/roster settings back to defaults? This won't clear imported data.")) {
      const base = baseLeagueParams(leagueConfigs);
      setWeights(DEFAULT_WEIGHTS);
      setReplacement(base.replacement); setTierParams(DEFAULT_TIER_PARAMS);
      setTeamsByLeague(base.teams); setRosterSpotsByLeague(base.rosterSpots);
    }
  };

  const exportCSV = () => {
    const header = ["ADP","Tier","Pos","Player","Team","Bye","PosRank","Proj Pts","VBD"]
      .concat(league==="koi" ? ["Auction $"] : [])
      .concat(["Drafted","Manager","Paid","Risk","Upside","Outlook","Positive","Negative"]);
    const lines = [header.join(",")];
    for (const r of rows) {
      const row = [r.adpRank, r.tier, r.pos, `"${r.name}"`, r.team, r.bye, r.posRank, r.pts, r.vbd]
        .concat(league==="koi" ? [r.auction] : [])
        .concat([r.d.drafted?"Y":"N", `"${r.d.manager||""}"`, r.d.paid||"", `"${r.risk||""}"`, `"${r.upside||""}"`, r.noteData.outlook,
                 `"${r.noteData.pos}"`, `"${r.noteData.neg}"`]);
      lines.push(row.join(","));
    }
    const blob = new Blob([lines.join("\n")], {type:"text/csv"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `ffb-${league}-board.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const resetDraft = () => {
    const label = league === "koi" ? "Koi" : league === "jordan" ? "Jordan" : "Final Fantasy";
    if (confirm(`Clear all drafted/manager/paid marks for the ${label} board? This can't be undone.`)) {
      setDraftByLeague(all => ({ ...all, [league]: {} }));
    }
  };

  const draftedCount = Object.values(draft).filter(d => d && d.drafted).length;
  const spent = Object.values(draft).filter(d => d && d.drafted && d.paid).reduce((s,d)=>s+Number(d.paid||0),0);

  return (
    <div style={{
      fontFamily: "'Bahnschrift','Segoe UI',Arial,sans-serif",
      background: "#12130f", color: "#e9e6dd", minHeight: "100%", padding: "20px",
      backgroundImage: "radial-gradient(circle at 10% 0%, #1a2418 0%, #12130f 55%)",
    }}>
      <style>{`
        * { box-sizing: border-box; }
        input, select, textarea, button { font-family: inherit; }
        table { border-collapse: collapse; width: 100%; }
        th { position: sticky; top: 0; background: #1b1d15; z-index: 2; }
        tr:hover td { background: #1c1e16 !important; }
        ::-webkit-scrollbar { height: 10px; width: 10px; }
        ::-webkit-scrollbar-thumb { background: #3a3d2c; border-radius: 6px; }
        button { cursor: pointer; }
        input[type=number]::-webkit-inner-spin-button { opacity: 0.6; }
      `}</style>

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", flexWrap:"wrap", gap:12, marginBottom:16 }}>
        <div>
          <div style={{ fontSize:11, letterSpacing:3, color:"#c9a227", fontWeight:700 }}>WILL'S FANTASY FOOTBALL</div>
          <h1 style={{ margin:"2px 0 0", fontSize:32, fontWeight:800, letterSpacing:0.5 }}>Draft Prep Board — 2026</h1>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"flex-end" }}>
          <label style={{...lbl(), flexDirection:"row", alignItems:"center", gap:6}}>
            <span style={{opacity:0.65}}>Viewing as</span>
            <select
              value={(typeof localStorage !== "undefined" && localStorage.getItem("ffb-user")) || "Will"}
              onChange={async e => {
                const val = e.target.value;
                let name = val;
                if (val === "__new__") {
                  name = (prompt("New user's name?") || "").trim();
                  if (!name) return;
                  try {
                    await fetch("/api/users", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ name }),
                    });
                  } catch (err) { /* server get-or-creates it on the next request anyway */ }
                }
                localStorage.setItem("ffb-user", name);
                window.location.reload(); // simplest correct way to re-run every load effect against the new user
              }}
              style={inp(140)}
            >
              {users.map(u => <option key={u.id ?? u.name} value={u.name}>{u.name}</option>)}
              <option value="__new__">+ New user…</option>
            </select>
          </label>
          {view !== "how" && (
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={()=>setShowSettings(s=>!s)} style={btnStyle()}>Settings</button>
              <button onClick={exportCSV} style={btnStyle()}>Export CSV</button>
              <button onClick={resetDraft} style={btnStyle("#3a1f1f","#c0453f")}>Reset Draft</button>
            </div>
          )}
        </div>
      </div>

      {league === "final" && view !== "how" && (
        <SleeperSyncPanel
          sourceLeagueId={leagueConfigs.final && leagueConfigs.final.source_league_id}
          pool={poolFinal}
          draft={draftByLeague.final || {}}
          onMergePicks={mergeSyncedFinalPicks}
          onAddManagers={addManagersForFinal}
        />
      )}

      {view !== "how" && showSettings && (
        <div style={panelStyle()}>
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:0.5, color:"#c9a227", marginBottom:10, textTransform:"uppercase" }}>
            {league === "koi" ? "Koi — $200 Auction Settings" : `${LEAGUE_LABELS[league] || league} — Standard Draft Settings`}
          </div>
          <div style={{ display:"flex", gap:24, flexWrap:"wrap" }}>
            {league === "koi" && (
              <>
                <label style={lbl()}>Koi teams
                  <input type="number" min="4" max="20" value={teams}
                    onChange={e=>setTeamsFor("koi", Math.max(4,Number(e.target.value)||DEFAULT_TEAMS.koi))} style={inp(60)} />
                </label>
                <label style={lbl()}>Roster spots/team
                  <input type="number" min="10" max="30" value={rosterSpots}
                    onChange={e=>setRosterSpotsFor("koi", Math.max(10,Number(e.target.value)||DEFAULT_ROSTER_SPOTS.koi))} style={inp(60)} />
                </label>
                <label style={lbl()}>Auction pool
                  <div style={{...inp(90), display:"flex", alignItems:"center"}}>${teams*200}</div>
                </label>
              </>
            )}
            <div style={{flex:1, minWidth:220}}>
              <div style={{fontSize:11, opacity:0.7, marginBottom:4}}>
                {LEAGUE_LABELS[league] || league} owners (comma separated)
              </div>
              <input value={managersText}
                onChange={e=>setManagersForLeague(e.target.value)}
                style={{...inp("100%"), width:"100%"}} />
            </div>
          </div>
          {league !== "koi" && (
            <div style={{ fontSize:12, opacity:0.7, marginTop:10 }}>
              Standard snake draft — no auction pool or price tracking here. Mark players drafted and assign
              the owner as picks happen; the Paid column only shows up on the Koi board.
            </div>
          )}
          <div style={{ fontSize:12, opacity:0.65, marginTop:10, lineHeight:1.5 }}>
            Want to see or tweak the actual VBD/scoring/projection math? Open the
            <b style={{color:"#f0d97a"}}> "Calculations"</b> tab above the board.
          </div>
        </div>
      )}

      <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" }}>
        {[["koi","Koi — $200 Auction · Half-PPR"],["final","Final Fantasy · Full PPR"],["jordan","Jordan"],["how","Calculations"]].map(([k,label]) => (
          <button key={k} onClick={()=>setView(k)} style={{
            padding:"10px 18px", borderRadius:8, border:"1px solid " + (view===k ? "#c9a227" : "#33362a"),
            background: view===k ? "#2a2a18" : "#181910", color: view===k ? "#f0d97a" : "#c9c6ba",
            fontWeight:700, fontSize:14,
          }}>{label}</button>
        ))}
        {view !== "how" && (
          <div style={{ marginLeft:"auto", fontSize:13, opacity:0.75, alignSelf:"center" }}>
            Drafted: {draftedCount} {league==="koi" && <> · Spent: ${spent} / ${teams*200}</>}
          </div>
        )}
      </div>

      {view === "how" ? (
        <MethodologyTab
          weights={weights} setWeight={setWeight}
          replacement={replacement} setRep={setRep}
          tierParams={tierParams} setTierParams={setTierParams}
          teams={teams} rosterSpots={rosterSpots}
          onReset={resetAllCalcParams}
          pool={pool}
          playerImports={playerImports}
          onApplyImport={applyImport}
          onClearImport={clearImport}
        />
      ) : (
        <>
          <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap", alignItems:"center" }}>
            {["ALL","QB","RB","WR","TE","K","DEF"].map(p => (
              <button key={p} onClick={()=>setPosFilter(p)} style={{
                padding:"6px 12px", borderRadius:20, fontSize:12, fontWeight:700,
                border:"1px solid " + (posFilter===p ? (POS_COLORS[p]||"#c9a227") : "#33362a"),
                background: posFilter===p ? "#20211a" : "transparent",
                color: posFilter===p ? (POS_COLORS[p]||"#f0d97a") : "#9c998e",
              }}>{p}</button>
            ))}
            <input placeholder="Search player or team..." value={search} onChange={e=>setSearch(e.target.value)}
              style={{...inp(220), marginLeft:8}} />
            <span style={{ fontSize:11, opacity:0.5 }}>Click a column header to sort</span>
          </div>

          <div style={{ border:"1px solid #2a2c20", borderRadius:10, overflow:"auto", maxHeight:"70vh" }}>
            <table>
              <thead>
                <tr style={{ fontSize:11, textTransform:"uppercase", letterSpacing:0.6, color:"#a9a795" }}>
                  <th style={th()}>Drafted</th>
                  <SortTh label="Tier" col="tier" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortTh label="Pos" col="pos" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortTh label="Player" col="name" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="left" />
                  <SortTh label="Team" col="team" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortTh label="Bye" col="bye" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortTh label="ADP" col="adp" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortTh label="Pos Rk" col="posRank" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortTh label="Proj Pts" col="pts" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortTh label="VBD" col="vbd" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  {league==="koi" && <SortTh label="Auction $" col="auction" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />}
                  {league==="koi" && <th style={th()}>Paid</th>}
                  <th style={th()}>Manager</th>
                  <SortTh label="Risk" col="risk" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortTh label="Upside" col="upside" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortTh label="Outlook" col="outlook" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const style = OUTLOOK_STYLE[r.noteData.outlook] || OUTLOOK_STYLE.yellow;
                  const isOpen = expanded === r.id;
                  return (
                    <React.Fragment key={r.id}>
                      <tr style={{ opacity: r.d.drafted ? 0.45 : 1, cursor:"pointer" }}
                          onClick={()=>setExpanded(isOpen ? null : r.id)}>
                        <td style={td()} onClick={e=>e.stopPropagation()}>
                          <input type="checkbox" checked={!!r.d.drafted}
                            onChange={e=>setDraftField(r.id,{drafted:e.target.checked})} />
                        </td>
                        <td style={td()}>{r.tier ?? "—"}{r.tierImported && <sup style={badgeSup()}>FFB</sup>}</td>
                        <td style={{...td(), color:POS_COLORS[r.pos], fontWeight:700}}>{r.pos}</td>
                        <td style={{...td("left"), fontWeight:600}}>{r.name}</td>
                        <td style={td()}>{r.team}</td>
                        <td style={td()}>{r.bye}{r.byeImported && <sup style={badgeSup()}>FFB</sup>}</td>
                        <td style={td()}>{r.adpRank}</td>
                        <td style={td()}>{r.posRank == null ? "—" : (/[A-Za-z]/.test(String(r.posRank)) ? r.posRank : `${r.pos}${r.posRank}`)}{r.posRankImported && <sup style={badgeSup()}>FFB</sup>}</td>
                        <td style={td()}>{r.pts != null ? r.pts.toFixed(1) : "—"}{r.ptsImported && <sup style={badgeSup()}>FFB</sup>}</td>
                        <td style={{...td(), color: r.vbd == null ? "#7c7a6d" : (r.vbd>=0 ? "#7fd18f" : "#e08a8a")}}>{r.vbd != null ? r.vbd.toFixed(1) : "—"}</td>
                        {league==="koi" && <td style={{...td(), fontWeight:700}}>{r.auction != null ? `$${r.auction}` : "—"}{r.auctionImported && <sup style={badgeSup()}>FFB</sup>}</td>}
                        {league==="koi" && (
                          <td style={td()} onClick={e=>e.stopPropagation()}>
                            <input type="number" placeholder="$" value={r.d.paid}
                              onChange={e=>setDraftField(r.id,{paid:e.target.value})} style={inp(50)} />
                          </td>
                        )}
                        <td style={td()} onClick={e=>e.stopPropagation()}>
                          <select value={r.d.manager} onChange={e=>setDraftField(r.id,{manager:e.target.value})} style={inp(100)}>
                            <option value=""></option>
                            {managers.map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                          {league==="final" && r.d.syncedFromSleeper && <sup style={badgeSup()} title="Auto-filled from Sleeper">SLP</sup>}
                        </td>
                        <td style={td()}>{r.risk || ""}</td>
                        <td style={td()}>{r.upside || ""}</td>
                        <td style={td()}>
                          <span style={{ padding:"3px 8px", borderRadius:6, fontSize:11, fontWeight:700,
                            background:style.bg, border:`1px solid ${style.border}`, color:style.border }}>
                            {r.noteData.outlook}
                          </span>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={league==="koi" ? 16 : 14} style={{ background:"#181910", padding:"14px 18px" }}>
                            <div style={{ display:"flex", gap:20, flexWrap:"wrap" }}>
                              <div style={{ flex:"1 1 320px" }}>
                                <div style={lblSmall("#7fd18f")}>Positive{r.outlookImported && <sup style={badgeSup()}>FFB</sup>}</div>
                                <textarea value={r.noteData.pos} onChange={e=>setNote(r.id,{pos:e.target.value}, r.note)}
                                  style={ta()} rows={2} />
                              </div>
                              <div style={{ flex:"1 1 320px" }}>
                                <div style={lblSmall("#e08a8a")}>Negative</div>
                                <textarea value={r.noteData.neg} onChange={e=>setNote(r.id,{neg:e.target.value}, r.note)}
                                  style={ta()} rows={2} />
                              </div>
                              <div style={{ flex:"0 0 160px" }}>
                                <div style={lblSmall("#f0d97a")}>Outlook</div>
                                <select value={r.noteData.outlook} onChange={e=>setNote(r.id,{outlook:e.target.value}, r.note)} style={inp("100%")}>
                                  {Object.keys(OUTLOOK_STYLE).map(k => <option key={k} value={k}>{OUTLOOK_STYLE[k].label}</option>)}
                                </select>
                              </div>
                            </div>
                            <div style={{ fontSize:11, opacity:0.55, marginTop:8 }}>
                              {r.pos!=="K" && r.pos!=="DEF"
                                ? (r.stats ? `Raw projection — ${Object.entries(r.stats).filter(([,v])=>v).map(([k,v])=>`${k}: ${v}`).join(" · ")}` : "No projection imported yet — update via the Import Real Data tab.")
                                : (r.pts != null ? "Flat position score (imported)" : "No projection imported yet — update via the Import Real Data tab.")}
                            </div>
                            {r.importSources && r.importSources.length > 0 && (
                              <div style={{ fontSize:11, opacity:0.55, marginTop:4 }}>
                                Imported from: {r.importSources.map((s, i) => (
                                  <span key={i}>
                                    {i > 0 && " · "}
                                    <b style={{color:"#7fd1c9"}}>{s.label}</b>
                                    {s.fields && s.fields.length > 0 ? ` (${s.fields.join(", ")})` : ""}
                                    {" — "}{new Date(s.date).toLocaleDateString(undefined, { year:"numeric", month:"short", day:"numeric" })}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ fontSize:11, opacity:0.5, marginTop:14, lineHeight:1.6 }}>
            ADP order and player pool sourced from 2026 consensus half-PPR rankings. Points, Pos Rk, VBD, and
            Auction $ show <b>—</b> until real projection data is imported for that player — there's no synthetic
            fallback. Import CSVs on the "Calculations" tab's "Import Real Data" section. Owners, drafted marks,
            and prices are tracked separately per board.
          </div>
        </>
      )}
    </div>
  );
}

const SLEEPER_API = "https://api.sleeper.app/v1";

/** Read-only, advisory sync against Sleeper's live Final Fantasy draft —
 *  see PROJECT_CONTEXT.md's "Platform sync strategy" and the design notes
 *  above reconcileSleeperPicks(). Never blocks manual entry: every fetch
 *  is caught and degrades to a status message, nothing throws upward. */
function SleeperSyncPanel({ sourceLeagueId, pool, draft, onMergePicks, onAddManagers }) {
  const [draftId, setDraftId] = useState(null);
  const [managerByRoster, setManagerByRoster] = useState(new Map());
  const [status, setStatus] = useState("idle"); // 'idle' | 'loading' | 'error'
  const [error, setError] = useState(null);
  const [lastSynced, setLastSynced] = useState(null);
  const [unmatched, setUnmatched] = useState([]);
  const [conflicts, setConflicts] = useState([]);
  const [autoSync, setAutoSync] = useState(true);

  // Resolve the current draft_id + manager names once we know the league.
  useEffect(() => {
    if (!sourceLeagueId) return;
    let cancelled = false;
    (async () => {
      try {
        const [drafts, rosters, users] = await Promise.all([
          fetch(`${SLEEPER_API}/league/${sourceLeagueId}/drafts`).then(r => r.json()),
          fetch(`${SLEEPER_API}/league/${sourceLeagueId}/rosters`).then(r => r.json()),
          fetch(`${SLEEPER_API}/league/${sourceLeagueId}/users`).then(r => r.json()),
        ]);
        if (cancelled) return;
        const userById = new Map((users || []).map(u => [u.user_id, u]));
        const byRoster = new Map();
        for (const r of rosters || []) {
          const u = userById.get(r.owner_id);
          const name = (u && (u.metadata?.team_name || u.display_name)) || `Sleeper roster ${r.roster_id}`;
          byRoster.set(r.roster_id, name);
        }
        setManagerByRoster(byRoster);
        onAddManagers([...new Set(byRoster.values())]);
        const d = Array.isArray(drafts) ? drafts[0] : null;
        setDraftId(d ? d.draft_id : null);
        if (!d) setError("No draft found for this league yet");
      } catch (e) {
        if (!cancelled) setError("Couldn't reach Sleeper (league setup): " + e.message);
      }
    })();
    return () => { cancelled = true; };
  }, [sourceLeagueId]);

  const sync = useCallback(async () => {
    if (!draftId) return;
    setStatus("loading");
    try {
      const picks = await fetch(`${SLEEPER_API}/draft/${draftId}/picks`).then(r => r.json());
      const index = buildPoolMatchIndex(pool);
      const nameById = {};
      for (const p of pool) nameById[p.id] = p.name;
      const { patchMap, unmatched, conflicts } = reconcileSleeperPicks(
        Array.isArray(picks) ? picks : [], index, draft, (rid) => managerByRoster.get(rid), nameById
      );
      if (Object.keys(patchMap).length) onMergePicks(patchMap);
      setUnmatched(unmatched);
      setConflicts(conflicts);
      setLastSynced(new Date());
      setStatus("idle");
      setError(null);
    } catch (e) {
      setStatus("error");
      setError("Sync failed: " + e.message);
    }
  }, [draftId, pool, draft, managerByRoster, onMergePicks]);

  useEffect(() => {
    if (!draftId || !autoSync) return;
    sync();
    const interval = setInterval(sync, 15000);
    return () => clearInterval(interval);
  }, [draftId, autoSync, sync]);

  const statusText = !sourceLeagueId ? "Waiting on league config…"
    : !draftId ? (error || "Resolving draft…")
    : status === "loading" ? "Syncing…"
    : error ? error
    : lastSynced ? `Last synced ${lastSynced.toLocaleTimeString()}` : "Not synced yet";

  return (
    <div style={{...panelStyle(), marginBottom:14, display:"flex", flexDirection:"column", gap:8}}>
      <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
        <div style={{ fontSize:11, fontWeight:700, letterSpacing:0.5, color:"#c9a227", textTransform:"uppercase" }}>
          Sleeper Sync
        </div>
        <div style={{ fontSize:12, opacity:0.75 }}>{statusText}</div>
        <button onClick={sync} disabled={!draftId} style={btnStyle()}>Sync now</button>
        <label style={{ fontSize:12, display:"flex", alignItems:"center", gap:4, opacity:0.85 }}>
          <input type="checkbox" checked={autoSync} onChange={e=>setAutoSync(e.target.checked)} /> auto (15s)
        </label>
      </div>
      {conflicts.length > 0 && (
        <div style={{ fontSize:12, color:"#e08a8a" }}>
          {conflicts.length} conflict{conflicts.length>1?"s":""} — Sleeper disagrees with a manual entry, not overwritten:{" "}
          {conflicts.map(c => `${c.name} (local: ${c.localManager || "—"}, Sleeper: ${c.sleeperManager})`).join("; ")}
        </div>
      )}
      {unmatched.length > 0 && (
        <div style={{ fontSize:12, color:"#c9a227" }}>
          {unmatched.length} Sleeper pick{unmatched.length>1?"s":""} couldn't be auto-matched — mark manually:{" "}
          {unmatched.map(u => `${u.name || "?"} (${u.pos})`).join(", ")}
        </div>
      )}
    </div>
  );
}

function MethodologyTab({ weights, setWeight, replacement, setRep, tierParams, setTierParams, teams, rosterSpots, onReset, pool, playerImports, onApplyImport, onClearImport }) {
  const [section, setSection] = useState("import");
  const totalPool = teams * 200;
  const totalSpots = teams * rosterSpots;
  const sections = [
    ["import","Import Real Data"],
    ["scoring","Scoring formulas"],
    ["replacement","VBD replacement levels"],
    ["tiers","Tier grouping"],
    ["auction","Auction values"],
  ];
  return (
    <div style={{ background:"#15160f", border:"1px solid #262819", borderRadius:12, padding:18 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10, marginBottom:14 }}>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          {sections.map(([k,label]) => (
            <button key={k} onClick={()=>setSection(k)} style={{
              padding:"6px 12px", borderRadius:20, fontSize:12, fontWeight:700,
              border:"1px solid " + (section===k ? "#c9a227" : "#33362a"),
              background: section===k ? "#2a2a18" : "transparent", color: section===k ? "#f0d97a" : "#9c998e",
            }}>{label}</button>
          ))}
        </div>
        <button onClick={onReset} style={btnStyle("#3a1f1f","#c0453f")}>Reset all to defaults</button>
      </div>

      {section === "import" && (
        <ImportPanel pool={pool} playerImports={playerImports} onApplyImport={onApplyImport} onClearImport={onClearImport} />
      )}

      {section === "scoring" && (
        <div>
          <p style={pText()}>
            Every skill-position player (QB/RB/WR/TE) scores off the same formula; only the weights change
            per league. Points = passYds ÷ passYdsPerPt + passTD × passTD − INT × intPenalty + rushYds ÷
            rushYdsPerPt + rushTD × rushTD + rec × recPts + recYds ÷ recYdsPerPt + recTD × recTD −
            fumbles × fumblePenalty. This only applies once a raw stat line has been imported for a player —
            there's no synthetic stat generator anymore, so an unimported player shows blank points rather than
            a fabricated projection. Kickers and defenses skip this formula entirely and take a flat points
            total straight from an import.
          </p>
          <div style={{ display:"flex", gap:16, flexWrap:"wrap" }}>
            <CurveCard title="Koi (Half-PPR)" values={weights.koi} onSet={(k,v)=>setWeight("koi",k,v)}
              fields={[["passYdsPerPt","Pass yds / pt"],["passTD","Pass TD pts"],["intPenalty","INT penalty"],
                       ["rushYdsPerPt","Rush yds / pt"],["rushTD","Rush TD pts"],["rec","Points / catch"],
                       ["recYdsPerPt","Rec yds / pt"],["recTD","Rec TD pts"],["fumblePenalty","Fumble penalty"]]} />
            <CurveCard title="Final Fantasy (Full PPR)" values={weights.final} onSet={(k,v)=>setWeight("final",k,v)}
              fields={[["passYdsPerPt","Pass yds / pt"],["passTD","Pass TD pts"],["intPenalty","INT penalty"],
                       ["rushYdsPerPt","Rush yds / pt"],["rushTD","Rush TD pts"],["rec","Points / catch"],
                       ["recYdsPerPt","Rec yds / pt"],["recTD","Rec TD pts"],["fumblePenalty","Fumble penalty"]]} />
            <CurveCard title="Jordan" values={weights.jordan} onSet={(k,v)=>setWeight("jordan",k,v)}
              fields={[["passYdsPerPt","Pass yds / pt"],["passTD","Pass TD pts"],["intPenalty","INT penalty"],
                       ["rushYdsPerPt","Rush yds / pt"],["rushTD","Rush TD pts"],["rec","Points / catch"],
                       ["recYdsPerPt","Rec yds / pt"],["recTD","Rec TD pts"],["fumblePenalty","Fumble penalty"]]} />
          </div>
        </div>
      )}

      {section === "replacement" && (
        <div>
          <p style={pText()}>
            VBD (Value Based Drafting) = a player's projected points minus the points of the last "replacement
            level" player at that position — the guy you could still get for free/cheap at the position's floor.
            A shallower number (fewer starters counted) makes a position scarcer and pushes its VBD — and
            therefore its tier breaks and auction dollars — higher.
          </p>
          <div style={{ display:"flex", gap:16, flexWrap:"wrap" }}>
            <CurveCard title="Koi replacement rank" values={replacement.koi} onSet={(k,v)=>setRep("koi",k,v)}
              fields={[["QB","QB",1],["RB","RB",1],["WR","WR",1],["TE","TE",1],["K","K",1],["DEF","DEF",1]]} />
            <CurveCard title="Final Fantasy replacement rank" values={replacement.final} onSet={(k,v)=>setRep("final",k,v)}
              fields={[["QB","QB",1],["RB","RB",1],["WR","WR",1],["TE","TE",1],["K","K",1],["DEF","DEF",1]]} />
            <CurveCard title="Jordan replacement rank" values={replacement.jordan} onSet={(k,v)=>setRep("jordan",k,v)}
              fields={[["QB","QB",1],["RB","RB",1],["WR","WR",1],["TE","TE",1],["K","K",1],["DEF","DEF",1]]} />
          </div>
        </div>
      )}

      {section === "tiers" && (
        <div>
          <p style={pText()}>
            Within each position, players are sorted by VBD. A new tier starts whenever the VBD gap to the next
            player exceeds <b>max(minGap, |previous player's VBD| × pctGap)</b> — so tier breaks scale with how
            valuable the position is at that point in the board, not a single flat number.
          </p>
          <CurveCard title="Tier threshold" values={tierParams}
            onSet={(k,v)=>setTierParams(t=>({...t,[k]:v}))}
            fields={[["minGap","Min VBD gap"],["pctGap","% of prev VBD",0.01]]} />
        </div>
      )}

      {section === "auction" && (
        <div>
          <p style={pText()}>
            Koi-only. Total pool = teams × $200 = <b>${totalPool}</b>. Every roster spot needs at least a $1 bid,
            so <b>${totalSpots}</b> ({teams} teams × {rosterSpots} spots) is reserved off the top, leaving
            <b> ${Math.max(0,totalPool-totalSpots)}</b> to distribute. Any player with a real projection and VBD
            ≤ 0 is a $1 player. Everyone else with a projection gets: <b>$ = 1 + (player VBD ÷ sum of VBD across
            all VBD&gt;0 players) × remaining pool</b>. A player with no imported projection at all shows a blank
            $ rather than $1 — there's a real difference between "worth the floor" and "not evaluated yet."
            Change teams/roster spots from the Koi board's Settings panel — that's what actually drives this pool.
          </p>
        </div>
      )}
    </div>
  );
}

function ImportPanel({ pool, playerImports, onApplyImport, onClearImport }) {
  const [batches, setBatches] = useState([]); // {id, label, headers, data, map:{...}}
  const [pasteText, setPasteText] = useState("");
  const [result, setResult] = useState(null); // {matched, unmatched: []}

  const nameIndex = useMemo(() => {
    const idx = {};
    for (const p of pool) idx[normName(p.name)] = p;
    return idx;
  }, [pool]);

  const guessMap = (headers) => {
    const findCol = (patterns) => {
      return headers.findIndex(h => patterns.some(p => h.toLowerCase().replace(/[^a-z0-9]/g,"").includes(p)));
    };
    return {
      name: findCol(["player","name"]),
      passYds: findCol(["passyds","passingyds","pyds"]),
      passTD: findCol(["passtd","passingtd","ptd"]),
      INT: findCol(["int","interception"]),
      rushYds: findCol(["rushyds","rushingyds","ryds"]),
      rushTD: findCol(["rushtd","rushingtd","rtd"]),
      rec: findCol(["receptions","rec","catches"]),
      recYds: findCol(["recyds","receivingyds","reyds"]),
      recTD: findCol(["rectd","receivingtd","retd"]),
      fumbles: findCol(["fumbleslost","fuml","fumbles"]),
      koiPoints: findCol(["halfppr","koi"]),
      finalPoints: findCol(["fullppr","pprpts","fpts","fantasypoints","points","proj"]),
      auction: findCol(["auction","dollar","aav","$"]),
      tier: findCol(["tier"]),
      posRank: findCol(["posrank","positionrank","posrk"]),
      risk: findCol(["risk"]),
      upside: findCol(["upside","ceiling"]),
      outlook: findCol(["writeup","outlook","blurb","summary","analysis","notes","comment"]),
      bye: findCol(["byeweek","bye"]),
    };
  };

  const addBatchFromText = (text, label) => {
    const rows = parseCSV(text).filter(r => r.some(c => c.trim() !== ""));
    if (!rows.length) return;
    const headers = rows[0];
    const data = rows.slice(1);
    setBatches(b => [...b, { id: `${Date.now()}-${Math.random()}`, label, headers, data, map: guessMap(headers) }]);
  };

  const addFiles = (fileList) => {
    Array.from(fileList).forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => addBatchFromText(String(e.target.result || ""), file.name);
      reader.readAsText(file);
    });
  };

  const updateBatchMap = (id, key, value) => {
    setBatches(b => b.map(x => x.id === id ? { ...x, map: { ...x.map, [key]: value } } : x));
  };
  const removeBatch = (id) => setBatches(b => b.filter(x => x.id !== id));

  const applyAll = () => {
    const overrides = {};
    const unmatched = [];
    let matched = 0;
    const importTimestamp = new Date().toISOString();
    for (const batch of batches) {
      const nameCol = batch.map.name;
      if (nameCol == null || nameCol < 0) continue;
      const cols = batch.map;
      const num = (row, i) => {
        if (i < 0 || row[i] == null) return null;
        const v = parseFloat(String(row[i]).replace(/[^0-9.\-]/g,""));
        return isNaN(v) ? null : v;
      };
      const str = (row, i) => {
        if (i < 0 || row[i] == null) return null;
        const s = String(row[i]).trim();
        return s === "" ? null : s;
      };
      for (const row of batch.data) {
        const rawName = row[nameCol];
        if (!rawName || !rawName.trim()) continue;
        const player = nameIndex[normName(rawName)];
        if (!player) { unmatched.push(`${rawName} (${batch.label})`); continue; }

        const statsFields = {};
        ["passYds","passTD","INT","rushYds","rushTD","rec","recYds","recTD","fumbles"].forEach(k => {
          const v = num(row, cols[k]);
          if (v != null) statsFields[k] = v;
        });
        const koiPts = num(row, cols.koiPoints);
        const finalPts = num(row, cols.finalPoints);
        const auc = num(row, cols.auction);
        const tierVal = num(row, cols.tier);
        const posRankVal = str(row, cols.posRank);
        const riskVal = str(row, cols.risk);
        const upsideVal = str(row, cols.upside);
        const outlookVal = str(row, cols.outlook);
        const byeVal = num(row, cols.bye);

        const entry = {};
        if (player.pos === "K" || player.pos === "DEF") {
          const flat = koiPts != null ? koiPts : finalPts;
          if (flat != null) entry.flatPtsOverride = flat;
        } else {
          if (Object.keys(statsFields).length) entry.statsOverride = statsFields;
          if (koiPts != null) entry.koiPoints = koiPts;
          if (finalPts != null) entry.finalPoints = finalPts;
        }
        if (auc != null) entry.auction = auc;
        if (tierVal != null) entry.tier = tierVal;
        if (posRankVal != null) entry.posRank = posRankVal;
        if (riskVal != null) entry.risk = riskVal;
        if (upsideVal != null) entry.upside = upsideVal;
        if (outlookVal != null) entry.outlook = outlookVal;
        if (byeVal != null) entry.bye = byeVal;
        if (!Object.keys(entry).length) continue;
        const fieldsTouched = Object.keys(entry).filter(k => k !== "statsOverride")
          .concat(entry.statsOverride ? Object.keys(entry.statsOverride) : []);

        // merge across batches so a QB file and (say) a K/DEF file both feeding the same run don't clobber each other
        const prior = overrides[player.id] || {};
        overrides[player.id] = {
          ...prior, ...entry,
          statsOverride: (prior.statsOverride || entry.statsOverride)
            ? { ...(prior.statsOverride||{}), ...(entry.statsOverride||{}) }
            : undefined,
          sources: [...(prior.sources || []), { label: batch.label, date: importTimestamp, fields: fieldsTouched }],
        };
        matched++;
      }
    }
    onApplyImport(overrides);
    setResult({ matched, unmatched });
    setBatches([]);
  };

  const importCount = Object.keys(playerImports).length;

  return (
    <div>
      <p style={pText()}>
        Drop in as many files as you want — one per position, or however your export is split — without merging
        them yourself first. Each file gets its own column mapping (a QB file and a WR file won't share columns),
        then <b>Apply All Imports</b> matches every row across every file by player name and merges it all into
        the same universal player pool. Raw stats (pass/rush/rec yards, TDs, INT, receptions, fumbles lost) drive both Koi and
        Final Fantasy through their own scoring formulas; point-total columns are a fallback if a file doesn't
        have raw stats. You can also import a separate rankings/write-up file per position — map its Tier,
        Position Rank, Risk, Upside, Bye Week, and Write-up columns and they'll combine with whatever you already imported
        from a projections file for the same player. Imported tiers/ranks/bye weeks take priority over the model's
        computed or default values, and an imported write-up replaces the "Positive" note (edit it same as any other note
        afterward). Imported fields show a small <b style={{color:"#7fd1c9"}}>FFB</b> tag on the board.
      </p>

      <div style={{ display:"flex", gap:12, alignItems:"center", marginBottom:14, flexWrap:"wrap" }}>
        <span style={{ fontSize:11, opacity:0.6 }}>
          {importCount > 0 ? `${importCount} players currently have imported data` : "No import applied yet"}
        </span>
        {importCount > 0 && (
          <button onClick={()=>{ onClearImport(); setResult(null); }} style={btnStyle("#3a1f1f","#c0453f")}>Clear all imports</button>
        )}
      </div>

      <div style={{ display:"flex", gap:12, alignItems:"center", flexWrap:"wrap", marginBottom:14 }}>
        <label style={{...btnStyle("#20211a","#c9a227"), display:"inline-block", cursor:"pointer"}}>
          + Add file(s)
          <input type="file" accept=".csv,text/csv" multiple onChange={e => e.target.files.length && addFiles(e.target.files)}
            style={{ display:"none" }} />
        </label>
        <span style={{ fontSize:11, opacity:0.5 }}>or paste one CSV below and add it as a file</span>
      </div>

      <div style={{ display:"flex", gap:8, marginBottom:18 }}>
        <textarea value={pasteText} onChange={e=>setPasteText(e.target.value)}
          placeholder="Paste one file's CSV text here (e.g. just the RB export)..."
          rows={3} style={{...ta(), flex:1}} />
        <button onClick={()=>{ if (pasteText.trim()) { addBatchFromText(pasteText, `Pasted ${batches.length+1}`); setPasteText(""); } }}
          style={btnStyle()}>Add as file</button>
      </div>

      {batches.length > 0 && (
        <div style={{ display:"flex", flexDirection:"column", gap:12, marginBottom:14 }}>
          {batches.map(batch => (
            <div key={batch.id} style={{ background:"#0f100b", border:"1px solid #262819", borderRadius:8, padding:12 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                <div style={{ fontSize:12, fontWeight:700, color:"#f0d97a" }}>
                  {batch.label} — {batch.data.length} rows
                </div>
                <button onClick={()=>removeBatch(batch.id)} style={btnStyle("#3a1f1f","#c0453f")}>Remove</button>
              </div>
              <ColMap label="Player name (required)" value={batch.map.name} set={v=>updateBatchMap(batch.id,"name",v)} headers={batch.headers} />
              <div style={{ fontSize:11, fontWeight:700, opacity:0.7, margin:"10px 0 4px" }}>Raw stats (drives both leagues)</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                <ColMap label="Pass yds" value={batch.map.passYds} set={v=>updateBatchMap(batch.id,"passYds",v)} headers={batch.headers} compact />
                <ColMap label="Pass TD" value={batch.map.passTD} set={v=>updateBatchMap(batch.id,"passTD",v)} headers={batch.headers} compact />
                <ColMap label="INT" value={batch.map.INT} set={v=>updateBatchMap(batch.id,"INT",v)} headers={batch.headers} compact />
                <ColMap label="Rush yds" value={batch.map.rushYds} set={v=>updateBatchMap(batch.id,"rushYds",v)} headers={batch.headers} compact />
                <ColMap label="Rush TD" value={batch.map.rushTD} set={v=>updateBatchMap(batch.id,"rushTD",v)} headers={batch.headers} compact />
                <ColMap label="Receptions" value={batch.map.rec} set={v=>updateBatchMap(batch.id,"rec",v)} headers={batch.headers} compact />
                <ColMap label="Rec yds" value={batch.map.recYds} set={v=>updateBatchMap(batch.id,"recYds",v)} headers={batch.headers} compact />
                <ColMap label="Rec TD" value={batch.map.recTD} set={v=>updateBatchMap(batch.id,"recTD",v)} headers={batch.headers} compact />
                <ColMap label="Fumbles lost" value={batch.map.fumbles} set={v=>updateBatchMap(batch.id,"fumbles",v)} headers={batch.headers} compact />
              </div>
              <div style={{ fontSize:11, fontWeight:700, opacity:0.7, margin:"10px 0 4px" }}>
                Fallback: direct point totals (also drives K/DEF)
              </div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                <ColMap label="Half-PPR / Koi pts" value={batch.map.koiPoints} set={v=>updateBatchMap(batch.id,"koiPoints",v)} headers={batch.headers} compact />
                <ColMap label="Full PPR / Final pts" value={batch.map.finalPoints} set={v=>updateBatchMap(batch.id,"finalPoints",v)} headers={batch.headers} compact />
              </div>
              <div style={{ fontSize:11, fontWeight:700, opacity:0.7, margin:"10px 0 4px" }}>Koi auction $ (optional)</div>
              <ColMap label="Auction $" value={batch.map.auction} set={v=>updateBatchMap(batch.id,"auction",v)} headers={batch.headers} compact />
              <div style={{ fontSize:11, fontWeight:700, opacity:0.7, margin:"10px 0 4px" }}>
                Rankings & write-up (optional — e.g. a separate FFB rankings export)
              </div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                <ColMap label="Tier" value={batch.map.tier} set={v=>updateBatchMap(batch.id,"tier",v)} headers={batch.headers} compact />
                <ColMap label="Position rank" value={batch.map.posRank} set={v=>updateBatchMap(batch.id,"posRank",v)} headers={batch.headers} compact />
                <ColMap label="Risk" value={batch.map.risk} set={v=>updateBatchMap(batch.id,"risk",v)} headers={batch.headers} compact />
                <ColMap label="Upside" value={batch.map.upside} set={v=>updateBatchMap(batch.id,"upside",v)} headers={batch.headers} compact />
                <ColMap label="Write-up / outlook" value={batch.map.outlook} set={v=>updateBatchMap(batch.id,"outlook",v)} headers={batch.headers} compact />
                <ColMap label="Bye week" value={batch.map.bye} set={v=>updateBatchMap(batch.id,"bye",v)} headers={batch.headers} compact />
              </div>
            </div>
          ))}
          <button onClick={applyAll} style={{...btnStyle("#20211a","#c9a227"), alignSelf:"flex-start"}}>
            Apply All Imports ({batches.length} file{batches.length===1?"":"s"})
          </button>
        </div>
      )}

      {result && (
        <div style={{ marginTop:6, fontSize:12.5 }}>
          <div style={{ color:"#7fd18f", fontWeight:700, marginBottom:4 }}>Matched {result.matched} rows across all files.</div>
          {result.unmatched.length > 0 && (
            <div style={{ opacity:0.75 }}>
              Unmatched ({result.unmatched.length}): {result.unmatched.slice(0,40).join(", ")}
              {result.unmatched.length > 40 ? "…" : ""}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
function ColMap({ label, value, set, headers, compact }) {
  const counts = {};
  for (const h of headers) counts[h] = (counts[h] || 0) + 1;
  const seen = {};
  return (
    <label style={{ display:"flex", flexDirection:"column", gap:2, fontSize:11, opacity:0.85, width: compact ? 150 : "100%", marginBottom: compact ? 0 : 6 }}>
      <span style={{ opacity:0.65 }}>{label}</span>
      <select value={value != null && value >= 0 ? value : ""} onChange={e=>set(e.target.value === "" ? -1 : Number(e.target.value))} style={inp("100%")}>
        <option value="">— none —</option>
        {headers.map((h, i) => {
          seen[h] = (seen[h] || 0) + 1;
          const displayLabel = counts[h] > 1 ? `${h} (col ${i + 1}, "${h}" #${seen[h]})` : h;
          return <option key={i} value={i}>{displayLabel}</option>;
        })}
      </select>
    </label>
  );
}




function btnStyle(bg="#20211a", border="#c9a227") {
  return { padding:"8px 14px", borderRadius:8, border:`1px solid ${border}`, background:bg, color:"#e9e6dd", fontSize:13, fontWeight:600 };
}
function panelStyle() {
  return { background:"#181910", border:"1px solid #2a2c20", borderRadius:10, padding:14, marginBottom:14 };
}
function lbl() {
  return { display:"flex", flexDirection:"column", gap:4, fontSize:11, opacity:0.75 };
}
function lblSmall(color) {
  return { fontSize:11, fontWeight:700, color, marginBottom:4, textTransform:"uppercase", letterSpacing:0.5 };
}
function pText() {
  return { fontSize:12.5, opacity:0.8, lineHeight:1.6, maxWidth:900, marginBottom:14 };
}
function inp(w) {
  return { width:w, background:"#0f100b", border:"1px solid #33362a", borderRadius:6, color:"#e9e6dd", padding:"6px 8px", fontSize:13 };
}
function ta() {
  return { width:"100%", background:"#0f100b", border:"1px solid #33362a", borderRadius:6, color:"#e9e6dd", padding:"8px", fontSize:13, resize:"vertical" };
}
function SortTh({ label, col, sortKey, sortDir, onSort, align }) {
  const active = sortKey === col;
  return (
    <th style={{ ...th(align), cursor:"pointer", userSelect:"none", color: active ? "#f0d97a" : undefined }}
        onClick={()=>onSort(col)}>
      {label}
      <span style={{ display:"inline-block", width:12, opacity: active ? 1 : 0.25, marginLeft:2 }}>
        {active ? (sortDir === "asc" ? "▲" : "▼") : "▾"}
      </span>
    </th>
  );
}
function th(align="center") {
  return { padding:"10px 8px", textAlign:align, borderBottom:"1px solid #2a2c20" };
}
function td(align="center") {
  return { padding:"7px 8px", textAlign:align, borderBottom:"1px solid #1e2018", fontSize:13 };
}
function badgeSup() {
  return { marginLeft:4, fontSize:9, fontWeight:800, color:"#7fd1c9", letterSpacing:0.5 };
}
