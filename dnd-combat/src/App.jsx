import React, { useState, useEffect, useRef } from 'react';
import { Sword, Shield, Skull, Info, AlertTriangle, Users, Plus, Trash2, Zap, Crown, Calculator, X, Save, Upload, Link as LinkIcon, Unlink, Server, PlayCircle, Loader2, Target } from 'lucide-react';

// --- 核心算法 (本地纯函数) ---
const calculateStats = (params, targetStats) => {
  const { 
    attackType, attackBonus, saveDC, halfOnSave, 
    diceCount, diceType, damageMod, attacksPerRound, advantageState 
  } = params;
  
  const { ac, saveBonus } = targetStats;

  let hitChance = 0;
  let critChance = 0;

  if (attackType === 'attack') {
    const neededRoll = ac - attackBonus;
    let rawHitChance = Math.max(0.05, Math.min(0.95, (21 - neededRoll) / 20));
    hitChance = rawHitChance;
    if (advantageState === 'advantage') hitChance = 1 - Math.pow(1 - rawHitChance, 2);
    else if (advantageState === 'disadvantage') hitChance = Math.pow(rawHitChance, 2);
    critChance = advantageState === 'advantage' ? 0.0975 : (advantageState === 'disadvantage' ? 0.0025 : 0.05);
  } else {
    const rawSaveChance = Math.min(1.0, Math.max(0.0, (21 + (saveBonus || 0) - saveDC) / 20));
    const failChance = 1 - rawSaveChance;
    critChance = 0;
    hitChance = halfOnSave ? failChance + (rawSaveChance * 0.5) : failChance;
  }

  const diceAvg = diceCount * ((diceType + 1) / 2);
  const dpr = ((hitChance * (diceAvg + damageMod)) + (critChance * diceAvg)) * attacksPerRound;
  const maxDamage = ((diceCount * diceType) + damageMod); 

  return { dpr, maxDamage };
};

// --- 单体模拟结果弹窗 ---
const SimulationModal = ({ onClose, simData }) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [iterations, setIterations] = useState(100000);

  const runSimulation = async () => {
    setLoading(true); setError(null); setResult(null);
    try {
      const response = await fetch('http://127.0.0.1:5000/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...simData, iterations }),
      });
      if (!response.ok) throw new Error('无法连接到 Python 后端');
      const data = await response.json();
      setResult(data);
    } catch (err) { setError("连接失败：请确保 dnd_monte_carlo.py 已运行"); } finally { setLoading(false); }
  };

  useEffect(() => { runSimulation(); }, []);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-slate-800 rounded-xl border border-slate-600 shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-slate-900 p-4 border-b border-slate-700 flex justify-between items-center">
          <h3 className="text-purple-400 font-bold flex items-center gap-2"><Server className="w-5 h-5"/> 单体伤害模拟</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5"/></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="text-xs text-slate-400 bg-slate-900/50 p-2 rounded border border-slate-700/50 flex justify-between">
            <span>攻击 +{simData.attackBonus} vs AC {simData.targetAC}</span>
            <span>{simData.diceCount}d{simData.diceType}+{simData.damageMod}</span>
          </div>
          <div className="flex items-center gap-2 justify-center py-2">
             <label className="text-xs text-slate-400">模拟次数:</label>
             <select value={iterations} onChange={e => setIterations(Number(e.target.value))} className="bg-slate-900 border border-slate-600 rounded text-xs p-1 outline-none text-slate-200">
               <option value="10000">1万次</option>
               <option value="100000">10万次</option>
             </select>
             <button onClick={runSimulation} disabled={loading} className="bg-purple-600 hover:bg-purple-500 text-white text-xs px-3 py-1 rounded flex items-center gap-1 transition-colors">{loading ? <Loader2 className="w-3 h-3 animate-spin"/> : <PlayCircle className="w-3 h-3"/>} 重新运行</button>
          </div>
          {error && <div className="bg-red-900/20 border border-red-500/50 text-red-200 p-3 rounded text-sm text-center">{error}</div>}
          {result && (
            <div className="grid grid-cols-2 gap-3 animate-in fade-in zoom-in duration-300">
              <div className="bg-slate-700/50 p-3 rounded border border-slate-600 text-center col-span-2">
                <div className="text-slate-400 text-xs uppercase font-bold mb-1">期望伤害 (DPR)</div>
                <div className="text-4xl font-bold text-purple-400">{result.avg_damage.toFixed(2)}</div>
              </div>
              <div className="bg-slate-700/50 p-3 rounded border border-slate-600 text-center"><div className="text-slate-400 text-xs uppercase font-bold mb-1">命中率</div><div className="text-xl font-bold text-green-400">{result.hit_rate.toFixed(1)}%</div></div>
              <div className="bg-slate-700/50 p-3 rounded border border-slate-600 text-center"><div className="text-slate-400 text-xs uppercase font-bold mb-1">暴击率</div><div className="text-xl font-bold text-amber-400">{result.crit_rate.toFixed(2)}%</div></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// --- 团战模拟结果弹窗 (新) ---
const EncounterSimModal = ({ onClose, teamA, teamB, statsA, statsB }) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const runSimulation = async () => {
    setLoading(true); setError(null); setResult(null);
    
    // 注入对手的防御数据，以便 Python 后端使用
    // 注意：Python后端使用的是简化逻辑，即假设怪物打玩家时，所有玩家防御值取平均
    // 实际上更复杂的模拟需要每个怪打特定人，这里我们把平均值注入到每个单位里传过去
    const enrichedTeamA = teamA.map(u => ({ ...u, ac: statsA.ac, saveBonus: statsA.saveBonus }));
    const enrichedTeamB = teamB.map(u => ({ ...u, ac: statsB.ac, saveBonus: statsB.saveBonus }));

    try {
      const response = await fetch('http://127.0.0.1:5000/api/simulate-encounter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamA: enrichedTeamA, teamB: enrichedTeamB }),
      });
      if (!response.ok) throw new Error('无法连接到 Python 后端');
      const data = await response.json();
      setResult(data);
    } catch (err) { setError("连接失败：请确保 dnd_monte_carlo.py 已运行"); } finally { setLoading(false); }
  };

  useEffect(() => { runSimulation(); }, []);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-slate-800 rounded-xl border border-slate-600 shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="bg-slate-900 p-4 border-b border-slate-700 flex justify-between items-center">
          <h3 className="text-indigo-400 font-bold flex items-center gap-2"><Target className="w-5 h-5"/> 全局战役模拟 (10,000次)</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5"/></button>
        </div>
        <div className="p-6 space-y-6">
          <div className="flex justify-between items-center px-4">
             <div className="text-center">
               <div className="text-xl font-bold text-amber-400">玩家队伍</div>
               <div className="text-xs text-slate-500">{teamA.length} 人 (HP {statsA.totalHP})</div>
             </div>
             <div className="text-slate-600 font-bold">VS</div>
             <div className="text-center">
               <div className="text-xl font-bold text-red-400">怪物遭遇</div>
               <div className="text-xs text-slate-500">{teamB.length} 只 (HP {statsB.totalHP})</div>
             </div>
          </div>

          {loading && <div className="py-8 flex justify-center text-indigo-400"><Loader2 className="w-8 h-8 animate-spin"/></div>}
          {error && <div className="bg-red-900/20 border border-red-500/50 text-red-200 p-3 rounded text-sm text-center">{error}</div>}
          
          {result && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-700 text-center relative overflow-hidden">
                {/* 胜率进度条背景 */}
                <div className="absolute top-0 bottom-0 left-0 bg-amber-500/10 transition-all duration-1000" style={{width: `${result.win_rate}%`}}></div>
                
                <div className="relative z-10">
                  <div className="text-sm text-slate-400 font-bold uppercase tracking-wider mb-2">玩家胜率 (Win Rate)</div>
                  <div className={`text-5xl font-black ${result.win_rate > 80 ? 'text-green-400' : result.win_rate > 50 ? 'text-amber-400' : 'text-red-500'}`}>
                    {result.win_rate.toFixed(1)}%
                  </div>
                  <div className="text-xs text-slate-500 mt-2">模拟耗时: {result.duration.toFixed(3)}s</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <div className="bg-slate-700/30 p-3 rounded border border-slate-600 text-center">
                   <div className="text-xs text-slate-400 mb-1">平均战斗时长</div>
                   <div className="text-xl font-bold text-white">{result.avg_rounds.toFixed(1)} <span className="text-sm font-normal text-slate-500">轮</span></div>
                 </div>
                 <div className="bg-slate-700/30 p-3 rounded border border-slate-600 text-center">
                   <div className="text-xs text-slate-400 mb-1">团灭风险</div>
                   <div className={`text-xl font-bold ${(100 - result.win_rate) > 50 ? 'text-red-400' : 'text-green-400'}`}>{(100 - result.win_rate).toFixed(1)}%</div>
                 </div>
              </div>
              
              <div className="flex justify-center">
                <button onClick={runSimulation} className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"><PlayCircle className="w-3 h-3"/> 再次模拟</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// --- 骰子计算器组件 (不变) ---
const DiceCalculator = ({ onClose }) => {
  const [dCount, setDCount] = useState(1);
  const [dType, setDType] = useState(8);
  const [dMod, setDMod] = useState(0);
  const avg = (dCount * (dType + 1) / 2) + dMod;
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="bg-slate-900 p-4 border-b border-slate-700 flex justify-between items-center">
          <h3 className="text-amber-400 font-bold flex items-center gap-2"><Calculator className="w-5 h-5"/> 骰子均值计算器</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5"/></button>
        </div>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-center gap-2">
            <input type="number" min="1" value={dCount} onChange={e=>setDCount(Number(e.target.value))} className="w-16 bg-slate-900 border border-slate-600 rounded p-2 text-center text-lg font-bold outline-none focus:border-amber-500"/>
            <span className="text-slate-500 font-bold">d</span>
            <select value={dType} onChange={e=>setDType(Number(e.target.value))} className="bg-slate-900 border border-slate-600 rounded p-2 text-lg font-bold outline-none focus:border-amber-500">{[4,6,8,10,12,20,100].map(d => <option key={d} value={d}>{d}</option>)}</select>
            <span className="text-slate-500 font-bold">+</span>
            <input type="number" value={dMod} onChange={e=>setDMod(Number(e.target.value))} className="w-16 bg-slate-900 border border-slate-600 rounded p-2 text-center text-lg font-bold outline-none focus:border-amber-500"/>
          </div>
          <div className="text-center p-4 bg-slate-900/50 rounded-lg border border-slate-700">
            <div className="text-slate-400 text-sm uppercase font-bold mb-1">平均值 (Average)</div>
            <div className="text-4xl font-bold text-white">{avg.toFixed(1)}</div>
            <div className="text-xs text-slate-500 mt-2">范围: {dCount + dMod} - {(dCount * dType) + dMod}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- UnitCard (不变) ---
const UnitCard = ({ item, index, isMonster, updateFunc, removeFunc, showDelete, targetStats, onSimulate }) => {
  return (
    <div className={`bg-slate-800 rounded-xl border overflow-hidden shadow-sm hover:shadow-md transition-all relative ${item.isBoss ? 'border-amber-500/50 shadow-amber-900/20' : 'border-slate-700'}`}>
      {item.attacksPerRound > 1 && item.isBoss && <div className="absolute top-0 right-0 bg-red-900/50 text-red-300 text-[10px] font-bold px-2 py-1 rounded-bl-lg border-l border-b border-red-800 flex items-center gap-1 z-10"><Zap className="w-3 h-3" /> x{item.attacksPerRound}</div>}
      <div className={`p-3 border-b flex flex-wrap gap-2 justify-between items-center ${item.isBoss ? 'bg-amber-950/30 border-amber-500/30' : 'bg-slate-800/50 border-slate-700/50'}`}>
        <div className="flex items-center gap-3 flex-1 min-w-[200px]">
          <span className="bg-slate-700 text-slate-400 text-xs px-1.5 py-0.5 rounded font-mono">{index + 1}</span>
          <input type="text" value={item.name} onChange={(e) => updateFunc(item.id, 'name', e.target.value)} className="bg-transparent border-none text-sm font-bold text-slate-200 focus:ring-0 w-24 placeholder-slate-600" />
          {isMonster && <button onClick={() => updateFunc(item.id, 'isBoss', !item.isBoss)} className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold border transition-all ${item.isBoss ? 'bg-amber-500 text-slate-900 border-amber-400' : 'bg-slate-800 text-slate-500 border-slate-600'}`}><Crown className="w-3 h-3" fill={item.isBoss ? "currentColor" : "none"} /> {item.isBoss ? "BOSS" : "普通"}</button>}
          <div className="flex bg-slate-900 rounded p-0.5 border border-slate-700">
            <button onClick={() => updateFunc(item.id, 'attackType', 'attack')} className={`px-2 py-0.5 text-[10px] rounded ${item.attackType === 'attack' ? 'bg-slate-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}>物理</button>
            <button onClick={() => updateFunc(item.id, 'attackType', 'save')} className={`px-2 py-0.5 text-[10px] rounded ${item.attackType === 'save' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}>法术</button>
          </div>
        </div>
        <div className="flex items-center gap-3">
           <div className="text-xs text-slate-500 font-mono flex items-center gap-2">
             <span>DPR: <span className={`${isMonster ? 'text-red-400' : 'text-amber-400'} font-bold`}>{calculateStats(item, targetStats).dpr.toFixed(1)}</span></span>
             {item.attackType === 'attack' && <button onClick={() => onSimulate(item, targetStats)} className="bg-purple-900/50 hover:bg-purple-700 text-purple-200 border border-purple-800 p-1 rounded" title="单体蒙特卡洛验证"><Server className="w-3 h-3" /></button>}
           </div>
           {showDelete && <button onClick={() => removeFunc(item.id)} className="text-slate-600 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>}
        </div>
      </div>
      <div className="p-3 space-y-3">
        <div className="grid grid-cols-3 gap-2 bg-slate-900/50 p-2 rounded border border-slate-700/50">
          <div className="flex items-center gap-1"><Shield className="w-3 h-3 text-slate-500"/><label className="text-[10px] text-slate-400">AC</label><input type="number" value={item.ac || 10} onChange={(e) => updateFunc(item.id, 'ac', Number(e.target.value))} className="w-full bg-transparent border-b border-slate-600 text-center text-xs font-bold text-slate-300 focus:border-slate-400 outline-none"/></div>
          <div className="flex items-center gap-1 border-l border-slate-700 pl-2"><div className="text-[10px] text-slate-400 font-bold">HP</div><input type="number" value={item.hp || 10} onChange={(e) => updateFunc(item.id, 'hp', Number(e.target.value))} className="w-full bg-transparent border-b border-slate-600 text-center text-xs font-bold text-slate-300 focus:border-slate-400 outline-none"/></div>
          <div className="flex items-center gap-1 border-l border-slate-700 pl-2"><div className="text-[10px] text-slate-400">Save+</div><input type="number" value={item.saveBonus || 0} onChange={(e) => updateFunc(item.id, 'saveBonus', Number(e.target.value))} className="w-full bg-transparent border-b border-slate-600 text-center text-xs font-bold text-slate-300 focus:border-slate-400 outline-none"/></div>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <div className="col-span-1"><label className="block text-[10px] text-slate-500 uppercase font-bold mb-1">{item.attackType === 'attack' ? '命中加值' : '法术 DC'}</label>{item.attackType === 'attack' ? (<input type="number" value={item.attackBonus} onChange={(e) => updateFunc(item.id, 'attackBonus', Number(e.target.value))} className={`w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm outline-none focus:border-${isMonster ? 'red' : 'amber'}-500`} />) : (<input type="number" value={item.saveDC} onChange={(e) => updateFunc(item.id, 'saveDC', Number(e.target.value))} className="w-full bg-indigo-900/30 border border-indigo-500/50 text-indigo-200 rounded px-2 py-1.5 text-sm outline-none focus:border-indigo-500" />)}</div>
          <div className="col-span-2"><label className="block text-[10px] text-slate-500 uppercase font-bold mb-1">伤害骰</label><div className="flex gap-1"><input type="number" min="1" value={item.diceCount} onChange={(e) => updateFunc(item.id, 'diceCount', Math.max(1, Number(e.target.value)))} className={`w-1/3 bg-slate-900 border border-slate-600 rounded px-1 py-1.5 text-center text-sm outline-none focus:border-${isMonster ? 'red' : 'amber'}-500`} /><select value={item.diceType} onChange={(e) => updateFunc(item.id, 'diceType', Number(e.target.value))} className={`w-2/3 bg-slate-900 border border-slate-600 rounded px-1 py-1.5 text-sm outline-none focus:border-${isMonster ? 'red' : 'amber'}-500 text-center`}><option value="4">d4</option><option value="6">d6</option><option value="8">d8</option><option value="10">d10</option><option value="12">d12</option><option value="20">d20</option></select></div></div>
          <div className="col-span-1"><label className="block text-[10px] text-slate-500 uppercase font-bold mb-1">固定伤</label><input type="number" value={item.damageMod} onChange={(e) => updateFunc(item.id, 'damageMod', Number(e.target.value))} className={`w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm outline-none focus:border-${isMonster ? 'red' : 'amber'}-500`} /></div>
        </div>
        <div className="border-t border-slate-700/50 pt-2 flex items-center gap-3">
          <div className="flex-1">
            {item.attackType === 'attack' ? (
              <div className="flex gap-1">
                {['normal', 'advantage', 'disadvantage'].map(state => (<button key={state} onClick={() => updateFunc(item.id, 'advantageState', state)} className={`flex-1 py-1 text-[10px] rounded border ${item.advantageState === state ? (state === 'normal' ? 'bg-slate-700 border-slate-500' : state === 'advantage' ? 'bg-green-900/40 text-green-400 border-green-600' : 'bg-red-900/40 text-red-400 border-red-600') : 'bg-slate-900 text-slate-500 border-slate-700'}`}>{state === 'normal' ? '正常' : state === 'advantage' ? '优势' : '劣势'}</button>))}
              </div>
            ) : (<label className="flex items-center gap-2 cursor-pointer select-none"><input type="checkbox" checked={item.halfOnSave} onChange={(e) => updateFunc(item.id, 'halfOnSave', e.target.checked)} className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-indigo-500 focus:ring-indigo-500"/><span className="text-xs text-indigo-200">豁免成功半伤</span></label>)}
          </div>
          {(!isMonster || item.isBoss) && <div className="flex items-center gap-1 bg-slate-900/50 rounded border border-slate-600 px-2 py-0.5"><span className="text-[10px] text-slate-400">{item.attackType === 'attack' ? '攻击' : '施法'}:</span><input type="number" min="1" value={item.attacksPerRound} onChange={(e) => updateFunc(item.id, 'attacksPerRound', Math.max(1, Number(e.target.value)))} className="w-8 bg-transparent text-center text-xs font-bold text-white outline-none border-b border-slate-500 focus:border-white" /></div>}
        </div>
      </div>
    </div>
  );
};

const DndCombatCalculator = () => {
  const [mode, setMode] = useState('player_analysis');
  const [showDiceTool, setShowDiceTool] = useState(false);
  
  // 弹窗状态
  const [showSimModal, setShowSimModal] = useState(false);
  const [simData, setSimData] = useState(null); // 单体模拟数据
  const [showEncounterModal, setShowEncounterModal] = useState(false); // 团战模拟弹窗
  
  const [isLinked, setIsLinked] = useState(false);

  const [players, setPlayers] = useState([
    { 
      id: 1, name: '战士', 
      attackType: 'attack', attackBonus: 7, saveDC: 15, halfOnSave: true,
      diceCount: 2, diceType: 6, damageMod: 4, attacksPerRound: 2, advantageState: 'normal',
      ac: 16, hp: 35, saveBonus: 2
    }
  ]);
  
  const [manualMonsterAC, setManualMonsterAC] = useState(15);
  const [manualMonsterSaveBonus, setManualMonsterSaveBonus] = useState(2);

  const [monsters, setMonsters] = useState([
    { 
      id: 1, name: '地精首领', 
      attackType: 'attack', attackBonus: 5, saveDC: 13, halfOnSave: false,
      diceCount: 1, diceType: 8, damageMod: 3, attacksPerRound: 2, advantageState: 'normal', isBoss: true,
      ac: 15, hp: 45, saveBonus: 1
    }
  ]);

  const [manualTargetPlayerAC, setManualTargetPlayerAC] = useState(15);
  const [manualTargetPlayerHP, setManualTargetPlayerHP] = useState(25);

  const [activeMonsterStats, setActiveMonsterStats] = useState({ ac: 15, saveBonus: 2, totalHP: 45 });
  const [activePlayerStats, setActivePlayerStats] = useState({ ac: 15, saveBonus: 0, totalHP: 25 });

  const [partyTotalDPR, setPartyTotalDPR] = useState(0);
  const [encounterStats, setEncounterStats] = useState({ totalDPR: 0, highestMaxDamage: 0, bossName: '' });

  const fileInputRef = useRef(null);

  const handleOpenSim = (item, targetStats) => {
    setSimData({
      attackBonus: item.attackBonus,
      targetAC: targetStats.ac,
      diceCount: item.diceCount,
      diceType: item.diceType,
      damageMod: item.damageMod,
      attacksPerRound: item.attacksPerRound,
      advantageState: item.advantageState
    });
    setShowSimModal(true);
  };

  const handleSave = () => {
    const data = { players, monsters, isLinked, timestamp: Date.now() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dnd-combat-save-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLoad = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (data.players) setPlayers(data.players);
        if (data.monsters) setMonsters(data.monsters);
        if (data.isLinked !== undefined) setIsLinked(data.isLinked);
      } catch (err) {
        alert('文件格式错误');
      }
    };
    reader.readAsText(file);
  };

  useEffect(() => {
    const pAC = players.reduce((sum, p) => sum + (p.ac || 10), 0) / players.length;
    const pSave = players.reduce((sum, p) => sum + (p.saveBonus || 0), 0) / players.length;
    const pTotalHP = players.reduce((sum, p) => sum + (p.hp || 10), 0);
    
    const mAC = monsters.reduce((sum, m) => sum + (m.ac || 10), 0) / monsters.length;
    const mSave = monsters.reduce((sum, m) => sum + (m.saveBonus || 0), 0) / monsters.length;
    const mTotalHP = monsters.reduce((sum, m) => sum + (m.hp || 10), 0);

    const currentMonsterTarget = isLinked 
      ? { ac: Math.round(mAC), saveBonus: Math.round(mSave), totalHP: mTotalHP } 
      : { ac: manualMonsterAC, saveBonus: manualMonsterSaveBonus, totalHP: 0 }; 

    const currentPlayerTarget = isLinked
      ? { ac: Math.round(pAC), saveBonus: Math.round(pSave), totalHP: pTotalHP }
      : { ac: manualTargetPlayerAC, saveBonus: 0, totalHP: manualTargetPlayerHP };

    setActiveMonsterStats(currentMonsterTarget);
    setActivePlayerStats(currentPlayerTarget);

    const pTotalDPR = players.reduce((acc, p) => acc + calculateStats(p, currentMonsterTarget).dpr, 0);
    setPartyTotalDPR(pTotalDPR);

    let mTotalDPR = 0;
    let highestMax = 0;
    let boss = '';
    monsters.forEach(m => {
      const stats = calculateStats(m, currentPlayerTarget);
      mTotalDPR += stats.dpr;
      if (stats.maxDamage > highestMax) {
        highestMax = stats.maxDamage;
        boss = m.name;
      }
    });
    setEncounterStats({ totalDPR: mTotalDPR, highestMaxDamage: highestMax, bossName: boss });

  }, [players, monsters, isLinked, manualMonsterAC, manualMonsterSaveBonus, manualTargetPlayerAC, manualTargetPlayerHP]);

  const updateItem = (setFunc, list, id, field, value) => {
    setFunc(list.map(item => {
      if (item.id !== id) return item;
      if (field === 'isBoss' && value === false) return { ...item, [field]: value, attacksPerRound: 1 };
      if (field === 'attackType') {
        return { ...item, [field]: value, ...(value === 'save' ? { saveDC: 13 } : { attackBonus: 5 }) }; 
      }
      return { ...item, [field]: value };
    }));
  };

  const addItem = (setFunc, list, prefix, defaultType) => {
    if (list.length >= 8) return;
    
    let newItem = { 
      id: Date.now(), name: `${prefix} ${list.length + 1}`, 
      attackType: defaultType, attackBonus: 5, saveDC: 13, halfOnSave: false,
      diceCount: 1, diceType: 8, damageMod: 3, attacksPerRound: 1, advantageState: 'normal',
      ac: 13, hp: 30, saveBonus: 2 
    };

    if (prefix === '怪物' && list.length > 0) {
      const prototype = list[0];
      newItem = {
        ...prototype,
        id: Date.now(),
        name: `${prefix} ${list.length + 1}`,
        isBoss: false, 
        attacksPerRound: 1 
      };
    }

    setFunc([...list, newItem]);
  };

  const removeItem = (setFunc, list, id) => list.length > 1 && setFunc(list.filter(i => i.id !== id));

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans pb-10">
      {/* 各种弹窗 */}
      {showDiceTool && <DiceCalculator onClose={() => setShowDiceTool(false)} />}
      {showSimModal && simData && <SimulationModal simData={simData} onClose={() => setShowSimModal(false)} />}
      {showEncounterModal && <EncounterSimModal onClose={() => setShowEncounterModal(false)} teamA={players} teamB={monsters} statsA={activePlayerStats} statsB={activeMonsterStats} />}
      
      <input type="file" ref={fileInputRef} onChange={handleLoad} className="hidden" accept=".json" />

      {/* 顶部导航 */}
      <header className="bg-slate-950 border-b border-slate-800 p-4 sticky top-0 z-20 shadow-lg backdrop-blur-md bg-opacity-90">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-amber-600 to-amber-700 rounded-lg shadow-inner"><Sword className="w-6 h-6 text-white" /></div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-amber-200 to-amber-500 bg-clip-text text-transparent">D&D 5e 战斗模拟器</h1>
              <p className="text-xs text-slate-500 font-medium tracking-wide">DM 工具箱 & 遭遇平衡器</p>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            {/* 存档按钮 */}
            <div className="flex bg-slate-800 p-1 rounded-lg shadow-inner mr-2">
              <button onClick={handleSave} className="p-2 text-slate-400 hover:text-white transition-colors" title="保存配置"><Save className="w-5 h-5"/></button>
              <div className="w-px bg-slate-700 my-1"></div>
              <button onClick={() => fileInputRef.current.click()} className="p-2 text-slate-400 hover:text-white transition-colors" title="读取配置"><Upload className="w-5 h-5"/></button>
            </div>

            <div className="flex bg-slate-800 p-1 rounded-lg shadow-inner">
              <button onClick={() => setMode('player_analysis')} className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${mode === 'player_analysis' ? 'bg-amber-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}><Users className="w-4 h-4" />分析队伍</button>
              <button onClick={() => setMode('monster_analysis')} className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${mode === 'monster_analysis' ? 'bg-red-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}><Skull className="w-4 h-4" />分析怪物</button>
            </div>
            <button onClick={() => setShowDiceTool(true)} className="bg-slate-800 p-2 rounded-lg text-amber-400 border border-slate-700 hover:border-amber-500 transition-all" title="骰子计算器"><Calculator className="w-6 h-6"/></button>
          </div>
        </div>
      </header>

      {/* 联动开关提示栏 */}
      <div className={`border-b px-4 py-2 text-center text-xs font-bold transition-colors cursor-pointer flex justify-center items-center gap-2 ${isLinked ? 'bg-indigo-900/50 border-indigo-700 text-indigo-200' : 'bg-slate-900 border-slate-800 text-slate-500 hover:bg-slate-800'}`} onClick={() => setIsLinked(!isLinked)}>
        {isLinked ? <LinkIcon className="w-3 h-3" /> : <Unlink className="w-3 h-3" />}
        {isLinked ? "数据联动已开启：正在使用对面队伍的真实数值进行对抗计算" : "数据联动已关闭：使用下方手动输入的假人数值进行计算 (点击开启联动)"}
      </div>

      <main className="max-w-6xl mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* 左侧输入区 */}
        <div className="lg:col-span-7 space-y-6">
          {mode === 'player_analysis' ? (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-end gap-4">
                <h2 className="text-lg font-semibold flex items-center gap-2 text-amber-400"><Users className="w-5 h-5" /> 玩家队伍配置</h2>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {/* 全局设置 */}
                  <div className={`p-2 rounded-lg border flex items-center gap-3 shadow-sm transition-all ${isLinked ? 'bg-indigo-900/20 border-indigo-500/30 opacity-80' : 'bg-slate-800 border-slate-700'}`}>
                    <div className="flex items-center gap-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">目标AC</label>
                      {isLinked ? (
                        <span className="w-12 text-center text-indigo-300 font-bold font-mono">{activeMonsterStats.ac}</span>
                      ) : (
                        <input type="number" value={manualMonsterAC} onChange={(e) => setManualMonsterAC(Number(e.target.value))} className="w-12 bg-slate-900 border border-slate-600 rounded px-1 py-0.5 text-center text-amber-400 font-bold outline-none focus:border-amber-500" />
                      )}
                    </div>
                    <div className="w-px h-6 bg-slate-700"></div>
                    <div className="flex items-center gap-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">目标豁免</label>
                      {isLinked ? (
                        <span className="w-12 text-center text-indigo-300 font-bold font-mono">+{activeMonsterStats.saveBonus}</span>
                      ) : (
                        <input type="number" value={manualMonsterSaveBonus} onChange={(e) => setManualMonsterSaveBonus(Number(e.target.value))} className="w-12 bg-slate-900 border border-slate-600 rounded px-1 py-0.5 text-center text-indigo-400 font-bold outline-none focus:border-indigo-500" />
                      )}
                    </div>
                  </div>
                  <button onClick={() => addItem(setPlayers, players, '玩家', 'save')} className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-amber-400 px-3 py-2 rounded-lg text-xs font-bold transition-all border border-slate-700"><Plus className="w-4 h-4" /> 添加</button>
                </div>
              </div>
              <div className="space-y-3">
                {players.map((p, index) => (
                  <UnitCard key={p.id} item={p} index={index} isMonster={false} updateFunc={(id, f, v) => updateItem(setPlayers, players, id, f, v)} removeFunc={(id) => removeItem(setPlayers, players, id)} showDelete={players.length > 1} targetStats={activeMonsterStats} onSimulate={handleOpenSim} />
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-end gap-4">
                <h2 className="text-lg font-semibold flex items-center gap-2 text-red-400"><Skull className="w-5 h-5" /> 怪物遭遇配置</h2>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <div className={`p-2 rounded-lg border flex items-center gap-3 shadow-sm transition-all ${isLinked ? 'bg-indigo-900/20 border-indigo-500/30 opacity-80' : 'bg-slate-800 border-slate-700'}`}>
                    <div className="flex items-center gap-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">玩家AC</label>
                      {isLinked ? (
                        <span className="w-12 text-center text-indigo-300 font-bold font-mono">{activePlayerStats.ac}</span>
                      ) : (
                        <input type="number" value={manualTargetPlayerAC} onChange={(e) => setManualTargetPlayerAC(Number(e.target.value))} className="w-12 bg-slate-900 border border-slate-600 rounded px-1 py-0.5 text-center text-slate-200 font-bold outline-none focus:border-red-500" />
                      )}
                    </div>
                    <div className="w-px h-6 bg-slate-700"></div>
                     <div className="flex items-center gap-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">玩家HP</label>
                      {isLinked ? (
                        <span className="w-12 text-center text-indigo-300 font-bold font-mono">{activePlayerStats.totalHP}</span>
                      ) : (
                        <input type="number" value={manualTargetPlayerHP} onChange={(e) => setManualTargetPlayerHP(Math.max(1, Number(e.target.value)))} className="w-12 bg-slate-900 border border-slate-600 rounded px-1 py-0.5 text-center text-slate-200 font-bold outline-none focus:border-red-500" />
                      )}
                    </div>
                  </div>
                  <button onClick={() => addItem(setMonsters, monsters, '怪物', 'attack')} className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-red-400 px-3 py-2 rounded-lg text-xs font-bold transition-all border border-slate-700"><Plus className="w-4 h-4" /> 添加</button>
                </div>
              </div>
              <div className="space-y-3">
                {monsters.map((m, index) => (
                  <UnitCard key={m.id} item={m} index={index} isMonster={true} updateFunc={(id, f, v) => updateItem(setMonsters, monsters, id, f, v)} removeFunc={(id) => removeItem(setMonsters, monsters, id)} showDelete={monsters.length > 1} targetStats={activePlayerStats} onSimulate={handleOpenSim} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 右侧结果区 */}
        <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-24">
          
          {/* 当开启联动时，显示战斗模拟结果 */}
          {isLinked && (
            <div className="bg-indigo-950/40 rounded-xl border border-indigo-500/30 overflow-hidden shadow-lg mb-6">
              <div className="bg-indigo-900/30 p-3 border-b border-indigo-500/20 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sword className="text-indigo-400 w-4 h-4"/>
                  <h3 className="font-bold text-indigo-100 text-sm">模拟战报 (Simulated Encounter)</h3>
                </div>
                {/* 团战模拟按钮 */}
                <button onClick={() => setShowEncounterModal(true)} className="bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] px-2 py-1 rounded flex items-center gap-1 transition-colors">
                  <Zap className="w-3 h-3 text-yellow-300 fill-current" /> 运行蒙特卡洛全战役模拟
                </button>
              </div>
              <div className="p-4 grid grid-cols-2 gap-4 text-center">
                <div>
                  <div className="text-[10px] text-amber-400 uppercase font-bold mb-1">玩家总输出 (DPR)</div>
                  <div className="text-2xl font-bold text-white">{partyTotalDPR.toFixed(1)}</div>
                  <div className="text-[10px] text-slate-400 mt-1">需 {activeMonsterStats.totalHP > 0 ? (activeMonsterStats.totalHP / partyTotalDPR).toFixed(1) : 0} 轮击杀怪物</div>
                </div>
                <div>
                  <div className="text-[10px] text-red-400 uppercase font-bold mb-1">怪物总输出 (DPR)</div>
                  <div className="text-2xl font-bold text-white">{encounterStats.totalDPR.toFixed(1)}</div>
                  <div className="text-[10px] text-slate-400 mt-1">需 {activePlayerStats.totalHP > 0 ? (activePlayerStats.totalHP / encounterStats.totalDPR).toFixed(1) : 0} 轮团灭玩家</div>
                </div>
              </div>
            </div>
          )}

          {/* ... (后续结果面板保持不变) ... */}
          {mode === 'player_analysis' ? (
            <>
              <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl relative overflow-hidden group">
                 <div className="absolute -right-6 -top-6 bg-amber-500/10 w-32 h-32 rounded-full group-hover:bg-amber-500/20 transition-all blur-xl"></div>
                 <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2"><Users className="w-4 h-4" /> 队伍总输出 (DPR)</h3>
                 <div className="text-5xl font-bold text-amber-400 flex items-baseline gap-2 mb-2">{partyTotalDPR.toFixed(1)}<span className="text-sm text-slate-500 font-normal">伤害/轮</span></div>
                 <div className="text-xs text-slate-400 flex gap-4">
                   <span>vs AC {activeMonsterStats.ac}</span>
                   <span>vs 豁免 +{activeMonsterStats.saveBonus}</span>
                 </div>
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
                   <span>对 {isLinked ? '左侧玩家队伍' : `自定义玩家 (HP ${activePlayerStats.totalHP})`}</span>
                   <span className="bg-red-950 px-2 py-0.5 rounded text-red-300 border border-red-900">{monsters.length} 只怪物</span>
                 </div>
              </div>
               <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-xl overflow-hidden">
                  <div className="bg-red-900/20 p-4 border-b border-slate-700 flex items-center gap-2"><AlertTriangle className="text-red-500 w-5 h-5"/><h3 className="font-bold text-slate-100">威胁评估</h3></div>
                  <div className="p-5 space-y-6">
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-bold uppercase tracking-wider text-slate-400"><span>总伤害占玩家HP比例</span><span className="text-slate-200">{activePlayerStats.totalHP > 0 ? ((encounterStats.totalDPR / activePlayerStats.totalHP) * 100).toFixed(0) : 0}%</span></div>
                      <div className="h-4 bg-slate-700 rounded-full overflow-hidden relative"><div className={`absolute top-0 bottom-0 transition-all duration-500 ${ (activePlayerStats.totalHP > 0 && encounterStats.totalDPR / activePlayerStats.totalHP) > 0.8 ? 'bg-red-600' : (activePlayerStats.totalHP > 0 && encounterStats.totalDPR / activePlayerStats.totalHP) > 0.4 ? 'bg-amber-500' : 'bg-green-500'}`} style={{ width: `${Math.min(100, activePlayerStats.totalHP > 0 ? (encounterStats.totalDPR / activePlayerStats.totalHP) * 100 : 0)}%` }}></div></div>
                    </div>
                    
                    <div className="grid grid-cols-1 gap-3">
                       <div className={`p-3 rounded border text-sm ${ encounterStats.totalDPR >= activePlayerStats.totalHP ? 'bg-red-950/30 border-red-500/30 text-red-200' : 'bg-slate-900 border-slate-700 text-slate-400'}`}>
                         <span className="font-bold block mb-1">压力测试:</span>
                         {encounterStats.totalDPR >= activePlayerStats.totalHP ? "💀 极度致命！怪物群一轮集火可秒杀一名玩家。" : encounterStats.totalDPR >= activePlayerStats.totalHP / 2 ? "⚠️ 高压。需要坦克职业或强力治疗来维持。" : "✅ 安全。玩家可以轻松应对这群怪物。"}
                       </div>
                       <div className={`p-3 rounded border text-sm ${ encounterStats.highestMaxDamage >= activePlayerStats.totalHP ? 'bg-orange-950/30 border-orange-500/30 text-orange-200' : 'bg-green-950/30 border-green-500/30 text-green-200'}`}>
                         <span className="font-bold block mb-1 flex items-center gap-2">{encounterStats.highestMaxDamage >= activePlayerStats.totalHP ? <Zap className="w-3 h-3"/> : <Shield className="w-3 h-3"/>} 一击必杀风险 ({encounterStats.bossName}):</span>
                         {encounterStats.highestMaxDamage >= activePlayerStats.totalHP ? `警告！${encounterStats.bossName} 的单次爆发 (${encounterStats.highestMaxDamage}) 足以直接打倒满血玩家。` : `安全。场上爆发最高的 ${encounterStats.bossName} 无法一击秒杀玩家。`}
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