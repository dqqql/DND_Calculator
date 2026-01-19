import React, { useState, useEffect } from 'react';
import { Sword, Shield, Skull, Info, AlertTriangle, User, Users, Plus, Trash2, Zap, Crown } from 'lucide-react';

const DndCombatCalculator = () => {
  const [mode, setMode] = useState('player_analysis'); 

  // --- 玩家数据列表 ---
  const [players, setPlayers] = useState([
    { id: 1, name: '战士', attackBonus: 6, diceCount: 2, diceType: 6, damageMod: 4, attacksPerRound: 2, advantageState: 'normal' }
  ]);
  const [monsterAC, setMonsterAC] = useState(15); 

  // --- 怪物数据列表 ---
  // 新增 isBoss 字段，默认为 false
  const [monsters, setMonsters] = useState([
    { id: 1, name: '地精首领', attackBonus: 5, diceCount: 1, diceType: 8, damageMod: 3, attacksPerRound: 2, advantageState: 'normal', isBoss: true }
  ]);
  const [targetPlayerAC, setTargetPlayerAC] = useState(15); 
  const [targetPlayerLevel, setTargetPlayerLevel] = useState(3);
  const [targetPlayerHP, setTargetPlayerHP] = useState(25);

  // --- 计算结果 ---
  const [partyTotalDPR, setPartyTotalDPR] = useState(0);
  const [encounterStats, setEncounterStats] = useState({ 
    totalDPR: 0, 
    highestMaxDamage: 0,
    bossName: '' 
  });

  // --- 核心算法 ---
  const calculateStats = (atkBonus, targetAC, diceCount, diceType, damageMod, attacks, advState) => {
    const neededRoll = targetAC - atkBonus;
    let rawHitChance = Math.max(0.05, Math.min(0.95, (21 - neededRoll) / 20));

    let finalHitChance = rawHitChance;
    if (advState === 'advantage') finalHitChance = 1 - Math.pow(1 - rawHitChance, 2);
    else if (advState === 'disadvantage') finalHitChance = Math.pow(rawHitChance, 2);

    const diceAvg = diceCount * ((diceType + 1) / 2);
    let critChance = advState === 'advantage' ? 0.0975 : (advState === 'disadvantage' ? 0.0025 : 0.05);

    const dpr = ((finalHitChance * (diceAvg + damageMod)) + (critChance * diceAvg)) * attacks;
    const maxDamage = ((diceCount * diceType) + damageMod); 

    return { hitChance: finalHitChance, dpr, maxDamage };
  };

  // --- Effect: 计算玩家队伍总输出 ---
  useEffect(() => {
    const total = players.reduce((acc, p) => {
      return acc + calculateStats(p.attackBonus, monsterAC, p.diceCount, p.diceType, p.damageMod, p.attacksPerRound, p.advantageState).dpr;
    }, 0);
    setPartyTotalDPR(total);
  }, [players, monsterAC]);

  // --- Effect: 计算怪物遭遇战总威胁 ---
  useEffect(() => {
    let totalDPR = 0;
    let highestMax = 0;
    let boss = '';

    monsters.forEach(m => {
      const stats = calculateStats(m.attackBonus, targetPlayerAC, m.diceCount, m.diceType, m.damageMod, m.attacksPerRound, m.advantageState);
      totalDPR += stats.dpr;
      
      if (stats.maxDamage > highestMax) {
        highestMax = stats.maxDamage;
        boss = m.name;
      }
    });

    setEncounterStats({ totalDPR, highestMaxDamage: highestMax, bossName: boss });
    setTargetPlayerHP(10 + (targetPlayerLevel - 1) * 7); 
  }, [monsters, targetPlayerAC, targetPlayerLevel]);

  // --- 玩家操作 ---
  const updatePlayer = (id, field, value) => setPlayers(players.map(p => p.id === id ? { ...p, [field]: value } : p));
  const addPlayer = () => players.length < 6 && setPlayers([...players, { id: Date.now(), name: `玩家 ${players.length + 1}`, attackBonus: 5, diceCount: 1, diceType: 8, damageMod: 3, attacksPerRound: 1, advantageState: 'normal' }]);
  const removePlayer = (id) => players.length > 1 && setPlayers(players.filter(p => p.id !== id));

  // --- 怪物操作 (更新) ---
  const updateMonster = (id, field, value) => {
    setMonsters(monsters.map(m => {
      if (m.id !== id) return m;
      // 如果切换 Boss 状态：关闭 Boss 时重置攻击次数为 1
      if (field === 'isBoss' && value === false) {
        return { ...m, [field]: value, attacksPerRound: 1 };
      }
      return { ...m, [field]: value };
    }));
  };

  const addMonster = () => monsters.length < 8 && setMonsters([...monsters, { 
    id: Date.now(), 
    name: `怪物 ${monsters.length + 1}`, 
    attackBonus: 5, 
    diceCount: 1, 
    diceType: 6, 
    damageMod: 2, 
    attacksPerRound: 1, // 默认为 1
    advantageState: 'normal',
    isBoss: false // 默认为普通怪
  }]);
  
  const removeMonster = (id) => monsters.length > 1 && setMonsters(monsters.filter(m => m.id !== id));

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans pb-10">
      {/* 顶部导航 */}
      <header className="bg-slate-950 border-b border-slate-800 p-4 sticky top-0 z-20 shadow-lg backdrop-blur-md bg-opacity-90">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-amber-600 to-amber-700 rounded-lg shadow-inner"><Sword className="w-6 h-6 text-white" /></div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-amber-200 to-amber-500 bg-clip-text text-transparent">D&D 5e 战斗数据工坊</h1>
              <p className="text-xs text-slate-500 font-medium tracking-wide">DM 工具箱 & 遭遇平衡器</p>
            </div>
          </div>
          <div className="flex bg-slate-800 p-1 rounded-lg shadow-inner">
            <button onClick={() => setMode('player_analysis')} className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${mode === 'player_analysis' ? 'bg-amber-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}><Users className="w-4 h-4" />分析队伍</button>
            <button onClick={() => setMode('monster_analysis')} className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${mode === 'monster_analysis' ? 'bg-red-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}><Skull className="w-4 h-4" />分析怪物</button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* 左侧输入区 */}
        <div className="lg:col-span-7 space-y-6">
          {mode === 'player_analysis' ? (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-end gap-4">
                <h2 className="text-lg font-semibold flex items-center gap-2 text-amber-400"><Users className="w-5 h-5" /> 玩家队伍配置</h2>
                <div className="flex items-center gap-2 sm:gap-4 flex-wrap justify-end">
                  <div className="bg-slate-800 p-2 rounded-lg border border-slate-700 flex items-center gap-2 shadow-sm">
                    <label className="text-xs font-bold text-slate-400 uppercase whitespace-nowrap">怪物 AC:</label>
                    <input type="number" value={monsterAC} onChange={(e) => setMonsterAC(Number(e.target.value))} className="w-16 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-center text-amber-400 font-bold outline-none focus:ring-1 focus:ring-amber-500" />
                  </div>
                  <button onClick={addPlayer} disabled={players.length >= 6} className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-amber-400 px-3 py-2 rounded-lg text-xs font-bold transition-all border border-slate-700"><Plus className="w-4 h-4" /> 添加玩家</button>
                </div>
              </div>
              <div className="space-y-3">
                {players.map((p, index) => (
                  <div key={p.id} className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                    <div className="bg-slate-800/50 p-3 border-b border-slate-700/50 flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="bg-slate-700 text-slate-400 text-xs px-1.5 py-0.5 rounded font-mono">{index + 1}</span>
                        <input type="text" value={p.name} onChange={(e) => updatePlayer(p.id, 'name', e.target.value)} className="bg-transparent border-none text-sm font-bold text-slate-200 focus:ring-0 w-32" />
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-500 font-mono">DPR: <span className="text-amber-400 font-bold">{calculateStats(p.attackBonus, monsterAC, p.diceCount, p.diceType, p.damageMod, p.attacksPerRound, p.advantageState).dpr.toFixed(1)}</span></span>
                        {players.length > 1 && <button onClick={() => removePlayer(p.id)} className="text-slate-600 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>}
                      </div>
                    </div>
                    <div className="p-3 grid grid-cols-6 gap-3">
                      <div className="col-span-2 sm:col-span-1"><label className="block text-[10px] text-slate-500 uppercase font-bold mb-1">命中加值</label><input type="number" value={p.attackBonus} onChange={(e) => updatePlayer(p.id, 'attackBonus', Number(e.target.value))} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm outline-none focus:border-amber-500" /></div>
                      <div className="col-span-4 sm:col-span-2"><label className="block text-[10px] text-slate-500 uppercase font-bold mb-1">伤害骰 (数/面)</label><div className="flex gap-1"><input type="number" value={p.diceCount} onChange={(e) => updatePlayer(p.id, 'diceCount', Math.max(1, Number(e.target.value)))} className="w-1/3 bg-slate-900 border border-slate-600 rounded px-1 py-1.5 text-center text-sm outline-none focus:border-amber-500" /><select value={p.diceType} onChange={(e) => updatePlayer(p.id, 'diceType', Number(e.target.value))} className="w-2/3 bg-slate-900 border border-slate-600 rounded px-1 py-1.5 text-sm outline-none focus:border-amber-500 text-center"><option value="4">d4</option><option value="6">d6</option><option value="8">d8</option><option value="10">d10</option><option value="12">d12</option><option value="20">d20</option></select></div></div>
                      <div className="col-span-2 sm:col-span-1"><label className="block text-[10px] text-slate-500 uppercase font-bold mb-1">固定伤害</label><input type="number" value={p.damageMod} onChange={(e) => updatePlayer(p.id, 'damageMod', Number(e.target.value))} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm outline-none focus:border-amber-500" /></div>
                      <div className="col-span-2 sm:col-span-1"><label className="block text-[10px] text-slate-500 uppercase font-bold mb-1">攻击次数</label><input type="number" value={p.attacksPerRound} onChange={(e) => updatePlayer(p.id, 'attacksPerRound', Math.max(1, Number(e.target.value)))} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm outline-none focus:border-amber-500" /></div>
                      <div className="col-span-2 sm:col-span-1"><label className="block text-[10px] text-slate-500 uppercase font-bold mb-1">优劣势</label><select value={p.advantageState} onChange={(e) => updatePlayer(p.id, 'advantageState', e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded px-1 py-1.5 text-xs font-bold outline-none focus:border-amber-500"><option value="normal">正常</option><option value="advantage">优势</option><option value="disadvantage">劣势</option></select></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-end gap-4">
                <h2 className="text-lg font-semibold flex items-center gap-2 text-red-400"><Skull className="w-5 h-5" /> 怪物遭遇配置</h2>
                <div className="flex items-center gap-2 sm:gap-4 flex-wrap justify-end">
                   <div className="bg-slate-800 p-2 rounded-lg border border-slate-700 flex items-center gap-2 shadow-sm">
                    <label className="text-xs font-bold text-slate-400 uppercase whitespace-nowrap flex items-center gap-1"><Shield className="w-3 h-3"/> 玩家AC:</label>
                    <input type="number" value={targetPlayerAC} onChange={(e) => setTargetPlayerAC(Number(e.target.value))} className="w-16 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-center text-slate-200 font-bold outline-none focus:ring-1 focus:ring-red-500" />
                  </div>
                  <div className="bg-slate-800 p-2 rounded-lg border border-slate-700 flex items-center gap-2 shadow-sm">
                    <label className="text-xs font-bold text-slate-400 uppercase whitespace-nowrap flex items-center gap-1"><User className="w-3 h-3"/> 玩家等级:</label>
                    <input type="number" value={targetPlayerLevel} onChange={(e) => setTargetPlayerLevel(Math.max(1, Number(e.target.value)))} className="w-16 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-center text-slate-200 font-bold outline-none focus:ring-1 focus:ring-red-500" />
                  </div>
                  <button onClick={addMonster} disabled={monsters.length >= 8} className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-red-400 px-3 py-2 rounded-lg text-xs font-bold transition-all border border-slate-700"><Plus className="w-4 h-4" /> 添加怪物</button>
                </div>
              </div>

              <div className="space-y-3">
                {monsters.map((m, index) => (
                  <div key={m.id} className={`bg-slate-800 rounded-xl border overflow-hidden shadow-sm hover:shadow-md transition-all relative ${m.isBoss ? 'border-amber-500/50 shadow-amber-900/20' : 'border-slate-700'}`}>
                    
                    {/* 头部区域：名字 + Boss开关 + (Boss特有)攻击次数 */}
                    <div className={`p-3 border-b flex flex-wrap gap-2 justify-between items-center ${m.isBoss ? 'bg-amber-950/30 border-amber-500/30' : 'bg-slate-800/50 border-slate-700/50'}`}>
                      <div className="flex items-center gap-3 flex-1">
                        <span className="bg-slate-700 text-slate-400 text-xs px-1.5 py-0.5 rounded font-mono">{index + 1}</span>
                        <input type="text" value={m.name} onChange={(e) => updateMonster(m.id, 'name', e.target.value)} className="bg-transparent border-none text-sm font-bold text-slate-200 focus:ring-0 min-w-[80px] w-full max-w-[120px] placeholder-slate-600" placeholder="怪物名称"/>
                        
                        {/* Boss 开关按钮 */}
                        <button 
                          onClick={() => updateMonster(m.id, 'isBoss', !m.isBoss)}
                          className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold border transition-all ${
                            m.isBoss 
                              ? 'bg-amber-500 text-slate-900 border-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.3)]' 
                              : 'bg-slate-800 text-slate-500 border-slate-600 hover:border-slate-400'
                          }`}
                          title="切换BOSS状态"
                        >
                          <Crown className="w-3 h-3" fill={m.isBoss ? "currentColor" : "none"} />
                          {m.isBoss ? "BOSS" : "普通"}
                        </button>

                        {/* 多重攻击输入框 (仅 Boss 显示) */}
                        {m.isBoss && (
                          <div className="flex items-center gap-1 bg-slate-900/50 rounded border border-amber-500/30 px-2 py-0.5">
                            <Zap className="w-3 h-3 text-amber-400" />
                            <span className="text-[10px] text-amber-200 whitespace-nowrap">攻击:</span>
                            <input 
                              type="number" 
                              min="1"
                              value={m.attacksPerRound} 
                              onChange={(e) => updateMonster(m.id, 'attacksPerRound', Math.max(1, Number(e.target.value)))} 
                              className="w-8 bg-transparent text-center text-xs font-bold text-amber-400 outline-none border-b border-amber-500/50 focus:border-amber-400"
                            />
                            <span className="text-[10px] text-amber-200">次/轮</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                         <span className="text-xs text-slate-500 font-mono">DPR: <span className="text-red-400 font-bold">{calculateStats(m.attackBonus, targetPlayerAC, m.diceCount, m.diceType, m.damageMod, m.attacksPerRound, m.advantageState).dpr.toFixed(1)}</span></span>
                         {monsters.length > 1 && <button onClick={() => removeMonster(m.id)} className="text-slate-600 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>}
                      </div>
                    </div>

                    {/* 下方网格：伤害与命中配置 */}
                    <div className="p-3 grid grid-cols-4 gap-3">
                      <div className="col-span-1"><label className="block text-[10px] text-slate-500 uppercase font-bold mb-1">攻击加值</label><input type="number" value={m.attackBonus} onChange={(e) => updateMonster(m.id, 'attackBonus', Number(e.target.value))} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm outline-none focus:border-red-500" /></div>
                      <div className="col-span-2"><label className="block text-[10px] text-slate-500 uppercase font-bold mb-1">伤害骰 (数/面)</label><div className="flex gap-1"><input type="number" value={m.diceCount} onChange={(e) => updateMonster(m.id, 'diceCount', Math.max(1, Number(e.target.value)))} className="w-1/3 bg-slate-900 border border-slate-600 rounded px-1 py-1.5 text-center text-sm outline-none focus:border-red-500" /><select value={m.diceType} onChange={(e) => updateMonster(m.id, 'diceType', Number(e.target.value))} className="w-2/3 bg-slate-900 border border-slate-600 rounded px-1 py-1.5 text-sm outline-none focus:border-red-500 text-center"><option value="4">d4</option><option value="6">d6</option><option value="8">d8</option><option value="10">d10</option><option value="12">d12</option><option value="20">d20</option></select></div></div>
                      <div className="col-span-1"><label className="block text-[10px] text-slate-500 uppercase font-bold mb-1">固定伤害</label><input type="number" value={m.damageMod} onChange={(e) => updateMonster(m.id, 'damageMod', Number(e.target.value))} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm outline-none focus:border-red-500" /></div>
                      
                      {/* 第二行：占据全宽的优劣势选择 */}
                      <div className="col-span-4 mt-1 border-t border-slate-700/50 pt-2 flex items-center gap-2">
                        <label className="text-[10px] text-slate-500 uppercase font-bold">攻击状态:</label>
                        <div className="flex gap-2 flex-1">
                          <button onClick={() => updateMonster(m.id, 'advantageState', 'normal')} className={`flex-1 py-1 text-xs rounded border ${m.advantageState === 'normal' ? 'bg-slate-700 text-slate-200 border-slate-500' : 'bg-slate-900 text-slate-500 border-slate-700'}`}>正常</button>
                          <button onClick={() => updateMonster(m.id, 'advantageState', 'advantage')} className={`flex-1 py-1 text-xs rounded border ${m.advantageState === 'advantage' ? 'bg-green-900/40 text-green-400 border-green-600' : 'bg-slate-900 text-slate-500 border-slate-700'}`}>优势 (ADV)</button>
                          <button onClick={() => updateMonster(m.id, 'advantageState', 'disadvantage')} className={`flex-1 py-1 text-xs rounded border ${m.advantageState === 'disadvantage' ? 'bg-red-900/40 text-red-400 border-red-600' : 'bg-slate-900 text-slate-500 border-slate-700'}`}>劣势 (DIS)</button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 右侧结果区 */}
        <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-24">
          {mode === 'player_analysis' ? (
            <>
              <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl relative overflow-hidden group">
                 <div className="absolute -right-6 -top-6 bg-amber-500/10 w-32 h-32 rounded-full group-hover:bg-amber-500/20 transition-all blur-xl"></div>
                 <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2"><Users className="w-4 h-4" /> 队伍总输出 (DPR)</h3>
                 <div className="text-5xl font-bold text-amber-400 flex items-baseline gap-2 mb-2">{partyTotalDPR.toFixed(1)}<span className="text-sm text-slate-500 font-normal">伤害/轮</span></div>
                 <div className="text-sm text-slate-400">对阵 <span className="text-slate-200 font-bold">AC {monsterAC}</span> 的怪物</div>
              </div>
              <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-xl overflow-hidden">
                <div className="bg-amber-900/20 p-4 border-b border-slate-700 flex items-center gap-2"><Info className="text-amber-500 w-5 h-5"/><h3 className="font-bold text-slate-100">推荐怪物血量 (HP)</h3></div>
                <div className="p-4 space-y-3">
                   <div className="flex justify-between items-center p-3 bg-slate-900/50 rounded-lg border border-slate-700/50"><span className="text-sm text-slate-400">喽啰 (Minion)</span><span className="text-lg font-bold text-green-400">{Math.round(partyTotalDPR * 0.2)} - {Math.round(partyTotalDPR * 0.4)}</span></div>
                   <div className="flex justify-between items-center p-3 bg-slate-900/50 rounded-lg border border-slate-700/50"><span className="text-sm text-slate-400">标准怪 (Standard)</span><span className="text-lg font-bold text-amber-400">{Math.round(partyTotalDPR * 0.8)} - {Math.round(partyTotalDPR * 1.5)}</span></div>
                   <div className="flex justify-between items-center p-3 bg-slate-900/50 rounded-lg border border-slate-700/50"><span className="text-sm text-slate-400">首领 (Solo)</span><span className="text-lg font-bold text-red-400">{Math.round(partyTotalDPR * 3)} - {Math.round(partyTotalDPR * 6)}</span></div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl relative overflow-hidden group">
                 <div className="absolute -right-6 -top-6 bg-red-500/10 w-32 h-32 rounded-full group-hover:bg-red-500/20 transition-all blur-xl"></div>
                 <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2"><Skull className="w-4 h-4" /> 遭遇总威胁 (Encounter DPR)</h3>
                 <div className="text-5xl font-bold text-red-400 flex items-baseline gap-2 mb-2">{encounterStats.totalDPR.toFixed(1)}<span className="text-sm text-slate-500 font-normal">伤害/轮</span></div>
                 <div className="text-xs text-slate-500 mt-2 flex justify-between items-center">
                   <span>对Lv.{targetPlayerLevel}玩家 (约{targetPlayerHP} HP)</span>
                   <span className="bg-red-950 px-2 py-0.5 rounded text-red-300 border border-red-900">{monsters.length} 只怪物</span>
                 </div>
              </div>
               <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-xl overflow-hidden">
                  <div className="bg-red-900/20 p-4 border-b border-slate-700 flex items-center gap-2"><AlertTriangle className="text-red-500 w-5 h-5"/><h3 className="font-bold text-slate-100">威胁评估</h3></div>
                  <div className="p-5 space-y-6">
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-bold uppercase tracking-wider text-slate-400"><span>总伤害占玩家HP比例</span><span className="text-slate-200">{((encounterStats.totalDPR / targetPlayerHP) * 100).toFixed(0)}%</span></div>
                      <div className="h-4 bg-slate-700 rounded-full overflow-hidden relative"><div className={`absolute top-0 bottom-0 transition-all duration-500 ${ (encounterStats.totalDPR / targetPlayerHP) > 0.8 ? 'bg-red-600' : (encounterStats.totalDPR / targetPlayerHP) > 0.4 ? 'bg-amber-500' : 'bg-green-500'}`} style={{ width: `${Math.min(100, (encounterStats.totalDPR / targetPlayerHP) * 100)}%` }}></div></div>
                    </div>
                    
                    <div className="grid grid-cols-1 gap-3">
                       {/* 团灭风险分析 */}
                       <div className={`p-3 rounded border text-sm ${ encounterStats.totalDPR >= targetPlayerHP ? 'bg-red-950/30 border-red-500/30 text-red-200' : 'bg-slate-900 border-slate-700 text-slate-400'}`}>
                         <span className="font-bold block mb-1">压力测试:</span>
                         {encounterStats.totalDPR >= targetPlayerHP 
                           ? "💀 极度致命！怪物群一轮集火可秒杀一名玩家。" 
                           : encounterStats.totalDPR >= targetPlayerHP / 2
                           ? "⚠️ 高压。需要坦克职业或强力治疗来维持。"
                           : "✅ 安全。玩家可以轻松应对这群怪物。"}
                       </div>

                       {/* 单体秒杀检测 (BOSS检测) */}
                       <div className={`p-3 rounded border text-sm ${ encounterStats.highestMaxDamage >= targetPlayerHP ? 'bg-orange-950/30 border-orange-500/30 text-orange-200' : 'bg-green-950/30 border-green-500/30 text-green-200'}`}>
                         <span className="font-bold block mb-1 flex items-center gap-2">
                           {encounterStats.highestMaxDamage >= targetPlayerHP ? <Zap className="w-3 h-3"/> : <Shield className="w-3 h-3"/>}
                           一击必杀风险 ({encounterStats.bossName}):
                         </span>
                         {encounterStats.highestMaxDamage >= targetPlayerHP 
                           ? `警告！${encounterStats.bossName} 的单次爆发 (${encounterStats.highestMaxDamage}) 足以直接打倒满血玩家。` 
                           : `安全。场上爆发最高的 ${encounterStats.bossName} 无法一击秒杀玩家。`}
                       </div>
                    </div>
                  </div>
               </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};
export default DndCombatCalculator;