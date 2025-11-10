// game.js - Leyendas del Platanoboom FINAL (15x13, 3 frutas, text flotante, music control, enemies avoid bombs)
// Requires Phaser 3.87.0 loaded externally. No external URLs. Single-file.

const AC = {
  P1U:['w'],P1D:['s'],P1L:['a'],P1R:['d'],P1A:['r','R'],P1B:['i'],P1C:['o'],P1X:['j'],P1Y:['k'],P1Z:['l'],START1:['1','Enter'],
  P2U:['ArrowUp'],P2D:['ArrowDown'],P2L:['ArrowLeft'],P2R:['ArrowRight'],P2A:['u','U'],P2B:['t'],P2C:['y'],P2X:['f'],P2Y:['g'],P2Z:['h'],START2:['2']
};
const K2A = {}; for(const [c,ks] of Object.entries(AC)) if(ks) (Array.isArray(ks)?ks:[ks]).forEach(k=>K2A[k]=c);

// Board
const GW = 15, GH = 13, TILE = 48;
const W = 800, H = 600;
const OFFX = Math.floor((W - GW*TILE)/2), OFFY = Math.floor((H - GH*TILE)/2);
const MAX_ENEMIES = 10;
const LB_KEY = 'platanoboom_final_top5';

// Palette & chars
const PAL = { jungle1:0x123e1f,jungle2:0x1b5e20,moss:0x39612f,rock:0x3e2f2f,
  banana:0xffe066,bananaSh:0xffc83d,stem:0x2e7d32,skin:0xffddb3, trunk:0x6d4c41,leaf:0x2e7d32, gold:0xffd54f};
const CHARS=[{name:'Caleuche',suit:0xff5252,trim:0xffeb3b},{name:'Pincoya',suit:0x4caf50,trim:0x00bfa5},{name:'Alicanto',suit:0xff8a65,trim:0xffd180},{name:'Trauco',suit:0x42a5f5,trim:0x1e88e5}];

// AUDIO manager: Ambient -> Epic battle (118 BPM) with simple crossfade and extra layers
class AudioSys {
  static init(game){
    if(game._audioInit) return;
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    game._audioCtx = ctx; game._audioInit = true; game._music = null; game._musicInterval = null;
  }

  

  static _note(ctx, type, freq, when, dur, vol, dest){
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, when);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(vol, when+0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, when+dur);
    o.connect(g); g.connect(dest||ctx.destination);
    o.start(when); o.stop(when+dur+0.02);
  }
  static _tom(ctx, f, when, vol, dest){ this._note(ctx,'sine',f,when,0.10,vol, dest); }
  static _shaker(ctx, when, vol, dest){ this._note(ctx,'triangle',4000,when,0.03,vol*0.35, dest); }
  static _pad(ctx, f, when, dur, vol, dest){ this._note(ctx,'sine',f,when,dur,vol*0.35, dest); }
  static stop(game){ const ctx=game._audioCtx; if(game._musicInterval){ clearInterval(game._musicInterval); game._musicInterval=null; } if(game._music){ try{ const now=ctx.currentTime; game._music.gain.exponentialRampToValueAtTime(0.001, now+0.4);}catch(e){} game._music=null; } }
  static playMusic(game, mode){
    const ctx = game._audioCtx; if(!ctx) return;
    this.stop(game);
    const now = ctx.currentTime; const master = ctx.createGain(); master.gain.setValueAtTime(0.0001, now); master.connect(ctx.destination);
    master.gain.linearRampToValueAtTime(mode==='menu'?0.045:0.11, now+0.2);
    game._music = {gain:master, mode};
    // Sequencer
    const bpm = mode==='menu'?118:144; const spb = 60/bpm; const step = spb/4; // 16th
    let stepIdx = 0;
    const isMenu = mode==='menu';
    const root = 220; // A3 root
    // Battle lead motif (A minor-ish): energetic square 8ths/16ths
    const lead = [0,2,3,5,7,5,3,2, 0,2,3,5,3,2,0,-2];
    let leadIdx=0;
    const loop = ()=>{
      const base = ctx.currentTime + 0.02;
      // percussion minimal
      if(isMenu){
        // only subtle shaker on 8ths
        for(let i=0;i<2;i++) this._shaker(ctx, base + i*(step*2), 0.05, master);
        // soft pad every bar
        if(stepIdx%16===0){ this._pad(ctx, root, base, spb*2.8, 0.05, master); }
        // bird-like chirp occasionally
        if(stepIdx%32===0){ this._note(ctx,'triangle', 1400 + Math.random()*400, base, 0.05, 0.02, master); }
      } else {
        // shaker 16ths for drive
        for(let i=0;i<4;i++) this._shaker(ctx, base + i*(step), 0.08, master);
        // kick (tom) on 1 and 3, snare-ish on 2 and 4
        if(stepIdx%16===0 || stepIdx%16===8) this._tom(ctx, 170, base, 0.06, master);
        if(stepIdx%16===4 || stepIdx%16===12){ this._note(ctx,'square', 600, base, 0.05, 0.04, master); this._note(ctx,'triangle', 1500, base+0.005, 0.035, 0.02, master); }
        // chord progression I–VI–VII every half-note
        if(stepIdx%8===0){
          const bar = Math.floor((stepIdx/8)%3); // 0:I(A),1:VI(F),2:VII(G)
          const offs = bar===0?0:(bar===1?-4:-2);
          const tri = [0,3,7].map(semi=> root*Math.pow(2,(offs+semi)/12));
          for(let i=0;i<3;i++) this._note(ctx,'triangle', tri[i], base + i*0.015, spb*0.32, 0.045, master);
        }
        // bass on quarters following progression
        if(stepIdx%4===0){ const qb=Math.floor((stepIdx/4)%12); const prog = qb<4?0:(qb<8? -4: -2); const n = (root/2)*Math.pow(2, prog/12); this._note(ctx,'sawtooth', n, base, spb*0.24, 0.065, master); }
        // lead square on 8ths with small embellishments
        if(stepIdx%2===0){ const semitone = lead[leadIdx%lead.length]; leadIdx++; const f = root*Math.pow(2, (semitone/12)); this._note(ctx,'square', f, base, spb*0.16, 0.06, master); }
      }
      stepIdx = (stepIdx+1)%64;
    };
    game._musicInterval = setInterval(loop, step*1000);
  }
  static sfx(ctx,type){
    try{
      const now = ctx.currentTime;
      const o=ctx.createOscillator(), g=ctx.createGain(); o.connect(g); g.connect(ctx.destination);
      if(type==='place'){ o.frequency.value=320; o.type='square'; g.gain.setValueAtTime(0.04,now); g.gain.exponentialRampToValueAtTime(0.0001,now+0.08); o.start(now); o.stop(now+0.09); }
      if(type==='expl'){ o.frequency.value=120; o.type='sawtooth'; g.gain.setValueAtTime(0.07,now); g.gain.exponentialRampToValueAtTime(0.0001,now+0.18); o.start(now); o.stop(now+0.2); }
      if(type==='pickup'){ const o2=ctx.createOscillator(), g2=ctx.createGain(); o2.type='sine'; o2.frequency.value=1100; g2.gain.setValueAtTime(0.04,now); g2.gain.exponentialRampToValueAtTime(0.0001,now+0.12); o2.connect(g2); g2.connect(ctx.destination); o2.start(now); o2.stop(now+0.12); }
      if(type==='die'){ o.frequency.value=90; o.type='square'; g.gain.setValueAtTime(0.06,now); g.gain.exponentialRampToValueAtTime(0.0001,now+0.18); o.start(now); o.stop(now+0.2); }
    }catch(e){}
  }
}

// helpers
function tileInDanger(bombs,x,y,th){
  for(const b of bombs){
    if(b.timer <= th + 1e-6){
      if(b.x===x && Math.abs(b.y-y) < b.pow) return true;
      if(b.y===y && Math.abs(b.x-x) < b.pow) return true;
      if(b.x===x && b.y===y) return true;
    }
  }
  return false;
}

// floating texts
class FloatingText { constructor(scene){ this.scene=scene; this.pool=[]; }
  spawn(txt,x,y,color='#fff'){ const ent={txt,x,y,t:0,d:1.1,color}; this.pool.push(ent); return ent; }
  update(dt){ this.pool=this.pool.filter(p=>{ p.t+=dt; return p.t<p.d; }) }
  draw(g){ for(const p of this.pool){ const a=1 - (p.t/p.d); g.fillStyle(0x000000,a*0.5); g.fillRect(p.x-1,p.y- Math.pow(p.t,0.9)*40 -1, p.txt.length*7 +4,20*a); g.fillStyle(Phaser.Display.Color.HexStringToColor(p.color).color, a); g.fillText ? null : null; /* placeholder, we'll draw with Phaser text instead */ } }
}

// Scenes
class MenuScene extends Phaser.Scene {
  constructor(){ super('Menu') }
  create(){
    AudioSys.init(this.game); AudioSys.playMusic(this.game,'menu');
    // robust audio unlock: init if missing, await resume, confirm with sfx
    const tryUnlock=async()=>{
      if(!this.game._audioCtx) AudioSys.init(this.game);
      const ctx=this.game._audioCtx; if(!ctx) return;
      if(ctx.state!=='running'){
        try{ await ctx.resume(); }catch(e){}
        AudioSys.playMusic(this.game,'menu');
      }
      if(ctx.state==='running'){
        try{ AudioSys.sfx(ctx,'place'); }catch(e){}
        this.input.keyboard.off('keydown',tryUnlock); this.input.off('pointerdown',tryUnlock); this.input.off('pointerup',tryUnlock); this.input.off('pointermove',tryUnlock);
        window.removeEventListener('touchstart',tryUnlock);
        document.removeEventListener('visibilitychange',tryUnlock);
      }
    };
    this.input.keyboard.on('keydown',tryUnlock);
    this.input.on('pointerdown',tryUnlock); this.input.on('pointerup',tryUnlock); this.input.on('pointermove',tryUnlock);
    window.addEventListener('touchstart',tryUnlock,{once:false});
    document.addEventListener('visibilitychange',tryUnlock);
    this.bg = this.add.graphics(); this.bg2 = this.add.graphics(); this.fx = this.add.graphics();
    this.leaves=[];
    for(let i=0;i<22;i++) this.leaves.push({x:Math.random()*W,y:Math.random()*H,s:0.6+Math.random()*1.2, sx:(0.2+Math.random()*0.6)*(i%2?1:-1)});
    // fireflies
    this.flies=[]; for(let i=0;i<28;i++) this.flies.push({x:Math.random()*W,y:140+Math.random()*(H-200),p:Math.random()*Math.PI*2,s:0.4+Math.random()*0.9});
    // parallax silhouette offsets
    this._parOff=0;
    const titleShadow = this.add.text(W/2+3,118,'Platano audaz',{fontSize:'56px',color:'#000'}).setOrigin(.5);
    this.add.text(W/2,120,'Platano audaz',{fontSize:'56px',color:'#ff9800',fontStyle:'bold'}).setOrigin(.5);
    this.add.text(W/2,72,'LEYENDAS DEL',{fontSize:'32px',color:'#ffeb3b'}).setOrigin(.5);
    titleShadow.alpha=0.35;
    this.sel=0; this.opts=['1 Jugador','2 Jugadores','Instrucciones','Top 5'];
    this.optTexts=this.opts.map((t,i)=>this.add.text(W/2,240+i*52,`   ${t}`,{fontSize:'26px',color:'#cfe8cf',stroke:'#000',strokeThickness:4}).setOrigin(.5));
    this._renderSel=()=>{ this.optTexts.forEach((t,i)=>{ const sel = i===this.sel; t.setText(`${sel?'▶':''}  ${this.opts[i]}`); t.setColor(sel?'#ffeb3b':'#cfe8cf'); }); };
    this._renderSel();
    this.input.keyboard.on('keydown',e=>{ const k=K2A[e.key]||e.key; if(k==='P1U'||k==='P2U'){ this.sel=(this.sel-1+this.opts.length)%this.opts.length; this._tone(420,.04); this._renderSel(); } if(k==='P1D'||k==='P2D'){ this.sel=(this.sel+1)%this.opts.length; this._tone(420,.04); this._renderSel(); } if(k==='P1A'||k==='START1'||k==='P2A'||k==='START2'){ this._tone(880,.06); if(this.sel===0) this.scene.start('Game',{mode:1}); else if(this.sel===1) this.scene.start('Game',{mode:2}); else if(this.sel===2) this._showInstr(); else this._showTop(); }});
  }
  update(){
    // music watchdog: ensure menu music is playing when audio is unlocked
    const ctxM = this.game._audioCtx; if(ctxM && ctxM.state==='running' && (!this.game._musicInterval || !this.game._music)){ AudioSys.playMusic(this.game,'menu'); }
    const t = this.time.now/1000;
    this.bg.clear();
    // gradient jungle
    for(let y=0;y<H;y+=6){ const c=Phaser.Display.Color.Interpolate.ColorWithColor({r:9,g:45,b:20},{r:24,g:75,b:32},H,y); this.bg.fillStyle(Phaser.Display.Color.GetColor(c.r,c.g,c.b),1); this.bg.fillRect(0,y,W,6); }
    // silhouettes parallax
    this.bg2.clear();
    const lay = [
      {y:430,col:0x0a2a15,spd:0.12,scale:1.2},
      {y:470,col:0x0c331a,spd:0.2, scale:1.0}
    ];
    this._parOff += 0.16;
    for(const L of lay){
      const off = (this._parOff*L.spd)%80;
      for(let x=-80;x<W+80;x+=80){
        const bx = x - off;
        // trunk
        this.bg2.fillStyle(L.col,1); this.bg2.fillRect(bx+30, L.y-60, 12, 60);
        // canopy
        this.bg2.fillCircle(bx+36, L.y-70, 26*L.scale);
        this.bg2.fillCircle(bx+18, L.y-62, 18*L.scale);
        this.bg2.fillCircle(bx+52, L.y-60, 18*L.scale);
      }
      // ground strip
      this.bg2.fillStyle(L.col,1); this.bg2.fillRect(0,L.y,W,8);
    }
    // parallax leaves
    for(const l of this.leaves){ l.x+=l.sx*0.6; if(l.x<-60) l.x=W+60; if(l.x>W+60) l.x=-60; this.bg.fillStyle(PAL.leaf,0.06 + (Math.abs(Math.floor(l.x))%3)*0.03); this.bg.fillCircle(l.x,l.y,18*l.s); }
    // fireflies
    for(const f of this.flies){ f.p += 0.03 + f.s*0.01; const a = 0.2 + (Math.sin(f.p)*0.5+0.5)*0.5; const jitterX = Math.sin(f.p*1.7)*6*f.s; const jitterY = Math.cos(f.p*1.3)*4*f.s; this.bg.fillStyle(0xfff59d,a*0.9); this.bg.fillCircle(f.x + jitterX, f.y + jitterY, 2 + f.s*0.8); }
    // scanlines overlay
    this.fx.clear(); this.fx.fillStyle(0x000000,0.06); for(let y=0;y<H;y+=4) this.fx.fillRect(0,y,W,1);
    // draw speaker icon if audio locked
    const ctx=this.game._audioCtx; const locked = !ctx || ctx.state!=='running';
    if(locked){ const x=W-28, y=16; this.fx.fillStyle(0xffffff,0.85); this.fx.fillRect(x-14,y+6,8,8); this.fx.fillTriangle(x-14,y+6, x-4,y+2, x-4,y+18); this.fx.fillStyle(0xffffff,0.6); this.fx.fillCircle(x+2,y+10,3); this.fx.lineStyle(2,0xffffff,0.7); this.fx.strokeCircle(x+2,y+10,6); }
  }
  _showInstr(){ const g=this.add.graphics(); g.fillStyle(0x000000,0.9); g.fillRect(60,120,680,360); const lines=['CONTROLES:','P1: WASD mover, R bomba','P2: Flechas mover, U bomba','Frutas: Frutilla=Range / Piña=+Bomb / Uvas=Invulnerable 3s','Empuja bombas con Botas (power-up único)','2P: Cada jugador tiene 3 vidas','El mar (zona azul) hace 1 de daño por segundo','Presiona cualquier tecla...']; lines.forEach((l,i)=>this.add.text(W/2,150+i*26,l,{fontSize:'14px',color:i===0?'#ffeb3b':'#fff'}).setOrigin(.5)); this.input.keyboard.once('keydown',()=>this.scene.restart()); }
  _showTop(){ const lb=JSON.parse(localStorage.getItem(LB_KEY)||'[]'); const g=this.add.graphics(); g.fillStyle(0x000000,0.9); g.fillRect(100,120,600,360); this.add.text(W/2,150,'TOP 5',{fontSize:'28px',color:'#ffeb3b'}).setOrigin(.5); if(!lb.length) this.add.text(W/2,210,'No hay puntajes aún',{fontSize:'18px',color:'#fff'}).setOrigin(.5); lb.slice(0,5).forEach((e,i)=>this.add.text(W/2,200+i*36,`${i+1}. ${e.name} - Nivel ${e.level} (${e.time}s)`,{fontSize:'16px',color:'#fff'}).setOrigin(.5)); this.input.keyboard.once('keydown',()=>this.scene.restart()); }
  _tone(f,d){ const a=this.sound.context,o=a.createOscillator(),g=a.createGain(); o.connect(g); g.connect(a.destination); o.frequency.value=f; o.type='square'; g.gain.setValueAtTime(.05,a.currentTime); g.gain.exponentialRampToValueAtTime(.01,a.currentTime+d); o.start(a.currentTime); o.stop(a.currentTime+d) }
}

// MAIN GAME
class GameScene extends Phaser.Scene {
  constructor(){ super('Game'); }
  init(d){ this.mode=d.mode||1; this.level=d.level||1; this.elapsed=0; this.floaters=[]; }
  create(){
    AudioSys.init(this.game); AudioSys.playMusic(this.game,'battle');
    this.bg=this.add.graphics(); this.bg2=this.add.graphics(); this.gfx=this.add.graphics(); this.fx=this.add.graphics(); this._par=0;
    this.grid=[]; this.blocks=[]; this.players=[]; this.enemies=[]; this.bombs=[]; this.explosions=[]; this.powerups=[];
    // map closing state (2P starts at 15s)
    this.hazard = new Set(); this.closeLevel=0; this.nextClose=(this.mode===2?15:18); this.closeInterval=5;
    this.ptexts = []; this._buildArena();
    this.players.push(this._mkPlayer(1,1,0)); if(this.mode===2) this.players.push(this._mkPlayer(GW-2,GH-2,1));
    // set lives in 2P
    if(this.mode===2){ for(const p of this.players){ p.lives = 3; } }
    if(this.mode===1){ const c=Math.min(this.level+1,MAX_ENEMIES); for(let i=0;i<c;i++) this._spawnEnemy(); if(this.level%3===0) this._spawnBoss(); }
    this.hud=this.add.text(10,10,``,{fontSize:'18px',color:'#ffeb3b'});
    this.infoL = this.add.text(12,H-46,'',{fontSize:'14px',color:'#cfe8cf',stroke:'#000',strokeThickness:3});
    this.infoR = this.add.text(W-12,H-46,'',{fontSize:'14px',color:'#cfe8cf',stroke:'#000',strokeThickness:3}).setOrigin(1,0);
    // show only level HUD; keep other texts hidden
    this.hud.setVisible(true); this.infoL.setVisible(false); this.infoR.setVisible(false);
    this.input.keyboard.on('keydown',e=>this._handleKey(e));
    // floating text group
    this.floats=[];
    // spawn unique push powerup once per game at random empty tile
    this._spawnUniquePush();
    // robust audio unlock for Game scene
    const tryUnlockG=async()=>{
      if(!this.game._audioCtx) AudioSys.init(this.game);
      const ctx=this.game._audioCtx; if(!ctx) return;
      if(ctx.state!=='running'){
        try{ await ctx.resume(); }catch(e){}
        AudioSys.playMusic(this.game,'battle');
      }
      if(ctx.state==='running'){
        try{ AudioSys.sfx(ctx,'place'); }catch(e){}
        this.input.keyboard.off('keydown',tryUnlockG); this.input.off('pointerdown',tryUnlockG); this.input.off('pointerup',tryUnlockG); this.input.off('pointermove',tryUnlockG);
        window.removeEventListener('touchstart',tryUnlockG);
        document.removeEventListener('visibilitychange',tryUnlockG);
      }
    };
    this.input.keyboard.on('keydown',tryUnlockG);
    this.input.on('pointerdown',tryUnlockG); this.input.on('pointerup',tryUnlockG); this.input.on('pointermove',tryUnlockG);
    window.addEventListener('touchstart',tryUnlockG,{once:false});
    document.addEventListener('visibilitychange',tryUnlockG);
    // sound unlock hit area in Game
    if(!this._sndZoneG){ this._sndZoneG = this.add.zone(W-44,16,32,26).setOrigin(0,0).setInteractive(); this._sndZoneG.on('pointerdown', tryUnlockG); }
  }

  _buildArena(){
    for(let y=0;y<GH;y++){ this.grid[y]=[]; for(let x=0;x<GW;x++){ if(x===0||y===0||x===GW-1||y===GH-1||(x%2===0&&y%2===0)){ this.grid[y][x]=1 } else if(Math.random()<0.56){ this.grid[y][x]=2; this.blocks.push({x,y, type:'dirt'}) } else this.grid[y][x]=0; } }
    for(let i=0;i<this.blocks.length;i++) if(Math.random()<0.28) this.blocks[i].type = (Math.random()<0.5? 'trunk':'sapling');
    const sp=[[1,1],[1,2],[2,1],[GW-2,GH-2],[GW-2,GH-3],[GW-3,GH-2]]; sp.forEach(([x,y])=>{ if(this.grid[y] && this.grid[y][x]!==undefined){ this.grid[y][x]=0; this.blocks=this.blocks.filter(b=>!(b.x===x&&b.y===y)); }});
  }

  _mkPlayer(x,y,ci){ return {type:'player',x,y,char:ci,alive:true,bombCnt:1,bombPow:2,invUntil:0,canPush:false, speedBoost:0, animFrame:0, animT:0}; }

  _spawnEnemy(isBoss=false){
    let tries=0,x,y;
    const hasEscape=(ix,iy)=>{ const ds=[[0,1],[0,-1],[1,0],[-1,0]]; let ok=0; for(const [dx,dy] of ds){ const nx=ix+dx, ny=iy+dy; if(nx<0||ny<0||nx>=GW||ny>=GH) continue; if(this.grid[ny][nx]!==0) continue; if(this.bombs.some(b=>b.x===nx&&b.y===ny)) continue; ok++; }
      return ok>=2; };
    do{ x = 1+Math.floor(Math.random()*(GW-2)); y = 1+Math.floor(Math.random()*(GH-2)); tries++; } while( (this.grid[y] && this.grid[y][x]!==0 || !hasEscape(x,y)) && tries<220);
    if(tries<220){ if(isBoss) this.enemies.push({type:'boss',x,y,pow:Math.min(5,3+Math.floor(this.level/3)),hp:4+Math.floor(this.level*0.8),placeCd:0.6+Math.random()*0.6,next:0,spd:0.8 - Math.min(.45,this.level*0.018), fleeUntil:0, noBombUntil:(this.time.now/1000)+5.0}); else this.enemies.push({type:'enemy',x,y,pow:2,placeCd:1.6+Math.random()*0.8,next:0,spd:0.8 - Math.min(.45,this.level*0.03), fleeUntil:0, noBombUntil:(this.time.now/1000)+5.0}); }
  }
  _spawnBoss(){ this._spawnEnemy(true); }

  _handleKey(e){
    const k = K2A[e.key] || e.key;
    if(this.players[0] && this.players[0].alive){ if(k==='P1U') this._queueMove(this.players[0],0,-1); if(k==='P1D') this._queueMove(this.players[0],0,1); if(k==='P1L') this._queueMove(this.players[0],-1,0); if(k==='P1R') this._queueMove(this.players[0],1,0); if(k==='P1A') this._placeBomb(this.players[0]); }
    if(this.mode===2 && this.players[1] && this.players[1].alive){ if(k==='P2U') this._queueMove(this.players[1],0,-1); if(k==='P2D') this._queueMove(this.players[1],0,1); if(k==='P2L') this._queueMove(this.players[1],-1,0); if(k==='P2R') this._queueMove(this.players[1],1,0); if(k==='P2A') this._placeBomb(this.players[1]); }
  }

  _queueMove(ent,dx,dy){ this.pending = this.pending || []; this.pending.push({ent,from:{x:ent.x,y:ent.y},to:{x:ent.x+dx,y:ent.y+dy}}); }

  _placeBomb(owner){
    const bc = this.bombs.filter(b=>b.owner===owner).length;
    if(bc >= owner.bombCnt) return;
    if(this.bombs.some(b=>b.x===owner.x && b.y===owner.y)) return;
    const b = {x:owner.x,y:owner.y,timer:1.9,owner,pow:(owner.bombPow||owner.pow||2), moving:false, fromX:owner.x,fromY:owner.y,toX:owner.x,toY:owner.y,moveStart:0,moveDur:0.12, displayX:owner.x, displayY:owner.y};
    this.bombs.push(b); owner.invUntil = this.time.now + Math.floor(0.45*1000);
    if(this.game._audioCtx) AudioSys.sfx(this.game._audioCtx,'place');
  }

  update(time,dt){
    // music watchdog: ensure battle music is playing when audio is unlocked
    const ctxG = this.game._audioCtx; if(ctxG && ctxG.state==='running' && (!this.game._musicInterval || !this.game._music)){ AudioSys.playMusic(this.game,'battle'); }
    const d = dt/1000; this.elapsed += d;
    // map closing logic
    if(this.elapsed > this.nextClose && this.closeLevel < Math.floor(Math.min(GW,GH)/2)-1){ this._applyClose(this.closeLevel); this.closeLevel++; this.nextClose += this.closeInterval; this.cameras.main.flash(120,10,40,20); }
    // enemies AI
    for(const e of this.enemies){
      e.next -= d; e.placeCd -= d;
      if(e.next <= 0){
        const nowS = this.time.now/1000;
        const inDanger = tileInDanger(this.bombs,e.x,e.y,0.6) || this._isHazard(e.x,e.y);
        let moved=false;
        // flee window after placing a bomb
        if(!moved && e.fleeUntil && nowS < e.fleeUntil){
          const flee = this._nearestSafeStep(e.x,e.y);
          if(flee){ this._queueMove(e,flee[0],flee[1]); moved=true; }
        }
        if(!moved && inDanger){
          const safe = this._nearestSafeStep(e.x,e.y);
          if(safe){ this._queueMove(e,safe[0],safe[1]); moved=true; }
        }
        if(!moved){
          const target = this._nearestPlayer(e.x,e.y);
          if(target){
            // prefer BFS step that avoids danger/hazard
            const step = this._pathStep(e.x,e.y,target.x,target.y);
            if(step){ this._queueMove(e,step[0],step[1]); moved=true; }
            else {
              // fallback: score neighbors (distance + stronger dead-end + danger)
              let best=null,bd=1e9;
              for(const [dx,dy] of [[0,-1],[0,1],[-1,0],[1,0]]){
                const nx=e.x+dx, ny=e.y+dy; if(!this._canMove(nx,ny,true)) continue;
                const dist=Math.abs(nx-target.x)+Math.abs(ny-target.y);
                const exits=this._freeNeighbors(nx,ny);
                const deadPen = exits<=1?3.5:(exits===2?1.2:0);
                const danger = (tileInDanger(this.bombs,nx,ny,0.8)||this._isHazard(nx,ny))?8:0;
                const score = dist + deadPen + danger;
                if(score<bd){bd=score; best=[dx,dy];}
              }
              if(best){ this._queueMove(e,best[0],best[1]); moved=true; }
            }
          }
        }
        if(!moved){ const dirs=[[0,-1],[0,1],[-1,0],[1,0]]; const safeDirs=[]; for(const [dx,dy] of dirs){ const nx=e.x+dx, ny=e.y+dy; if(!this._canMove(nx,ny,true)) continue; if(this._isHazard(nx,ny) || tileInDanger(this.bombs,nx,ny,0.8)) continue; safeDirs.push([dx,dy]); } const choice = (safeDirs.length? safeDirs[Math.floor(Math.random()*safeDirs.length)] : dirs[Math.floor(Math.random()*dirs.length)]); if(this._canMove(e.x+choice[0],e.y+choice[1],true)) this._queueMove(e,choice[0],choice[1]); }
        e.next = Math.max(.12, e.spd * (0.55 + Math.random()*0.8));
      }
      if(e.placeCd <= 0){
        let will=false; const nowS=this.time.now/1000; const eExits=this._freeNeighbors(e.x,e.y);
        const target = this._nearestPlayer(e.x,e.y);
        const dist = target ? (Math.abs(target.x-e.x)+Math.abs(target.y-e.y)) : 99;
        const aligned = target ? this._alignedClear(e.x,e.y,target.x,target.y) : false;
        const closeToPlayer = dist <= 2;
        const nearRange = dist <= ((e.pow||2) + 1);
        // quick estimate of player's safe exits
        const pSafeEx = target ? (()=>{ let c=0; for(const [dx,dy] of [[0,-1],[0,1],[-1,0],[1,0]]){ const nx=target.x+dx, ny=target.y+dy; if(nx<0||ny<0||nx>=GW||ny>=GH) continue; if(this.grid[ny][nx]!==0) continue; if(this.bombs.some(b=>b.x===nx&&b.y===ny)) continue; if(this._isHazard(nx,ny) || tileInDanger(this.bombs,nx,ny,0.7)) continue; c++; } return c; })() : 2;
        if(target){
          if(aligned && (nearRange || pSafeEx<=1)) will=true;
          else if(closeToPlayer && Math.random()<0.3) will=true;
          else if(Math.random()< (e.type==='boss'?0.5:0.2)) will=true;
        }
        // early game bomb guard
        if(will && e.noBombUntil && nowS < e.noBombUntil) will=false;
        if(will && eExits<=1) will=false;
        // don't bomb if standing in hazard or immediate danger
        if(will && (this._isHazard(e.x,e.y) || tileInDanger(this.bombs,e.x,e.y,0.6))) will=false;
        if(will){
          const cand=[{x:e.x,y:e.y}];
          for(const c of cand){
            if(c.x<0||c.y<0||c.x>=GW||c.y>=GH) continue;
            if(this.grid[c.y][c.x]!==0) continue;
            const chainDanger = this._chainDangerFrom(c.x,c.y,(e.pow||2));
            const safe = (()=>{ const q=[{x:c.x,y:c.y,d:0}], seen=Array.from({length:GH},()=>Array(GW).fill(false)); seen[c.y][c.x]=true; while(q.length){ const cur=q.shift(); if(cur.d>6) continue; const key=`${cur.x},${cur.y}`; const inNewBlast = chainDanger.has(key); const immediate = tileInDanger(this.bombs,cur.x,cur.y,0.9) || this._isHazard(cur.x,cur.y) || inNewBlast; if(cur.d>=5 && !immediate) return true; for(const [dx,dy] of [[0,1],[0,-1],[1,0],[-1,0]]){ const nx=cur.x+dx, ny=cur.y+dy; if(nx<0||ny<0||nx>=GW||ny>=GH) continue; if(seen[ny][nx]) continue; if(this.grid[ny][nx]!==0) continue; if(this.bombs.some(bm=>bm.x===nx&&bm.y===ny)) continue; seen[ny][nx]=true; q.push({x:nx,y:ny,d:cur.d+1}); } } return false; })();
            const exitsOK = this._freeNeighbors(c.x,c.y) >= 2;
            if(safe && exitsOK){ this._placeBomb(e); e.fleeUntil = nowS + 1.4; break; }
          }
        }
        e.placeCd = (e.type==='boss'?0.7:2.0) + Math.random()*(e.type==='boss'?0.9:1.2);
      }
    }

    // process pending moves and pushing bombs
    if(this.pending && this.pending.length){
      const canceled = new Set();
      for(let i=0;i<this.pending.length;i++) for(let j=i+1;j<this.pending.length;j++){
        const a=this.pending[i], b=this.pending[j];
        if(a.from.x===b.to.x && a.from.y===b.to.y && b.from.x===a.to.x && b.from.y===a.from.y) { canceled.add(i); canceled.add(j); }
      }
      const claims = {};
      for(let i=0;i<this.pending.length;i++){
        if(canceled.has(i)) continue;
        const r = this.pending[i]; const tx=r.to.x, ty=r.to.y;
        if(tx<0||ty<0||tx>=GW||ty>=GH) continue; if(this.grid[ty][tx]!==0) continue;
        const bombIdx = this.bombs.findIndex(b=>b.x===tx && b.y===ty && !b.moving);
        if(bombIdx>=0 && r.ent.canPush){
          const dx = tx - r.from.x, dy = ty - r.from.y; const bx2 = tx + dx, by2 = ty + dy;
          if(bx2>=0 && by2>=0 && bx2<GW && by2<GH && this.grid[by2][bx2]===0 && !this.bombs.some(b=>b.x===bx2&&b.y===by2) && !this._entityAt(bx2,by2)){
            const b = this.bombs[bombIdx]; b.moving=true; b.fromX=b.x;b.fromY=b.y; b.toX=bx2; b.toY=by2; b.moveStart=this.time.now/1000; b.moveDur=0.12; b.displayX=b.fromX; b.displayY=b.fromY;
            const key = `${tx},${ty}`; if(!claims[key]){ claims[key]=r; r.ent.x = tx; r.ent.y = ty; } else { const other=claims[key]; if(other && other.ent){ other.ent.x=other.from.x; other.ent.y=other.from.y; delete claims[key]; } }
            continue;
          } else continue;
        }
        if(this.bombs.some(b=>b.x===tx && b.y===ty && !b.moving)) continue;
        const occ = this._entityAt(tx,ty); let occMovingAway=false;
        if(occ){ const occReq = this.pending.find(rr=>rr.ent===occ); if(occReq && !canceled.has(this.pending.indexOf(occReq))) occMovingAway=true; }
        if(occ && !occMovingAway) continue;
        const key = `${tx},${ty}`;
        if(!claims[key]){ claims[key]=r; r.ent.x=tx; r.ent.y=ty; } else { const other=claims[key]; if(other && other.ent){ other.ent.x=other.from.x; other.ent.y=other.from.y; delete claims[key]; } }
      }
      this.pending.length = 0;
    }

    // update bombs (moving display)
    for(const b of this.bombs){
      if(b.moving){ const now=this.time.now/1000; const t=Math.min(1,(now - b.moveStart)/b.moveDur); b.displayX = b.fromX + (b.toX - b.fromX)*t; b.displayY = b.fromY + (b.toY - b.fromY)*t; if(t>=1){ b.moving=false; b.x=b.toX; b.y=b.toY; b.displayX=b.x; b.displayY=b.y; } } else { b.displayX = b.x; b.displayY = b.y; }
    }

    // bombs countdown
    for(let i=this.bombs.length-1;i>=0;i--){ const b=this.bombs[i]; b.timer -= d; if(b.timer <= 0){ this._explode(b); this.bombs.splice(i,1); } }

    // explosions lifetime
    this.explosions = this.explosions.filter(ex=>{ ex.timer -= d; return ex.timer > 0; });

    // pickup detection and apply
    for(const p of this.players) if(p.alive) this._pickup(p);

    // handle player damage from explosions and sea
    for(const p of this.players){ if(!p.alive) continue; const hit = this.explosions.some(ex=>ex.x===p.x && ex.y===p.y); if(hit) this._hitPlayer(p);
      if(this._isHazard(p.x,p.y)){
        if(!p._nextHazardTick) p._nextHazardTick = this.time.now;
        if(this.time.now >= p._nextHazardTick){ this._hitPlayer(p); p._nextHazardTick = this.time.now + 1000; }
      } else { p._nextHazardTick = this.time.now + 200; }
    }

    // enemies death
    const aliveEnemies=[]; for(const e of this.enemies){
      const hit = this.explosions.some(ex=>ex.x===e.x && ex.y===e.y) || this._isHazard(e.x,e.y);
      if(hit){ if(e.type==='boss'){ e.hp--; if(e.hp>0) aliveEnemies.push(e); else { if(Math.random()<0.25) this._dropFruit(e.x,e.y); if(this.game._audioCtx) AudioSys.sfx(this.game._audioCtx,'die'); } } else { if(Math.random()<0.25) this._dropFruit(e.x,e.y); if(this.game._audioCtx) AudioSys.sfx(this.game._audioCtx,'die'); } } else aliveEnemies.push(e);
    } this.enemies = aliveEnemies;

    // win/lose
    if(this.mode===1){ if(this.enemies.length===0) this._nextLevel(); if(!this.players.some(p=>p.alive)) this._gameOver(false); } else { const alive = this.players.filter(p=>p.alive); if(alive.length===1) this._gameOver(true,alive[0]); if(alive.length===0) this._gameOver(false); }

    // draw
    this._draw(dt);
  }

  _dropFruit(x,y){
    const types=['straw','pine','grape']; this.powerups.push({x,y,type:types[Math.floor(Math.random()*types.length)],life:8});
  }

  _pickup(p){
    const idx = this.powerups.findIndex(pp=>pp.x===p.x && pp.y===p.y);
    if(idx<0) return;
    const pu = this.powerups[idx];
    if(pu.type==='straw'){ p.bombPow = Math.min(5,(p.bombPow||2)+1); this._spawnFloatingText(`+ Alcance`, OFFX + p.x*TILE + TILE/2, OFFY + p.y*TILE); }
    else if(pu.type==='pine'){ p.bombCnt = Math.min(5,(p.bombCnt||1)+1); this._spawnFloatingText(`+ Bomba`, OFFX + p.x*TILE + TILE/2, OFFY + p.y*TILE); }
    else if(pu.type==='grape'){ p.invUntil = this.time.now + 3000; this._spawnFloatingText(`Invulnerable`, OFFX + p.x*TILE + TILE/2, OFFY + p.y*TILE); }
    else if(pu.type==='push'){ p.canPush = true; this._spawnFloatingText(`Empujar`, OFFX + p.x*TILE + TILE/2, OFFY + p.y*TILE); }
    // sound + remove
    if(this.game._audioCtx) AudioSys.sfx(this.game._audioCtx,'pickup');
    this.powerups.splice(idx,1);
  }

  _explode(b){
    if(this.game._audioCtx) AudioSys.sfx(this.game._audioCtx,'expl');
    this.cameras.main.shake(100,0.003);
    const dirs=[[0,0],[0,-1],[0,1],[-1,0],[1,0]];
    for(const [dx,dy] of dirs){
      for(let r=0;r<b.pow;r++){
        const ex=b.x+dx*r, ey=b.y+dy*r;
        if(ex<0||ey<0||ex>=GW||ey>=GH) break;
        if(this.grid[ey][ex]===1) break;
        this.explosions.push({x:ex,y:ey,timer:0.5});
        if(this.grid[ey][ex]===2){ this.grid[ey][ex]=0; this.blocks=this.blocks.filter(bl=>!(bl.x===ex&&bl.y===ey)); if(Math.random()<0.4) this._dropFruit(ex,ey); break; }
        const cb = this.bombs.find(b2=>b2.x===ex && b2.y===ey && b2!==b); if(cb && cb.timer>0.12) cb.timer=0.12;
      }
    }
  }

  _nextLevel(){ if(this.game._audioCtx) AudioSys.sfx(this.game._audioCtx,'place'); this.time.delayedCall(700, ()=> this.scene.restart({mode:1,level:this.level+1})); }

  _gameOver(win,winner){
    if(this.mode===1){
      const lb = JSON.parse(localStorage.getItem(LB_KEY)||'[]'); let name='Jugador'; try{ name = prompt('Tu nombre para Top 5:', 'Jugador') || 'Jugador'; }catch(e){}
      lb.push({name, level:this.level, time: Math.round(this.elapsed||0)}); lb.sort((a,b)=> b.level - a.level || a.time - b.time); if(lb.length>5) lb.length=5; localStorage.setItem(LB_KEY, JSON.stringify(lb));
    }
    this.scene.start('End',{win,winner,mode:this.mode,level:this.level});
  }

  _entityAt(x,y){ const p = this.players.find(pp=>pp.x===x&&pp.y===y&&pp.alive); if(p) return p; const e = this.enemies.find(ee=>ee.x===x&&ee.y===y); if(e) return e; return null; }
  _nearestPlayer(sx,sy){ let best=null,bd=1e9; for(const p of this.players) if(p.alive){ const dist=Math.abs(p.x-sx)+Math.abs(p.y-sy); if(dist<bd){bd=dist; best={x:p.x,y:p.y}} } return best; }

  _canMove(x,y,allowMoving=false){
    if(x<0||y<0||x>=GW||y>=GH) return false;
    if(this.grid[y][x]!==0) return false;
    // bombs block unless moving away
    if(this.bombs.some(b=>b.x===x && b.y===y && !b.moving)) return false;
    const ent = this._entityAt(x,y);
    if(ent && !allowMoving) return false;
    return true;
  }

  // draw functions (canvas via Phaser graphics)
  _draw(dt){
    const g = this.gfx; this.bg.clear(); this.bg2.clear(); this.fx.clear(); g.clear();
    for(let y=0;y<H;y+=6){ const c=Phaser.Display.Color.Interpolate.ColorWithColor({r:9,g:45,b:20},{r:24,g:75,b:32},H,y); this.bg.fillStyle(Phaser.Display.Color.GetColor(c.r,c.g,c.b),1); this.bg.fillRect(0,y,W,6); }
    this._par += 0.12;
    const lay=[{y:OFFY+GH*TILE-90,col:0x0a2a15,spd:0.10,sc:1.1},{y:OFFY+GH*TILE-50,col:0x0c331a,spd:0.18,sc:1.0}];
    for(const L of lay){ const off=(this._par*L.spd)%80; for(let x=-80;x<W+80;x+=80){ const bx=x-off; this.bg2.fillStyle(L.col,1); this.bg2.fillRect(bx+30,L.y-60,12,60); this.bg2.fillCircle(bx+36,L.y-70,26*L.sc); this.bg2.fillCircle(bx+18,L.y-62,18*L.sc); this.bg2.fillCircle(bx+52,L.y-60,18*L.sc); } this.bg2.fillStyle(L.col,1); this.bg2.fillRect(0,L.y,W,8); }
    // background floor
    for(let y=0;y<GH;y++){
      for(let x=0;x<GW;x++){
        const px=OFFX + x*TILE, py=OFFY + y*TILE;
        const shade = ((x+y)%2===0)?PAL.jungle1:PAL.jungle2;
        g.fillStyle(shade,1); g.fillRect(px,py,TILE,TILE);
        if(this.grid[y][x]===1){ g.fillStyle(PAL.rock,1); g.fillRect(px,py,TILE,TILE); g.fillStyle(PAL.moss,0.6); g.fillRect(px+4,py+4,TILE-8,TILE-8); }
        else if(this.grid[y][x]===2){
          const b = this.blocks.find(bl=>bl.x===x && bl.y===y);
          if(b && b.type==='trunk'){ g.fillStyle(PAL.trunk,1); g.fillRect(px+6,py+6,TILE-12,TILE-12); g.fillStyle(0x000000,0.12); g.fillRect(px+6,py+TILE-10,TILE-12,6); g.fillStyle(0x3e2723,0.15); g.fillRect(px+8,py+8,TILE-16,TILE-16); }
          else if(b && b.type==='sapling'){ g.fillStyle(0x4e342e,1); g.fillRect(px+8,py+8,TILE-16,TILE-16); g.fillStyle(0x000000,0.1); g.fillRect(px+8,py+TILE-10,TILE-16,6); g.fillStyle(PAL.leaf,1); g.fillCircle(px+TILE/2,py+TILE/2 - 6, TILE*0.22); }
          else { g.fillStyle(0x6d4c41,1); g.fillRect(px,py,TILE,TILE); g.fillStyle(0x2e7d32,0.12); g.fillRect(px+3,py+3,TILE-6,TILE-6); }
        }
        g.lineStyle(1,0x000000,0.06); g.strokeRect(px,py,TILE,TILE);
      }
    }
    g.lineStyle(2,PAL.gold,0.6); g.strokeRect(OFFX-6,OFFY-6,GW*TILE+12,GH*TILE+12);
    // draw powerups (distinct)
    for(const pu of this.powerups){
      const cx = OFFX + pu.x*TILE + TILE/2, cy = OFFY + pu.y*TILE + TILE/2;
      const t = (this.time.now/300)%1; const pulse = 0.9 + Math.sin(t*Math.PI*2)*0.08;
      if(pu.type==='straw'){ g.fillStyle(0xff3d7f,1); g.fillCircle(cx,cy,TILE*0.18*pulse); g.fillStyle(0x2e7d32,1); g.fillRect(cx-6,cy-14,12,6);
      } else if(pu.type==='pine'){
        g.fillStyle(0xffd54f,1); g.fillRect(cx-10,cy-10,20,20); g.fillStyle(0x2e7d32,1); g.fillRect(cx-4,cy-18,8,8);
      } else if(pu.type==='grape'){
        g.fillStyle(0x7e57c2,1); for(let i=0;i<6;i++){ const a=i*(Math.PI*2/6); g.fillCircle(cx+Math.cos(a)*6, cy+Math.sin(a)*4, 6); }
      } else if(pu.type==='push'){
        // simple boot icon
        g.fillStyle(0x8d6e63,1); g.fillRect(cx-8,cy-4,14,10); g.fillStyle(0x3e2723,1); g.fillRect(cx-12,cy+4,18,4);
      } else { g.fillStyle(0xffd54f,1); g.fillCircle(cx,cy,TILE*0.16); }
    }
    // draw bombs bananas
    for(const b of this.bombs){
      const cx = OFFX + b.displayX*TILE + TILE/2, cy = OFFY + b.displayY*TILE + TILE/2;
      g.fillStyle(0x000000,0.18); g.fillEllipse(cx, cy + TILE*0.22, TILE*0.36, TILE*0.12);
      this._drawBanana(cx,cy,b.timer);
    }
    // explosions
    for(const ex of this.explosions){
      const a = Math.max(0.14, ex.timer/0.5);
      const px = OFFX + ex.x*TILE, py = OFFY + ex.y*TILE;
      g.fillStyle(0xffa726,a); g.fillRect(px,py,TILE,TILE);
      g.fillStyle(0xffff8d,a*0.95); g.fillRect(px+6,py+6,TILE-12,TILE-12);
      for(let i=0;i<6;i++){ const rx=px+Math.random()*TILE, ry=py+Math.random()*TILE; g.fillStyle(0xfff59d,Math.random()*0.6); g.fillCircle(rx,ry,Math.random()*3); }
    }
    // players
    for(const p of this.players) if(p.alive) this._drawTrainer(OFFX + p.x*TILE + TILE/2, OFFY + p.y*TILE + TILE/2, CHARS[p.char], p);
    // enemies
    for(const e of this.enemies) this._drawEnemy(OFFX + e.x*TILE + TILE/2, OFFY + e.y*TILE + TILE/2, e);
    // floating texts - draw as Phaser texts for crispness
    // maintain floats array with objects {t, dur, txt, x, y}
    if(!this._textPool) this._textPool=[];
    this._textPool = this._textPool.filter(ft=>{ ft.t += 1/60; const a = 1 - (ft.t/ft.dur); if(a<=0){ ft.obj.destroy(); return false; } ft.obj.setAlpha(a); ft.obj.y = ft.origY - (ft.t/ft.dur)*36; return true; });
    this.hud.setText(`Nivel ${this.level}`);
    this.fx.fillStyle(0x000000,0.05); for(let y=0;y<H;y+=4) this.fx.fillRect(0,y,W,1);
    this.fx.fillStyle(0x000000,0.12); this.fx.fillRect(0,0,W,10); this.fx.fillRect(0,H-10,W,10); this.fx.fillRect(0,0,10,H); this.fx.fillRect(W-10,0,10,H);
    // draw speaker icon if audio locked (Game scene)
    const ctxG=this.game._audioCtx; const lockedG = !ctxG || ctxG.state!=='running';
    if(lockedG){ const x=W-28, y=16; this.fx.fillStyle(0xffffff,0.85); this.fx.fillRect(x-14,y+6,8,8); this.fx.fillTriangle(x-14,y+6, x-4,y+2, x-4,y+18); this.fx.fillStyle(0xffffff,0.6); this.fx.fillCircle(x+2,y+10,3); this.fx.lineStyle(2,0xffffff,0.7); this.fx.strokeCircle(x+2,y+10,6); }
    // hazard overlay: animated sea cubes
    if(this.hazard.size){
      const t = (this.time.now/300)%1000;
      for(const key of this.hazard){ const [x,y]=key.split(',').map(n=>+n); const px=OFFX+x*TILE, py=OFFY+y*TILE;
        for(let yy=0; yy<TILE; yy+=8){ for(let xx=0; xx<TILE; xx+=8){ const w=6,h=6; const a = 0.35 + 0.15*Math.sin((t + (x+xx)*0.7 + (y+yy)*0.9)*0.15); const col = Phaser.Display.Color.GetColor(20, 90 + ((x+y+xx+yy)%16)*5, 140 + ((x*7+y*11)%20)); this.fx.fillStyle(col, a); this.fx.fillRect(px+xx+1, py+yy+1, w, h); } }
      }
    }
    // player glow
    for(const p of this.players){ if(!p.alive) continue; const col=CHARS[p.char].trim; this.fx.fillStyle(col,0.08); this.fx.fillCircle(OFFX+p.x*TILE+TILE/2, OFFY+p.y*TILE+TILE/2, TILE*0.36); }
  }

  _spawnFloatingText(txt,x,y){
    const t = this.add.text(x,y,txt,{fontSize:'16px',color:'#fff',stroke:'#000',strokeThickness:3}).setOrigin(.5);
    this._textPool = this._textPool || []; this._textPool.push({obj:t,t:0,dur:1.2,origY:y});
  }

  _drawBanana(cx,cy,timer){
    const g=this.gfx; const rot = Math.sin(timer*9)*0.12;
    g.save(); g.translateCanvas(cx,cy); g.rotateCanvas(rot);
    // banana crescent: outer and inner to carve peel curve
    g.lineStyle(2,0x4e342e,0.35); g.strokeEllipse(0,0,TILE*0.64,TILE*0.26);
    g.fillStyle(PAL.banana,1); g.fillEllipse(0,0,TILE*0.64,TILE*0.26);
    g.fillStyle(PAL.banana,1); g.fillCircle(-TILE*0.30, 0, TILE*0.08);
    g.fillCircle(TILE*0.28, -TILE*0.01, TILE*0.06);
    g.fillStyle(PAL.bananaSh,1); g.fillEllipse(-TILE*0.12,0,TILE*0.40,TILE*0.14);
    // soft inner shadow to enhance curve
    g.fillStyle(0x000000,0.06); g.fillEllipse(TILE*0.10, TILE*0.02, TILE*0.48, TILE*0.20);
    // stem and tip
    g.fillStyle(0x6d4c41,1); g.fillRect(TILE*0.26,-TILE*0.04,TILE*0.06,TILE*0.06);
    g.fillStyle(PAL.stem,1); g.fillRect(TILE*0.24,-TILE*0.08,TILE*0.06,TILE*0.06);
    // spots
    g.fillStyle(0x8d6e63,0.2); for(let i=0;i<3;i++){ g.fillCircle(-TILE*0.06 + i*TILE*0.08, -TILE*0.02 + Math.sin(i)*TILE*0.02, TILE*0.01 + i*0.8); }
    // highlight
    g.fillStyle(0xffffff,0.16); g.fillEllipse(-TILE*0.09, -TILE*0.02, TILE*0.16, TILE*0.05);
    // peel lines
    g.lineStyle(1,0x8d6e63,0.35);
    g.beginPath(); g.moveTo(-TILE*0.20, -TILE*0.06); g.lineTo(-TILE*0.02, -TILE*0.02); g.strokePath();
    g.beginPath(); g.moveTo(-TILE*0.16, 0); g.lineTo(0, 0.02); g.strokePath();
    g.beginPath(); g.moveTo(-TILE*0.08, 0.06); g.lineTo(TILE*0.08, 0.06); g.strokePath();
    g.restore();
    const p = Math.max(0, Math.min(1, (1.9 - timer)/1.9));
    if(p>0.4){ const a=0.08+0.25*p; this.gfx.lineStyle(2,0xffd54f,a); this.gfx.strokeEllipse(cx,cy,TILE*0.62,TILE*0.28); }
    if(timer < 0.6){ g.fillStyle(0xff6b6b, Math.max(0.15, (0.6 - timer)/0.6)); g.fillCircle(cx, cy - TILE*0.26, TILE*0.06) }
  }

  _drawTrainer(cx,cy,spec,p){
    const g=this.gfx; g.fillStyle(0x000000,0.22); g.fillEllipse(cx, cy + TILE*0.25, TILE*0.36, TILE*0.12);
    // head
    g.fillStyle(PAL.skin,1); g.fillCircle(cx, cy - TILE*0.28, TILE*0.14);
    // band
    g.fillStyle(spec.trim,1); g.fillRect(cx - TILE*0.20, cy - TILE*0.40, TILE*0.40, TILE*0.08);
    g.fillStyle(0x000000,0.10); g.fillRect(cx - TILE*0.06, cy - TILE*0.38, TILE*0.12, TILE*0.02);
    // backpack (varía por personaje)
    const bk=[0x546e7a,0x6d4c41,0x3e2723,0x455a64][p.char||0];
    g.fillStyle(bk,1); g.fillRect(cx - TILE*0.15, cy + TILE*0.00, TILE*0.30, TILE*0.18);
    // body
    g.fillStyle(spec.suit,1); g.fillRect(cx - TILE*0.13, cy - TILE*0.02, TILE*0.26, TILE*0.36);
    g.fillStyle(0x000000,0.05); g.fillRect(cx - TILE*0.13, cy + TILE*0.02, TILE*0.26, TILE*0.10);
    g.lineStyle(2,0x212121,0.25); g.strokeRect(cx - TILE*0.13, cy - TILE*0.02, TILE*0.26, TILE*0.36);
    const tf = Math.floor((this.time.now/80)%6);
    const armOffsets = [-TILE*0.04,-TILE*0.03,-TILE*0.02,TILE*0.0,TILE*0.02,TILE*0.03];
    const legOffsets = [TILE*0.03,TILE*0.02,0,-TILE*0.02,-TILE*0.03,-TILE*0.01];
    const ao = armOffsets[tf], lo = legOffsets[tf];
    g.fillStyle(spec.suit,1);
    g.fillRect(cx - TILE*0.30, cy - TILE*0.06 + ao, TILE*0.16, TILE*0.10);
    g.fillRect(cx + TILE*0.14, cy - TILE*0.06 - ao, TILE*0.16, TILE*0.10);
    g.fillStyle(0x212121,1);
    g.fillRect(cx - TILE*0.08, cy + TILE*0.22 + lo, TILE*0.08, TILE*0.14);
    g.fillRect(cx + TILE*0.02, cy + TILE*0.22 - lo, TILE*0.08, TILE*0.14);
    g.fillStyle(0x424242,1); g.fillRect(cx - TILE*0.12, cy + TILE*0.12, TILE*0.24, TILE*0.02);
    // face: eyes + mouth
    g.fillStyle(0x000000,1); g.fillRect(cx - TILE*0.04, cy - TILE*0.28, TILE*0.02, TILE*0.02); g.fillRect(cx + TILE*0.02, cy - TILE*0.28, TILE*0.02, TILE*0.02);
    g.fillStyle(0xb71c1c,1); g.fillRect(cx - TILE*0.02, cy - TILE*0.22, TILE*0.04, TILE*0.01);
    // chest highlight
    g.fillStyle(0xffffff,0.06); g.fillRect(cx - TILE*0.12, cy - TILE*0.02, TILE*0.10, TILE*0.10);
    if(this.time.now < (p.invUntil||0)){
      if(Math.floor(this.time.now/120)%2===0){ g.fillStyle(0xffffff,0.08); g.fillRect(cx - TILE*0.13, cy - TILE*0.02, TILE*0.26, TILE*0.36); }
    }
  }

  _drawEnemy(cx,cy,e){
    const g=this.gfx; const tf = Math.floor((this.time.now/80)%6);
    if(e.type==='boss'){
      g.fillStyle(0x6a1b9a,1); g.fillRect(cx - TILE*0.34, cy - TILE*0.2, TILE*0.68, TILE*0.5);
      g.fillStyle(0xffd1a4,1); g.fillCircle(cx, cy - TILE*0.36, TILE*0.17);
      const bx = cx - TILE*0.34, by = cy - TILE*0.44, w = TILE*0.68; const maxHp = 4+Math.floor(this.level*0.8); const ratio = Math.min(1, (e.hp)/(maxHp)); const hw = Math.max(2, Math.floor(w*ratio)); g.fillStyle(0x000000,0.6); g.fillRect(bx,by,w,8); g.fillStyle(0xff5252,1); g.fillRect(bx,by,hw,8);
    } else {
      g.fillStyle(0x8d6e63,1); g.fillRect(cx - TILE*0.12, cy - TILE*0.08, TILE*0.24, TILE*0.32);
      g.fillStyle(0xffe0b2,1); g.fillCircle(cx, cy - TILE*0.28, TILE*0.12);
      g.fillStyle(0x000000,1); g.fillRect(cx - TILE*0.04, cy - TILE*0.28, TILE*0.02, TILE*0.02); g.fillRect(cx + TILE*0.02, cy - TILE*0.28, TILE*0.02, TILE*0.02);
      // tail
      g.fillStyle(0x5d4037,1); const tailOffset = [0,1,2,1,0,-1][tf]; g.fillRect(cx + TILE*0.18, cy + TILE*0.02 + tailOffset, TILE*0.08, TILE*0.04);
    }
  }

  _spawnUniquePush(){
    let tries=0; while(tries<200){ const x=1+Math.floor(Math.random()*(GW-2)), y=1+Math.floor(Math.random()*(GH-2)); tries++; if(this.grid[y][x]===0 && !this._entityAt(x,y)){ this.powerups.push({x,y,type:'push',life:999}); break; } }
  }
  _isHazard(x,y){ return this.hazard.has(`${x},${y}`); }
  _applyClose(level){
    const L=level; const Lx=L, Ly=L, Rx=GW-1-L, By=GH-1-L; if(Rx<=Lx||By<=Ly) return;
    for(let x=Lx;x<=Rx;x++){ this.hazard.add(`${x},${Ly}`); this.hazard.add(`${x},${By}`); }
    for(let y=Ly;y<=By;y++){ this.hazard.add(`${Lx},${y}`); this.hazard.add(`${Rx},${y}`); }
  }
  _nearestSafeStep(sx,sy){
    const q=[{x:sx,y:sy,px:sx,py:sy}], seen=new Set([`${sx},${sy}`]);
    const dirs=[[0,-1],[0,1],[-1,0],[1,0]];
    while(q.length){ const cur=q.shift(); if(!tileInDanger(this.bombs,cur.x,cur.y,0.3) && !this._isHazard(cur.x,cur.y)){ if(!(cur.x===sx&&cur.y===sy)) return [cur.x-cur.px, cur.y-cur.py]; }
      for(const [dx,dy] of dirs){ const nx=cur.x+dx, ny=cur.y+dy; const k=`${nx},${ny}`; if(seen.has(k)) continue; if(nx<0||ny<0||nx>=GW||ny>=GH) continue; if(!this._canMove(nx,ny,true)) continue; seen.add(k); q.push({x:nx,y:ny,px:cur.x,py:cur.y}); }
    }
    return null;
  }
  _pathStep(sx,sy,tx,ty){
    const dirs=[[0,-1],[0,1],[-1,0],[1,0]];
    const q=[]; const seen=new Set(); seen.add(`${sx},${sy}`); q.push({x:sx,y:sy,dx:0,dy:0});
    let depth=0; while(q.length && depth<50){ const curLen=q.length; for(let i=0;i<curLen;i++){ const n=q.shift(); for(const [dx,dy] of dirs){ const nx=n.x+dx, ny=n.y+dy; const k=`${nx},${ny}`; if(seen.has(k)) continue; if(nx<0||ny<0||nx>=GW||ny>=GH) continue; if(!this._canMove(nx,ny,true)) continue; if(tileInDanger(this.bombs,nx,ny,0.6) || this._isHazard(nx,ny)) continue; const ndx=(n.dx===0&&n.dy===0)?dx:n.dx; const ndy=(n.dx===0&&n.dy===0)?dy:n.dy; if(nx===tx&&ny===ty) return [ndx,ndy]; seen.add(k); q.push({x:nx,y:ny,dx:ndx,dy:ndy}); } } depth++; }
    let best=null,bd=1e9; for(const [dx,dy] of dirs){ const nx=sx+dx, ny=sy+dy; if(!this._canMove(nx,ny,true)) continue; const dist=Math.abs(nx-tx)+Math.abs(ny-ty); const danger=tileInDanger(this.bombs,nx,ny,0.8)?6:0; if(dist+danger<bd){bd=dist+danger; best=[dx,dy];} } return best;
  }
  _freeNeighbors(x,y){
    let cnt=0; for(const [dx,dy] of [[0,-1],[0,1],[-1,0],[1,0]]){ const nx=x+dx, ny=y+dy; if(nx<0||ny<0||nx>=GW||ny>=GH) continue; if(this.grid[ny][nx]!==0) continue; if(this.bombs.some(b=>b.x===nx&&b.y===ny)) continue; cnt++; } return cnt;
  }
  _alignedClear(sx,sy,tx,ty){
    if(sx===tx){ const dy=sy<ty?1:-1; for(let y=sy+dy; y!==ty; y+=dy){ if(this.grid[y][sx]!==0) return false; if(this.bombs.some(b=>b.x===sx&&b.y===y)) return false; } return true; }
    if(sy===ty){ const dx=sx<tx?1:-1; for(let x=sx+dx; x!==tx; x+=dx){ if(this.grid[sy][x]!==0) return false; if(this.bombs.some(b=>b.x===x&&b.y===sy)) return false; } return true; }
    return false;
  }
  _chainDangerFrom(sx,sy,pow){
    const danger = new Set();
    const bmap = new Map();
    for(const b of this.bombs){ bmap.set(`${b.x},${b.y}`, b.pow||2); }
    bmap.set(`${sx},${sy}`, pow||2);
    const q=[{x:sx,y:sy,pow:pow||2}];
    const seen=new Set([`${sx},${sy}`]);
    const dirs=[[0,0],[0,-1],[0,1],[-1,0],[1,0]];
    while(q.length){
      const cur=q.shift();
      for(const [dx,dy] of dirs){
        for(let r=0;r<cur.pow;r++){
          const ex=cur.x+dx*r, ey=cur.y+dy*r;
          if(ex<0||ey<0||ex>=GW||ey>=GH) break;
          if(this.grid[ey][ex]===1) break;
          danger.add(`${ex},${ey}`);
          if(this.grid[ey][ex]===2) break;
          const k=`${ex},${ey}`;
          if(bmap.has(k) && !seen.has(k)){ seen.add(k); q.push({x:ex,y:ey,pow:bmap.get(k)||2}); }
        }
      }
    }
    return danger;
  }
  _hitPlayer(p){
    if(this.time.now <= (p.invUntil||0)) return;
    if(this.mode===2){
      if(p.lives==null) p.lives = 3;
      p.lives = Math.max(0, p.lives - 1);
      if(p.lives > 0){
        p.invUntil = this.time.now + 1000;
        this._spawnFloatingText('-1 vida', OFFX + p.x*TILE + TILE/2, OFFY + p.y*TILE);
        if(this.game._audioCtx) AudioSys.sfx(this.game._audioCtx,'die');
      } else {
        p.alive=false;
        if(this.game._audioCtx) AudioSys.sfx(this.game._audioCtx,'die');
      }
    } else {
      if(p.shield>0){ p.shield-=1; p.invUntil = this.time.now + 800; }
      else { p.alive=false; if(this.game._audioCtx) AudioSys.sfx(this.game._audioCtx,'die'); }
    }
  }
}

// END SCENE
class EndScene extends Phaser.Scene {
  constructor(){ super('End') }
  init(d){ this.win=d.win; this.winner=d.winner; this.mode=d.mode; this.level=d.level; }
  create(){ const g=this.add.graphics(); g.fillStyle(0x000000,0.9); g.fillRect(0,0,W,H); const msg=this.win? (this.mode===2? 'Ganador!' : `Nivel ${this.level} Completado!`) : 'Game Over!'; const t=this.add.text(W/2,H/2-60,msg,{fontSize:'42px',color:this.win? '#4caf50':'#f44336'}).setOrigin(.5); this.tweens.add({targets:t,scale:{from:1,to:1.06},duration:800,yoyo:true,repeat:-1}); this.add.text(W/2,H/2+10,'Presiona START para volver al Menu',{fontSize:'18px',color:'#fff'}).setOrigin(.5); if(this.mode===1){ const lb = JSON.parse(localStorage.getItem(LB_KEY)||'[]'); const lines = lb.map((e,i)=> `${i+1}. ${e.name} - Nivel ${e.level} (${e.time}s)`).slice(0,5); this.add.text(W/2,H/2+70, lines.join('\n') || 'No hay puntajes aún', {fontSize:'16px',color:'#ffeb3b',align:'center'}).setOrigin(.5); } this.input.keyboard.on('keydown', e=>{ const k=K2A[e.key]||e.key; if(k==='START1'||k==='START2'||k==='P1A'||k==='P2A') this.scene.start('Menu'); }); }
}

// Start Phaser
new Phaser.Game({ type: Phaser.AUTO, width: W, height: H, backgroundColor:'#081b12', scene:[MenuScene,GameScene,EndScene] });

// debug
window.__Platanoboom = { GW, GH, TILE, MAX_ENEMIES };

