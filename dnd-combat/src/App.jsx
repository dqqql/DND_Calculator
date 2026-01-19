import React, { useState, useEffect } from 'react';
import { Sword, Shield, Skull, Info, AlertTriangle, User, Users, Plus, Trash2 } from 'lucide-react';

const DndCombatCalculator = () => {
  const [mode, setMode] = useState('player_analysis'); 

  // --- 玩家数据列表 ---
  const [players, setPlayers] = useState([
    { id: 1, name: '战士', attackBonus: 6, diceCount: 2, diceType: 6, damageMod: 4, attacksPerRound: 2, advantageState: 'normal', dpr: 0 }
  ]);
  const [monsterAC, setMonsterAC] = useState(15); 

  // --- 怪物数据 ---
  const [monsterStats, setMonsterStats] = useState({
    attackBonus: 5, diceCount: 1, diceType: 8, damageMod: 3, attacksPerRound: 2, advantageState: 'normal'
  });
  const [targetPlayerAC, setTargetPlayerAC] = useState(15); 
  const [targetPlayerLevel, setTargetPlayerLevel] = useState(3);
  const [targetPlayerHP, setTargetPlayerHP] = useState(25);

  // --- 计算结果 ---
  const [partyTotalDPR, setPartyTotalDPR] = useState(0);
  const [monsterResults, setMonsterResults] = useState({ hitChance: 0, dpr: 0, maxDamage: 0 });

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
    const maxDamage = attacks * ((diceCount * diceType) + damageMod); // 简化版最大爆发

    return { hitChance: finalHitChance, dpr, maxDamage };
  };

  // --- 实时计算 ---
  useEffect(() => {
    const total = players.reduce((acc, p) => {
      return acc + calculateStats(p.attackBonus, monsterAC, p.diceCount, p.diceType, p.damageMod, p.attacksPerRound, p.advantageState).dpr;
    }, 0);
    setPartyTotalDPR(total);
  }, [players, monsterAC]);

  useEffect(() => {
    const stats = calculateStats(monsterStats.attackBonus, targetPlayerAC, monsterStats.diceCount, monsterStats.diceType, monsterStats.damageMod, monsterStats.attacksPerRound, monsterStats.advantageState);
    setMonsterResults(stats);
    setTargetPlayerHP(10 + (targetPlayerLevel - 1) * 7); // 简单估算HP
  }, [monsterStats, targetPlayerAC, targetPlayerLevel]);

  // --- 操作函数 ---
  const updatePlayer = (id, field, value) => setPlayers(players.map(p => p.id === id ? { ...p, [field]: value } : p));
  const addPlayer = () => players.length < 6 && setPlayers([...players, { id: Date.now(), name: `玩家 ${players.length + 1}`, attackBonus: 5, diceCount: 1, diceType: 8, damageMod: 3, attacksPerRound: 1, advantageState: 'normal' }]);

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
                        {players.length > 1 && <button onClick={() => setPlayers(players.filter(x => x.id !== p.id))} className="text-slate-600 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>}
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
            <section className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-red-400"><Skull className="w-5 h-5" /> 怪物数据配置</h2>
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wider">攻击加值</label><input type="number" value={monsterStats.attackBonus} onChange={(e) => setMonsterStats({...monsterStats, attackBonus: Number(e.target.value)})} className="w-full bg-slate-900 border border-slate-600 rounded-lg py-2 px-3 text-red-400 font-bold outline-none focus:ring-1 focus:ring-red-500" /></div>
                  <div><label className="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wider flex items-center gap-1"><Shield className="w-3 h-3"/> 目标玩家 AC</label><input type="number" value={targetPlayerAC} onChange={(e) => setTargetPlayerAC(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-600 rounded-lg py-2 px-3 text-slate-200 font-bold outline-none focus:ring-1 focus:ring-red-500" /></div>
                </div>
                <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-700/50 space-y-4">
                  <div><label className="block text-xs font-medium text-slate-500 mb-2 uppercase tracking-wider">单次伤害公式</label><div className="flex items-center gap-2"><input type="number" value={monsterStats.diceCount} onChange={(e) => setMonsterStats({...monsterStats, diceCount: Number(e.target.value)})} className="w-16 bg-slate-800 border border-slate-600 rounded py-1.5 px-2 text-center outline-none" /><span className="font-bold text-slate-500">d</span><select value={monsterStats.diceType} onChange={(e) => setMonsterStats({...monsterStats, diceType: Number(e.target.value)})} className="bg-slate-800 border border-slate-600 rounded py-1.5 px-2 w-20 outline-none"><option value="4">4</option><option value="6">6</option><option value="8">8</option><option value="10">10</option><option value="12">12</option><option value="20">20</option></select><span className="font-bold text-slate-500">+</span><input type="number" value={monsterStats.damageMod} onChange={(e) => setMonsterStats({...monsterStats, damageMod: Number(e.target.value)})} className="w-16 bg-slate-800 border border-slate-600 rounded py-1.5 px-2 text-center outline-none" /></div></div>
                  <div className="grid grid-cols-2 gap-4"><div><label className="block text-xs font-medium text-slate-500 mb-1 uppercase tracking-wider">攻击次数 / 轮</label><input type="number" value={monsterStats.attacksPerRound} onChange={(e) => setMonsterStats({...monsterStats, attacksPerRound: Number(e.target.value)})} className="w-full bg-slate-800 border border-slate-600 rounded py-1.5 px-2 outline-none" /></div><div><label className="block text-xs font-medium text-slate-500 mb-1 uppercase tracking-wider">优势状态</label><select value={monsterStats.advantageState} onChange={(e) => setMonsterStats({...monsterStats, advantageState: e.target.value})} className="w-full bg-slate-800 border border-slate-600 rounded py-1.5 px-2 text-sm outline-none"><option value="normal">正常</option><option value="advantage">优势</option><option value="disadvantage">劣势</option></select></div></div>
                </div>
                <div className="pt-4 border-t border-slate-700"><label className="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wider flex items-center gap-2"><User className="w-3 h-3" /> 目标玩家等级</label><div className="flex gap-4"><input type="number" value={targetPlayerLevel} onChange={(e) => setTargetPlayerLevel(Math.max(1, Number(e.target.value)))} className="w-20 bg-slate-900 border border-slate-600 rounded-lg py-2 px-3 outline-none focus:ring-1 focus:ring-red-500" /><div className="flex-1 bg-slate-900 rounded-lg border border-slate-700 flex items-center px-3 text-sm text-slate-400">预估 HP: <span className="text-white font-bold ml-2">{targetPlayerHP}</span></div></div></div>
              </div>
            </section>
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
                 <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2"><Skull className="w-4 h-4" /> 怪物输出 (DPR)</h3>
                 <div className="text-5xl font-bold text-red-400 flex items-baseline gap-2 mb-2">{monsterResults.dpr.toFixed(1)}<span className="text-sm text-slate-500 font-normal">伤害/轮</span></div>
                 <div className="text-xs text-slate-500 mt-2 flex justify-between"><span>命中率: {(monsterResults.hitChance * 100).toFixed(0)}%</span><span>最大爆发: {monsterResults.maxDamage}</span></div>
              </div>
               <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-xl overflow-hidden">
                  <div className="bg-red-900/20 p-4 border-b border-slate-700 flex items-center gap-2"><AlertTriangle className="text-red-500 w-5 h-5"/><h3 className="font-bold text-slate-100">威胁评估</h3></div>
                  <div className="p-5 space-y-6">
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-bold uppercase tracking-wider text-slate-400"><span>占玩家HP比例</span><span className="text-slate-200">{((monsterResults.dpr / targetPlayerHP) * 100).toFixed(0)}%</span></div>
                      <div className="h-4 bg-slate-700 rounded-full overflow-hidden relative"><div className={`absolute top-0 bottom-0 transition-all duration-500 ${ (monsterResults.dpr / targetPlayerHP) > 0.5 ? 'bg-red-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, (monsterResults.dpr / targetPlayerHP) * 100)}%` }}></div></div>
                    </div>
                    <div className={`p-3 rounded border text-sm ${ monsterResults.maxDamage >= targetPlayerHP ? 'bg-red-950/30 border-red-500/30 text-red-200' : 'bg-green-950/30 border-green-500/30 text-green-200'}`}><span className="font-bold block mb-1">秒杀风险:</span>{monsterResults.maxDamage >= targetPlayerHP ? "高危！怪物最大伤害可能直接秒杀满血玩家。" : "安全。怪物无法一击秒杀玩家。"}</div>
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