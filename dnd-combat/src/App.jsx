import React, { useState, useEffect, useRef } from 'react';
import { Sword, Shield, Skull, Info, AlertTriangle, Users, Plus, Trash2, Zap, Crown, Calculator, X, Save, Upload, Link as LinkIcon, Unlink, Server, PlayCircle, Loader2, Target, BarChart2, List, MoreVertical } from 'lucide-react';

// ==========================================
// 1. 纯 JS 版蒙特卡洛引擎 (适配多动作模型)
// ==========================================
const MonteCarloEngine = {
  rollD20: (advantageState = 'normal') => {
    const roll = () => Math.floor(Math.random() * 20) + 1;
    const r1 = roll();
    const r2 = roll();
    if (advantageState === 'advantage') return Math.max(r1, r2);
    if (advantageState === 'disadvantage') return Math.min(r1, r2);
    return r1;
  },

  rollDamage: (diceCount, diceSides, isCrit = false) => {
    const actualCount = isCrit ? diceCount * 2 : diceCount;
    let total = 0;
    for (let i = 0; i < actualCount; i++) {
      total += Math.floor(Math.random() * diceSides) + 1;
    }
    return total;
  },

  resolveUnitTurn: (unit, targetAC, targetSave) => {
    let totalDamage = 0;
    const actions = unit.actions || [];
    for (const action of actions) {
      const count = action.count || 1;
      for (let i = 0; i < count; i++) {
        if (action.type === 'attack') {
          const d20 = MonteCarloEngine.rollD20(action.advantage);
          let isHit = false;
          let isCrit = false;
          if (d20 === 20) { isHit = true; isCrit = true; }
          else if (d20 === 1) { isHit = false; }
          else if (d20 + (action.hitBonus || 0) >= targetAC) { isHit = true; }

          if (isHit) {
            totalDamage += MonteCarloEngine.rollDamage(action.diceCount, action.diceType, isCrit) + (action.damageMod || 0);
          }
        } else {
          const saveRoll = Math.floor(Math.random() * 20) + 1;
          const saveTotal = saveRoll + targetSave;
          const dc = action.saveDC || 10;
          const dmgRoll = MonteCarloEngine.rollDamage(action.diceCount, action.diceType, false);
          const dmgTotal = dmgRoll + (action.damageMod || 0);

          if (saveTotal >= dc) {
            if (action.halfOnSave) totalDamage += Math.floor(dmgTotal / 2);
          } else {
            totalDamage += dmgTotal;
          }
        }
      }
    }
    return totalDamage;
  },

  runSingleSimulation: async (unit, targetStats, iterations = 100000) => {
    return new Promise((resolve) => {
      setTimeout(() => {
        let totalDamage = 0;
        const start = performance.now();
        const { ac, saveBonus } = targetStats;
        for (let i = 0; i < iterations; i++) {
          totalDamage += MonteCarloEngine.resolveUnitTurn(unit, ac, saveBonus);
        }
        const end = performance.now();
        resolve({
          avg_damage: totalDamage / iterations,
          duration: (end - start) / 1000,
          iterations
        });
      }, 10);
    });
  },

  runEncounterSimulation: async (teamA, teamB, statsA, statsB, iterations = 10000) => {
    return new Promise((resolve) => {
      setTimeout(() => {
        let winsA = 0, totalRounds = 0, totalDmgA = 0, totalDmgB = 0;
        const unitStatsA = {}; 
        const unitStatsB = {};
        
        teamA.forEach(u => unitStatsA[u.id] = 0);
        teamB.forEach(u => unitStatsB[u.id] = 0);

        const start = performance.now();
        const initialHpA = statsA.totalHP;
        const initialHpB = statsB.totalHP;
        const targetAcA = statsA.ac, targetSaveA = statsA.saveBonus;
        const targetAcB = statsB.ac, targetSaveB = statsB.saveBonus;

        for (let i = 0; i < iterations; i++) {
          let hpA = initialHpA, hpB = initialHpB, rounds = 0;
          while (hpA > 0 && hpB > 0 && rounds < 50) {
            rounds++;
            let roundDmgA = 0;
            for (const unit of teamA) {
              const dmg = MonteCarloEngine.resolveUnitTurn(unit, targetAcB, targetSaveB);
              roundDmgA += dmg;
              unitStatsA[unit.id] += dmg;
            }
            hpB -= roundDmgA;
            totalDmgA += roundDmgA;
            if (hpB <= 0) { winsA++; break; }

            let roundDmgB = 0;
            for (const unit of teamB) {
              const dmg = MonteCarloEngine.resolveUnitTurn(unit, targetAcA, targetSaveA);
              roundDmgB += dmg;
              unitStatsB[unit.id] += dmg;
            }
            hpA -= roundDmgB;
            totalDmgB += roundDmgB;
          }
          totalRounds += rounds;
        }

        const end = performance.now();
        
        const processResults = (statsObj) => {
          const res = {};
          Object.keys(statsObj).forEach(id => {
            res[id] = {
              avg_total: statsObj[id] / iterations,
              avg_dpr: totalRounds > 0 ? statsObj[id] / totalRounds : 0
            };
          });
          return res;
        };

        resolve({
          win_rate: (winsA / iterations) * 100,
          avg_rounds: totalRounds / iterations,
          avg_total_damage_a: totalDmgA / iterations,
          avg_total_damage_b: totalDmgB / iterations,
          avg_dpr_a: totalRounds > 0 ? totalDmgA / totalRounds : 0,
          avg_dpr_b: totalRounds > 0 ? totalDmgB / totalRounds : 0,
          unit_results_a: processResults(unitStatsA),
          unit_results_b: processResults(unitStatsB),
          duration: (end - start) / 1000,
          iterations
        });
      }, 10);
    });
  }
};

// ==========================================
// 2. 核心数学算法 (适配多动作)
// ==========================================
const calculateActionDPR = (action, targetStats) => {
  const { type, hitBonus, saveDC, halfOnSave, diceCount, diceType, damageMod, count, advantage } = action;
  const { ac, saveBonus } = targetStats;
  let hitChance = 0, critChance = 0;

  if (type === 'attack') {
    const neededRoll = ac - hitBonus;
    let rawHitChance = Math.max(0.05, Math.min(0.95, (21 - neededRoll) / 20));
    hitChance = rawHitChance;
    if (advantage === 'advantage') hitChance = 1 - Math.pow(1 - rawHitChance, 2);
    else if (advantage === 'disadvantage') hitChance = Math.pow(rawHitChance, 2);
    critChance = advantage === 'advantage' ? 0.0975 : (advantage === 'disadvantage' ? 0.0025 : 0.05);
  } else {
    const rawSaveChance = Math.min(1.0, Math.max(0.0, (21 + (saveBonus || 0) - saveDC) / 20));
    const failChance = 1 - rawSaveChance;
    hitChance = halfOnSave ? failChance + (rawSaveChance * 0.5) : failChance;
  }

  const diceAvg = diceCount * ((diceType + 1) / 2);
  return ((hitChance * (diceAvg + damageMod)) + (critChance * diceAvg)) * count;
};

const calculateUnitTotalStats = (unit, targetStats) => {
  let totalDPR = 0;
  let maxBurst = 0;
  (unit.actions || []).forEach(action => {
    totalDPR += calculateActionDPR(action, targetStats);
    const diceMax = action.diceCount * action.diceType;
    const potentialDice = action.type === 'attack' ? diceMax * 2 : diceMax; 
    maxBurst += (potentialDice + action.damageMod) * action.count;
  });
  return { dpr: totalDPR, maxDamage: maxBurst };
};

// ... Components ...

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

const ActionRow = ({ action, index, updateAction, removeAction, isMonster }) => {
  // 修复：使用完整的类名而不是动态拼接，以便Tailwind JIT编译器能识别
  const focusBorderColor = isMonster ? 'focus:border-red-500' : 'focus:border-amber-500';
  const textColor = isMonster ? 'text-red-400' : 'text-amber-400';
  const inputClass = `bg-slate-900 border border-slate-600 rounded px-1 py-1 text-center text-xs outline-none ${focusBorderColor}`;

  return (
    <div className="bg-slate-900/30 rounded border border-slate-700/50 p-2 mb-2 flex flex-wrap gap-2 items-center">
      <div className="flex bg-slate-800 rounded border border-slate-600 overflow-hidden shrink-0">
        <button onClick={() => updateAction('type', 'attack')} className={`px-2 py-1 text-[10px] ${action.type === 'attack' ? 'bg-slate-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}>攻</button>
        <button onClick={() => updateAction('type', 'save')} className={`px-2 py-1 text-[10px] ${action.type === 'save' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}>法</button>
      </div>

      <div className="flex items-center gap-1 w-20 shrink-0">
        <span className="text-[10px] text-slate-500">{action.type==='attack' ? 'Hit' : 'DC'}</span>
        <input type="number" value={action.type==='attack' ? action.hitBonus : action.saveDC} onChange={(e) => updateAction(action.type==='attack'?'hitBonus':'saveDC', Number(e.target.value))} className={`${inputClass} w-full ${textColor} font-bold`}/>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <input type="number" min="1" value={action.diceCount} onChange={e=>updateAction('diceCount', Math.max(1, Number(e.target.value)))} className={`${inputClass} w-10`}/>
        <span className="text-[10px] text-slate-500">d</span>
        <select value={action.diceType} onChange={e=>updateAction('diceType', Number(e.target.value))} className={`${inputClass} w-10 appearance-none`}>{[4,6,8,10,12,20].map(d=><option key={d} value={d}>{d}</option>)}</select>
        <span className="text-[10px] text-slate-500">+</span>
        <input type="number" value={action.damageMod} onChange={e=>updateAction('damageMod', Number(e.target.value))} className={`${inputClass} w-10`}/>
      </div>

      <div className="flex items-center gap-1 shrink-0 bg-slate-800/50 rounded px-1 border border-slate-700">
        <span className="text-[10px] text-slate-500">x</span>
        <input type="number" min="1" value={action.count} onChange={e=>updateAction('count', Math.max(1, Number(e.target.value)))} className="w-6 bg-transparent text-center text-xs font-bold outline-none"/>
      </div>

      <div className="flex-1 min-w-[80px]">
        {action.type === 'attack' ? (
          <select value={action.advantage} onChange={e=>updateAction('advantage', e.target.value)} className={`${inputClass} w-full text-[10px]`}>
            <option value="normal">正常</option>
            <option value="advantage">优势</option>
            <option value="disadvantage">劣势</option>
          </select>
        ) : (
          <div className="flex items-center gap-1 justify-center h-full">
            <input type="checkbox" checked={action.halfOnSave} onChange={e=>updateAction('halfOnSave', e.target.checked)} className="w-3 h-3 rounded border-slate-600 bg-slate-800 text-indigo-500"/>
            <span className="text-[9px] text-slate-500">半伤</span>
          </div>
        )}
      </div>

      <button onClick={removeAction} className="text-slate-600 hover:text-red-400 p-1"><X className="w-3 h-3"/></button>
    </div>
  );
};

const UnitCard = ({ item, index, isMonster, updateUnit, removeUnit, showDelete, targetStats, onSimulate }) => {
  const stats = calculateUnitTotalStats(item, targetStats);
  const handleUpdateAction = (actionId, field, value) => {
    const newActions = item.actions.map(a => a.id === actionId ? { ...a, [field]: value } : a);
    updateUnit(item.id, 'actions', newActions);
  };
  const handleAddAction = () => {
    const newAction = {
      id: Date.now(),
      type: 'attack', hitBonus: 5, saveDC: 13, halfOnSave: false,
      diceCount: 1, diceType: 6, damageMod: 0, count: 1, advantage: 'normal'
    };
    updateUnit(item.id, 'actions', [...(item.actions || []), newAction]);
  };
  const handleRemoveAction = (actionId) => {
    if (item.actions.length <= 1) return; 
    updateUnit(item.id, 'actions', item.actions.filter(a => a.id !== actionId));
  };

  const borderClass = item.isBoss ? 'border-amber-500/50 shadow-amber-900/20' : 'border-slate-700';
  const headerClass = item.isBoss ? 'bg-amber-950/30 border-amber-500/30' : 'bg-slate-800/50 border-slate-700/50';
  const dprColor = isMonster ? 'text-red-400' : 'text-amber-400';

  return (
    <div className={`bg-slate-800 rounded-xl border overflow-hidden shadow-sm hover:shadow-md transition-all relative ${borderClass}`}>
      <div className={`p-3 border-b flex flex-wrap gap-2 justify-between items-center ${headerClass}`}>
        <div className="flex items-center gap-3 flex-1 min-w-[150px]">
          <span className="bg-slate-700 text-slate-400 text-xs px-1.5 py-0.5 rounded font-mono">{index + 1}</span>
          <input type="text" value={item.name} onChange={(e) => updateUnit(item.id, 'name', e.target.value)} className="bg-transparent border-none text-sm font-bold text-slate-200 focus:ring-0 w-32 placeholder-slate-600" />
          {isMonster && <button onClick={() => updateUnit(item.id, 'isBoss', !item.isBoss)} className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold border transition-all ${item.isBoss ? 'bg-amber-500 text-slate-900 border-amber-400' : 'bg-slate-800 text-slate-500 border-slate-600'}`}><Crown className="w-3 h-3" fill={item.isBoss ? "currentColor" : "none"} /></button>}
        </div>
        <div className="flex items-center gap-3">
           <div className="text-xs text-slate-500 font-mono flex items-center gap-2">
             <span>DPR: <span className={`${dprColor} font-bold`}>{stats.dpr.toFixed(1)}</span></span>
             <button onClick={() => onSimulate(item, targetStats)} className="bg-purple-900/50 hover:bg-purple-700 text-purple-200 border border-purple-800 p-1 rounded" title="模拟验证"><Server className="w-3 h-3" /></button>
           </div>
           {showDelete && <button onClick={() => removeUnit(item.id)} className="text-slate-600 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>}
        </div>
      </div>

      <div className="p-3">
        <div className={`grid ${isMonster ? 'grid-cols-3' : 'grid-cols-2'} gap-2 bg-slate-900/50 p-2 rounded border border-slate-700/50 mb-3`}>
          <div className="flex items-center gap-1"><Shield className="w-3 h-3 text-slate-500"/><label className="text-[10px] text-slate-400">AC</label><input type="number" value={item.ac || 10} onChange={(e) => updateUnit(item.id, 'ac', Number(e.target.value))} className="w-full bg-transparent border-b border-slate-600 text-center text-xs font-bold text-slate-300 focus:border-slate-400 outline-none"/></div>
          <div className="flex items-center gap-1 border-l border-slate-700 pl-2"><div className="text-[10px] text-slate-400 font-bold">HP</div><input type="number" value={item.hp || 10} onChange={(e) => updateUnit(item.id, 'hp', Number(e.target.value))} className="w-full bg-transparent border-b border-slate-600 text-center text-xs font-bold text-slate-300 focus:border-slate-400 outline-none"/></div>
          {isMonster && (
            <div className="flex items-center gap-1 border-l border-slate-700 pl-2"><div className="text-[10px] text-slate-400">Save+</div><input type="number" value={item.saveBonus || 0} onChange={(e) => updateUnit(item.id, 'saveBonus', Number(e.target.value))} className="w-full bg-transparent border-b border-slate-600 text-center text-xs font-bold text-slate-300 focus:border-slate-400 outline-none"/></div>
          )}
        </div>

        <div className="space-y-1">
          {item.actions && item.actions.map((action, i) => (
            <ActionRow 
              key={action.id} 
              action={action} 
              index={i} 
              isMonster={isMonster}
              updateAction={(f, v) => handleUpdateAction(action.id, f, v)}
              removeAction={() => handleRemoveAction(action.id)}
            />
          ))}
        </div>
        
        <button onClick={handleAddAction} className="w-full mt-2 py-1 text-[10px] text-slate-500 hover:text-slate-300 hover:bg-slate-800 border border-dashed border-slate-700 rounded flex items-center justify-center gap-1 transition-colors">
          <Plus className="w-3 h-3"/> 添加攻击方式
        </button>
      </div>
    </div>
  );
};

const SimulationModal = ({ onClose, unit, targetStats }) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [iterations, setIterations] = useState(100000);

  const runSimulation = async () => {
    setLoading(true);
    const data = await MonteCarloEngine.runSingleSimulation(unit, targetStats, iterations);
    setResult(data);
    setLoading(false);
  };

  useEffect(() => { runSimulation(); }, []);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-slate-800 rounded-xl border border-slate-600 shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-slate-900 p-4 border-b border-slate-700 flex justify-between items-center">
          <h3 className="text-purple-400 font-bold flex items-center gap-2"><Server className="w-5 h-5"/> 单体伤害模拟 (JS)</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5"/></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="text-xs text-slate-400 bg-slate-900/50 p-2 rounded border border-slate-700/50 text-center">
            正在模拟 <b>{unit.name}</b> 对抗 <b>AC {targetStats.ac} / Save +{targetStats.saveBonus}</b>
          </div>
          <div className="flex items-center gap-2 justify-center py-2">
             <select value={iterations} onChange={e => setIterations(Number(e.target.value))} className="bg-slate-900 border border-slate-600 rounded text-xs p-1 outline-none text-slate-200"><option value="10000">1万次</option><option value="100000">10万次</option></select>
             <button onClick={runSimulation} disabled={loading} className="bg-purple-600 hover:bg-purple-500 text-white text-xs px-3 py-1 rounded flex items-center gap-1 transition-colors">{loading ? <Loader2 className="w-3 h-3 animate-spin"/> : <PlayCircle className="w-3 h-3"/>} 重新运行</button>
          </div>
          {result && (
            <div className="bg-slate-700/50 p-4 rounded border border-slate-600 text-center">
              <div className="text-slate-400 text-xs uppercase font-bold mb-1">总期望伤害 (Total DPR)</div>
              <div className="text-5xl font-bold text-purple-400">{result.avg_damage.toFixed(2)}</div>
              <div className="text-[10px] text-slate-500 mt-2">Browser JS Engine • {result.duration.toFixed(3)}s</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const EncounterSimModal = ({ onClose, teamA, teamB, statsA, statsB }) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  const runSimulation = async () => {
    setLoading(true);
    const enrichedTeamA = teamA.map(u => ({ ...u, ac: statsA.ac, saveBonus: statsA.saveBonus }));
    const enrichedTeamB = teamB.map(u => ({ ...u, ac: statsB.ac, saveBonus: statsB.saveBonus }));
    const data = await MonteCarloEngine.runEncounterSimulation(enrichedTeamA, enrichedTeamB, statsA, statsB, 10000);
    setResult(data);
    setLoading(false);
  };

  useEffect(() => { runSimulation(); }, []);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-slate-800 rounded-xl border border-slate-600 shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-slate-900 p-4 border-b border-slate-700 flex justify-between items-center shrink-0">
          <h3 className="text-indigo-400 font-bold flex items-center gap-2"><Target className="w-5 h-5"/> 全局战役模拟 (JS)</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5"/></button>
        </div>
        <div className="p-6 overflow-y-auto grow">
          <div className="flex justify-between items-center px-4 mb-4">
             <div className="text-center"><div className="text-xl font-bold text-amber-400">玩家队伍</div><div className="text-xs text-slate-500">{teamA.length} 人 (HP {statsA.totalHP})</div></div>
             <div className="text-slate-600 font-bold">VS</div>
             <div className="text-center"><div className="text-xl font-bold text-red-400">怪物遭遇</div><div className="text-xs text-slate-500">{teamB.length} 只 (HP {statsB.totalHP})</div></div>
          </div>
          {loading && <div className="py-12 flex justify-center text-indigo-400"><Loader2 className="w-10 h-10 animate-spin"/></div>}
          {result && !loading && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex border-b border-slate-700 mb-4">
                <button onClick={() => setActiveTab('overview')} className={`flex items-center gap-2 px-4 py-2 text-sm font-bold border-b-2 transition-colors ${activeTab === 'overview' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}><BarChart2 className="w-4 h-4"/> 战报总览</button>
                <button onClick={() => setActiveTab('details')} className={`flex items-center gap-2 px-4 py-2 text-sm font-bold border-b-2 transition-colors ${activeTab === 'details' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}><List className="w-4 h-4"/> 详细数据</button>
              </div>
              {activeTab === 'overview' && (
                <div className="space-y-4">
                  <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-700 text-center relative overflow-hidden">
                    <div className="absolute top-0 bottom-0 left-0 bg-amber-500/10 transition-all duration-1000" style={{width: `${result.win_rate}%`}}></div>
                    <div className="relative z-10"><div className="text-sm text-slate-400 font-bold uppercase tracking-wider mb-2">玩家胜率</div><div className={`text-5xl font-black ${result.win_rate > 80 ? 'text-green-400' : result.win_rate > 50 ? 'text-amber-400' : 'text-red-500'}`}>{result.win_rate.toFixed(1)}%</div><div className="text-xs text-slate-500 mt-2">JS 模拟耗时: {result.duration.toFixed(3)}s</div></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                     <div className="bg-slate-700/30 p-3 rounded border border-slate-600 text-center"><div className="text-xs text-slate-400 mb-1">平均战斗时长</div><div className="text-xl font-bold text-white">{result.avg_rounds.toFixed(1)} <span className="text-sm font-normal text-slate-500">轮</span></div></div>
                     <div className="bg-slate-700/30 p-3 rounded border border-slate-600 text-center"><div className="text-xs text-slate-400 mb-1">团灭风险</div><div className={`text-xl font-bold ${(100 - result.win_rate) > 50 ? 'text-red-400' : 'text-green-400'}`}>{(100 - result.win_rate).toFixed(1)}%</div></div>
                  </div>
                </div>
              )}
              {activeTab === 'details' && (
                <div className="grid grid-cols-2 gap-4 h-[300px]">
                  <div className="bg-slate-900/30 border border-slate-700 rounded-lg overflow-hidden flex flex-col">
                    <div className="bg-slate-800/80 px-3 py-2 text-xs font-bold text-amber-400 border-b border-slate-700">玩家表现</div>
                    <div className="overflow-y-auto p-2 space-y-2">{teamA.map((unit) => { const stats = result.unit_results_a[unit.id] || { avg_total: 0, avg_dpr: 0 }; return (<div key={unit.id} className="flex justify-between items-center text-xs p-2 bg-slate-800/50 rounded border border-slate-700/50"><span className="font-bold text-slate-200 truncate w-16" title={unit.name}>{unit.name}</span><div className="text-right"><div className="text-amber-200 font-mono">{stats.avg_total.toFixed(0)} 总伤</div><div className="text-slate-500 font-mono text-[10px]">{stats.avg_dpr.toFixed(1)} DPR</div></div></div>);})}</div>
                  </div>
                  <div className="bg-slate-900/30 border border-slate-700 rounded-lg overflow-hidden flex flex-col">
                    <div className="bg-slate-800/80 px-3 py-2 text-xs font-bold text-red-400 border-b border-slate-700">怪物表现</div>
                    <div className="overflow-y-auto p-2 space-y-2">{teamB.map((unit) => { const stats = result.unit_results_b[unit.id] || { avg_total: 0, avg_dpr: 0 }; return (<div key={unit.id} className="flex justify-between items-center text-xs p-2 bg-slate-800/50 rounded border border-slate-700/50"><span className="font-bold text-slate-200 truncate w-16" title={unit.name}>{unit.name}</span><div className="text-right"><div className="text-red-200 font-mono">{stats.avg_total.toFixed(0)} 总伤</div><div className="text-slate-500 font-mono text-[10px]">{stats.avg_dpr.toFixed(1)} DPR</div></div></div>);})}</div>
                  </div>
                </div>
              )}
              <div className="flex justify-center pt-2"><button onClick={runSimulation} className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"><PlayCircle className="w-3 h-3"/> 再次模拟</button></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const DndCombatCalculator = () => {
  const [mode, setMode] = useState('player_analysis');
  const [showDiceTool, setShowDiceTool] = useState(false);
  const [showSimModal, setShowSimModal] = useState(false);
  const [simUnit, setSimUnit] = useState(null); 
  const [showEncounterModal, setShowEncounterModal] = useState(false);
  const [isLinked, setIsLinked] = useState(false);

  const defaultAction = { id: 1, type: 'attack', hitBonus: 5, saveDC: 13, halfOnSave: false, diceCount: 1, diceType: 8, damageMod: 3, count: 1, advantage: 'normal' };
  
  const [players, setPlayers] = useState([
    { id: 1, name: '战士', actions: [{ ...defaultAction, id: 101, hitBonus: 7, diceCount: 2, diceType: 6, damageMod: 4, count: 2 }], ac: 16, hp: 35 }
  ]);
  const [monsters, setMonsters] = useState([
    { id: 1, name: '地精首领', actions: [{ ...defaultAction, id: 201, hitBonus: 5, damageMod: 3, count: 2 }], isBoss: true, ac: 15, hp: 45, saveBonus: 1 }
  ]);

  const [manualMonsterAC, setManualMonsterAC] = useState(15);
  const [manualMonsterSaveBonus, setManualMonsterSaveBonus] = useState(2);
  const [manualTargetPlayerAC, setManualTargetPlayerAC] = useState(15);
  const [manualTargetPlayerHP, setManualTargetPlayerHP] = useState(25);
  
  const [activeMonsterStats, setActiveMonsterStats] = useState({ ac: 15, saveBonus: 2, totalHP: 45 });
  const [activePlayerStats, setActivePlayerStats] = useState({ ac: 15, saveBonus: 0, totalHP: 25 });
  const [partyTotalDPR, setPartyTotalDPR] = useState(0);
  const [encounterStats, setEncounterStats] = useState({ totalDPR: 0, highestMaxDamage: 0, bossName: '' });
  
  const fileInputRef = useRef(null);

  const migrateUnit = (unit) => {
    if (unit.actions) return unit;
    return {
      id: unit.id,
      name: unit.name,
      isBoss: unit.isBoss,
      ac: unit.ac, hp: unit.hp, saveBonus: unit.saveBonus,
      actions: [{
        id: Date.now() + Math.random(),
        type: unit.attackType || 'attack',
        hitBonus: unit.attackBonus || 5,
        saveDC: unit.saveDC || 13,
        halfOnSave: unit.halfOnSave || false,
        diceCount: unit.diceCount || 1,
        diceType: unit.diceType || 8,
        damageMod: unit.damageMod || 0,
        count: unit.attacksPerRound || 1,
        advantage: unit.advantageState || 'normal'
      }]
    };
  };

  const handleOpenSim = (item, targetStats) => {
    setSimUnit(item); 
    setShowSimModal(true); 
  };

  const handleSave = () => { const data = { players, monsters, isLinked, timestamp: Date.now() }; const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `dnd-combat-save-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url); };
  
  const handleLoad = (e) => { 
    const file = e.target.files[0]; if (!file) return; 
    const reader = new FileReader(); 
    reader.onload = (event) => { 
      try { 
        const data = JSON.parse(event.target.result); 
        if (data.players) setPlayers(data.players.map(migrateUnit)); 
        if (data.monsters) setMonsters(data.monsters.map(migrateUnit)); 
        if (data.isLinked !== undefined) setIsLinked(data.isLinked); 
      } catch (err) { alert('文件格式错误'); } 
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

    const currentMonsterTarget = isLinked ? { ac: Math.round(mAC), saveBonus: Math.round(mSave), totalHP: mTotalHP } : { ac: manualMonsterAC, saveBonus: manualMonsterSaveBonus, totalHP: 0 }; 
    const currentPlayerTarget = isLinked ? { ac: Math.round(pAC), saveBonus: Math.round(pSave), totalHP: pTotalHP } : { ac: manualTargetPlayerAC, saveBonus: 0, totalHP: manualTargetPlayerHP };

    setActiveMonsterStats(currentMonsterTarget); setActivePlayerStats(currentPlayerTarget);

    const pTotalDPR = players.reduce((acc, p) => acc + calculateUnitTotalStats(p, currentMonsterTarget).dpr, 0); setPartyTotalDPR(pTotalDPR);
    let mTotalDPR = 0; let highestMax = 0; let boss = '';
    monsters.forEach(m => { const stats = calculateUnitTotalStats(m, currentPlayerTarget); mTotalDPR += stats.dpr; if (stats.maxDamage > highestMax) { highestMax = stats.maxDamage; boss = m.name; } });
    setEncounterStats({ totalDPR: mTotalDPR, highestMaxDamage: highestMax, bossName: boss });
  }, [players, monsters, isLinked, manualMonsterAC, manualMonsterSaveBonus, manualTargetPlayerAC, manualTargetPlayerHP]);

  const updateUnit = (setFunc, list, id, field, value) => { setFunc(list.map(item => item.id === id ? { ...item, [field]: value } : item)); };
  
  const addItem = (setFunc, list, prefix) => {
    if (list.length >= 8) return;
    let newItem = { 
      id: Date.now(), name: `${prefix} ${list.length + 1}`, 
      ac: 13, hp: 30, saveBonus: 2,
      actions: [{ ...defaultAction, id: Date.now() + 1 }]
    };
    if (prefix === '怪物') {
      if (list.length > 0) {
        const prototype = list[0];
        newItem = JSON.parse(JSON.stringify(prototype)); 
        newItem.id = Date.now();
        newItem.name = `${prefix} ${list.length + 1}`;
        newItem.isBoss = false;
        newItem.actions.forEach(a => { a.count = 1; a.id = Date.now() + Math.random() });
      }
    } else {
      delete newItem.saveBonus;
    }
    setFunc([...list, newItem]);
  };
  
  const removeItem = (setFunc, list, id) => list.length > 1 && setFunc(list.filter(i => i.id !== id));

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans pb-10">
      {showDiceTool && <DiceCalculator onClose={() => setShowDiceTool(false)} />}
      {showSimModal && simUnit && <SimulationModal unit={simUnit} targetStats={mode==='player_analysis'?activeMonsterStats:activePlayerStats} onClose={() => setShowSimModal(false)} />}
      {showEncounterModal && <EncounterSimModal onClose={() => setShowEncounterModal(false)} teamA={players} teamB={monsters} statsA={activePlayerStats} statsB={activeMonsterStats} />}
      <input type="file" ref={fileInputRef} onChange={handleLoad} className="hidden" accept=".json" />

      <header className="bg-slate-950 border-b border-slate-800 p-4 sticky top-0 z-20 shadow-lg backdrop-blur-md bg-opacity-90">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-amber-600 to-amber-700 rounded-lg shadow-inner"><Sword className="w-6 h-6 text-white" /></div>
            <div><h1 className="text-xl font-bold bg-gradient-to-r from-amber-200 to-amber-500 bg-clip-text text-transparent">D&D 5e 战斗模拟器</h1><p className="text-xs text-slate-500 font-medium tracking-wide">DM 工具箱 & 遭遇平衡器</p></div>
          </div>
          <div className="flex gap-2 items-center">
            <div className="flex bg-slate-800 p-1 rounded-lg shadow-inner mr-2"><button onClick={handleSave} className="p-2 text-slate-400 hover:text-white transition-colors" title="保存"><Save className="w-5 h-5"/></button><div className="w-px bg-slate-700 my-1"></div><button onClick={() => fileInputRef.current.click()} className="p-2 text-slate-400 hover:text-white transition-colors" title="读取"><Upload className="w-5 h-5"/></button></div>
            <div className="flex bg-slate-800 p-1 rounded-lg shadow-inner"><button onClick={() => setMode('player_analysis')} className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${mode === 'player_analysis' ? 'bg-amber-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}><Users className="w-4 h-4" />分析队伍</button><button onClick={() => setMode('monster_analysis')} className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${mode === 'monster_analysis' ? 'bg-red-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}><Skull className="w-4 h-4" />分析怪物</button></div>
            <button onClick={() => setShowDiceTool(true)} className="bg-slate-800 p-2 rounded-lg text-amber-400 border border-slate-700 hover:border-amber-500 transition-all"><Calculator className="w-6 h-6"/></button>
          </div>
        </div>
      </header>

      <div className={`border-b px-4 py-2 text-center text-xs font-bold transition-colors cursor-pointer flex justify-center items-center gap-2 ${isLinked ? 'bg-indigo-900/50 border-indigo-700 text-indigo-200' : 'bg-slate-900 border-slate-800 text-slate-500 hover:bg-slate-800'}`} onClick={() => setIsLinked(!isLinked)}>{isLinked ? <LinkIcon className="w-3 h-3" /> : <Unlink className="w-3 h-3" />}{isLinked ? "数据联动已开启" : "数据联动已关闭 (点击开启)"}</div>

      <main className="max-w-6xl mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 space-y-6">
          {mode === 'player_analysis' ? (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-end gap-4">
                <h2 className="text-lg font-semibold flex items-center gap-2 text-amber-400"><Users className="w-5 h-5" /> 玩家队伍配置</h2>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <div className={`p-2 rounded-lg border flex items-center gap-3 shadow-sm transition-all ${isLinked ? 'bg-indigo-900/20 border-indigo-500/30 opacity-80' : 'bg-slate-800 border-slate-700'}`}>
                    <div className="flex items-center gap-1"><label className="text-[10px] font-bold text-slate-400 uppercase">目标AC</label>{isLinked ? (<span className="w-12 text-center text-indigo-300 font-bold font-mono">{activeMonsterStats.ac}</span>) : (<input type="number" value={manualMonsterAC} onChange={(e) => setManualMonsterAC(Number(e.target.value))} className="w-12 bg-slate-900 border border-slate-600 rounded px-1 py-0.5 text-center text-amber-400 font-bold outline-none focus:border-amber-500" />)}</div>
                    <div className="w-px h-6 bg-slate-700"></div>
                    <div className="flex items-center gap-1"><label className="text-[10px] font-bold text-slate-400 uppercase">目标豁免</label>{isLinked ? (<span className="w-12 text-center text-indigo-300 font-bold font-mono">+{activeMonsterStats.saveBonus}</span>) : (<input type="number" value={manualMonsterSaveBonus} onChange={(e) => setManualMonsterSaveBonus(Number(e.target.value))} className="w-12 bg-slate-900 border border-slate-600 rounded px-1 py-0.5 text-center text-indigo-400 font-bold outline-none focus:border-indigo-500" />)}</div>
                  </div>
                  <button onClick={() => addItem(setPlayers, players, '玩家')} className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-amber-400 px-3 py-2 rounded-lg text-xs font-bold transition-all border border-slate-700"><Plus className="w-4 h-4" /> 添加</button>
                </div>
              </div>
              <div className="space-y-3">
                {players.map((p, index) => (<UnitCard key={p.id} item={p} index={index} isMonster={false} updateUnit={(id, f, v) => updateUnit(setPlayers, players, id, f, v)} removeUnit={(id) => removeItem(setPlayers, players, id)} showDelete={players.length > 1} targetStats={activeMonsterStats} onSimulate={handleOpenSim} />))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-end gap-4">
                <h2 className="text-lg font-semibold flex items-center gap-2 text-red-400"><Skull className="w-5 h-5" /> 怪物遭遇配置</h2>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <div className={`p-2 rounded-lg border flex items-center gap-3 shadow-sm transition-all ${isLinked ? 'bg-indigo-900/20 border-indigo-500/30 opacity-80' : 'bg-slate-800 border-slate-700'}`}>
                    <div className="flex items-center gap-1"><label className="text-[10px] font-bold text-slate-400 uppercase">玩家AC</label>{isLinked ? (<span className="w-12 text-center text-indigo-300 font-bold font-mono">{activePlayerStats.ac}</span>) : (<input type="number" value={manualTargetPlayerAC} onChange={(e) => setManualTargetPlayerAC(Number(e.target.value))} className="w-12 bg-slate-900 border border-slate-600 rounded px-1 py-0.5 text-center text-slate-200 font-bold outline-none focus:border-red-500" />)}</div>
                    <div className="w-px h-6 bg-slate-700"></div>
                     <div className="flex items-center gap-1"><label className="text-[10px] font-bold text-slate-400 uppercase">玩家HP</label>{isLinked ? (<span className="w-12 text-center text-indigo-300 font-bold font-mono">{activePlayerStats.totalHP}</span>) : (<input type="number" value={manualTargetPlayerHP} onChange={(e) => setManualTargetPlayerHP(Math.max(1, Number(e.target.value)))} className="w-12 bg-slate-900 border border-slate-600 rounded px-1 py-0.5 text-center text-slate-200 font-bold outline-none focus:border-red-500" />)}</div>
                  </div>
                  <button onClick={() => addItem(setMonsters, monsters, '怪物')} className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-red-400 px-3 py-2 rounded-lg text-xs font-bold transition-all border border-slate-700"><Plus className="w-4 h-4" /> 添加</button>
                </div>
              </div>
              <div className="space-y-3">
                {monsters.map((m, index) => (<UnitCard key={m.id} item={m} index={index} isMonster={true} updateUnit={(id, f, v) => updateUnit(setMonsters, monsters, id, f, v)} removeUnit={(id) => removeItem(setMonsters, monsters, id)} showDelete={monsters.length > 1} targetStats={activePlayerStats} onSimulate={handleOpenSim} />))}
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-24">
          {isLinked && (
            <div className="bg-indigo-950/40 rounded-xl border border-indigo-500/30 overflow-hidden shadow-lg mb-6">
              <div className="bg-indigo-900/30 p-3 border-b border-indigo-500/20 flex items-center justify-between">
                <div className="flex items-center gap-2"><Sword className="text-indigo-400 w-4 h-4"/><h3 className="font-bold text-indigo-100 text-sm">模拟战报 (Simulated Encounter)</h3></div>
                <button onClick={() => setShowEncounterModal(true)} className="bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] px-2 py-1 rounded flex items-center gap-1 transition-colors"><Zap className="w-3 h-3 text-yellow-300 fill-current" /> 运行蒙特卡洛全战役模拟</button>
              </div>
              <div className="p-4 grid grid-cols-2 gap-4 text-center">
                <div><div className="text-[10px] text-amber-400 uppercase font-bold mb-1">玩家总输出 (DPR)</div><div className="text-2xl font-bold text-white">{partyTotalDPR.toFixed(1)}</div><div className="text-[10px] text-slate-400 mt-1">需 {activeMonsterStats.totalHP > 0 ? (activeMonsterStats.totalHP / partyTotalDPR).toFixed(1) : 0} 轮击杀怪物</div></div>
                <div><div className="text-[10px] text-red-400 uppercase font-bold mb-1">怪物总输出 (DPR)</div><div className="text-2xl font-bold text-white">{encounterStats.totalDPR.toFixed(1)}</div><div className="text-[10px] text-slate-400 mt-1">需 {activePlayerStats.totalHP > 0 ? (activePlayerStats.totalHP / encounterStats.totalDPR).toFixed(1) : 0} 轮团灭玩家</div></div>
              </div>
            </div>
          )}
          
          {mode === 'player_analysis' ? (
            <>
              <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl relative overflow-hidden group">
                 <div className="absolute -right-6 -top-6 bg-amber-500/10 w-32 h-32 rounded-full group-hover:bg-amber-500/20 transition-all blur-xl"></div>
                 <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2"><Users className="w-4 h-4" /> 队伍总输出 (DPR)</h3>
                 <div className="text-5xl font-bold text-amber-400 flex items-baseline gap-2 mb-2">{partyTotalDPR.toFixed(1)}<span className="text-sm text-slate-500 font-normal">伤害/轮</span></div>
                 <div className="text-xs text-slate-400 flex gap-4"><span>vs AC {activeMonsterStats.ac}</span><span>vs 豁免 +{activeMonsterStats.saveBonus}</span></div>
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
                 <div className="text-xs text-slate-500 mt-2 flex justify-between items-center"><span>对 {isLinked ? '左侧玩家队伍' : `自定义玩家 (HP ${activePlayerStats.totalHP})`}</span><span className="bg-red-950 px-2 py-0.5 rounded text-red-300 border border-red-900">{monsters.length} 只怪物</span></div>
              </div>
               <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-xl overflow-hidden">
                  <div className="bg-red-900/20 p-4 border-b border-slate-700 flex items-center gap-2"><AlertTriangle className="text-red-500 w-5 h-5"/><h3 className="font-bold text-slate-100">威胁评估</h3></div>
                  <div className="p-5 space-y-6">
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-bold uppercase tracking-wider text-slate-400"><span>总伤害占玩家HP比例</span><span className="text-slate-200">{activePlayerStats.totalHP > 0 ? ((encounterStats.totalDPR / activePlayerStats.totalHP) * 100).toFixed(0) : 0}%</span></div>
                      <div className="h-4 bg-slate-700 rounded-full overflow-hidden relative"><div className={`absolute top-0 bottom-0 transition-all duration-500 ${ (activePlayerStats.totalHP > 0 && encounterStats.totalDPR / activePlayerStats.totalHP) > 0.8 ? 'bg-red-600' : (activePlayerStats.totalHP > 0 && encounterStats.totalDPR / activePlayerStats.totalHP) > 0.4 ? 'bg-amber-500' : 'bg-green-500'}`} style={{ width: `${Math.min(100, activePlayerStats.totalHP > 0 ? (encounterStats.totalDPR / activePlayerStats.totalHP) * 100 : 0)}%` }}></div></div>
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                       <div className={`p-3 rounded border text-sm ${ encounterStats.totalDPR >= activePlayerStats.totalHP ? 'bg-red-950/30 border-red-500/30 text-red-200' : 'bg-slate-900 border-slate-700 text-slate-400'}`}><span className="font-bold block mb-1">压力测试:</span>{encounterStats.totalDPR >= activePlayerStats.totalHP ? "💀 极度致命！怪物群一轮集火可秒杀一名玩家。" : encounterStats.totalDPR >= activePlayerStats.totalHP / 2 ? "⚠️ 高压。需要坦克职业或强力治疗来维持。" : "✅ 安全。玩家可以轻松应对这群怪物。"}</div>
                       <div className={`p-3 rounded border text-sm ${ encounterStats.highestMaxDamage >= activePlayerStats.totalHP ? 'bg-orange-950/30 border-orange-500/30 text-orange-200' : 'bg-green-950/30 border-green-500/30 text-green-200'}`}><span className="font-bold block mb-1 flex items-center gap-2">{encounterStats.highestMaxDamage >= activePlayerStats.totalHP ? <Zap className="w-3 h-3"/> : <Shield className="w-3 h-3"/>} 一击必杀风险 ({encounterStats.bossName}):</span>{encounterStats.highestMaxDamage >= activePlayerStats.totalHP ? `警告！${encounterStats.bossName} 的单次爆发 (${encounterStats.highestMaxDamage}) 足以直接打倒满血玩家。` : `安全。场上爆发最高的 ${encounterStats.bossName} 无法一击秒杀玩家。`}</div>
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