import random
import time
from flask import Flask, request, jsonify, make_response
from flask_cors import CORS

class DndCombatSimulator:
    def __init__(self, iterations=10000):
        self.iterations = iterations

    def roll_d20(self, advantage_state='normal'):
        r1 = random.randint(1, 20)
        r2 = random.randint(1, 20)
        if advantage_state == 'advantage':
            return max(r1, r2)
        elif advantage_state == 'disadvantage':
            return min(r1, r2)
        else:
            return r1

    def roll_damage(self, dice_count, dice_sides, is_crit=False):
        actual_dice_count = dice_count * 2 if is_crit else dice_count
        total = 0
        for _ in range(actual_dice_count):
            total += random.randint(1, dice_sides)
        return total

    def resolve_one_attack(self, attacker, target_ac, target_save):
        """结算单次攻击造成的伤害"""
        damage = 0
        
        # 攻击次数循环
        for _ in range(attacker.get('attacksPerRound', 1)):
            # 1. 物理攻击逻辑
            if attacker.get('attackType') == 'attack':
                d20 = self.roll_d20(attacker.get('advantageState', 'normal'))
                
                is_hit = False
                is_crit = False
                
                if d20 == 20:
                    is_hit = True
                    is_crit = True
                elif d20 == 1:
                    is_hit = False
                else:
                    if d20 + attacker.get('attackBonus', 0) >= target_ac:
                        is_hit = True
                
                if is_hit:
                    dmg = self.roll_damage(
                        attacker.get('diceCount', 1), 
                        attacker.get('diceType', 6), 
                        is_crit
                    )
                    damage += dmg + attacker.get('damageMod', 0)

            # 2. 法术豁免逻辑
            else:
                # 目标豁免投掷 (这里简化为目标平骰，无优劣势)
                save_roll = random.randint(1, 20)
                save_total = save_roll + target_save
                
                dc = attacker.get('saveDC', 10)
                dmg_roll = self.roll_damage(
                    attacker.get('diceCount', 1), 
                    attacker.get('diceType', 6), 
                    False # 豁免通常无暴击
                )
                dmg_total = dmg_roll + attacker.get('damageMod', 0)

                if save_total >= dc:
                    # 豁免成功
                    if attacker.get('halfOnSave', False):
                        damage += int(dmg_total / 2) # 向下取整
                else:
                    # 豁免失败
                    damage += dmg_total
                    
        return damage

    def run_encounter_simulation(self, team_a, team_b, iterations=10000):
        """
        模拟团战：Team A (Players) vs Team B (Monsters)
        采用血池模式简化计算
        """
        team_a_wins = 0
        total_rounds = 0
        
        # 预计算总血量
        initial_hp_a = sum([u.get('hp', 10) for u in team_a])
        initial_hp_b = sum([u.get('hp', 10) for u in team_b])
        
        # 获取对抗属性 (这里取平均值简化，或者由前端传入)
        # 为简化模拟，我们假设每个单位攻击的是对方的"平均AC/豁免"
        # 实际上应该传入前端计算好的 targetStats
        target_ac_a = team_a[0].get('ac', 15) if team_a else 10 # 怪物打玩家对抗的AC
        target_save_a = team_a[0].get('saveBonus', 0) if team_a else 0
        
        target_ac_b = team_b[0].get('ac', 15) if team_b else 10 # 玩家打怪物对抗的AC
        target_save_b = team_b[0].get('saveBonus', 0) if team_b else 0

        start_time = time.time()

        for _ in range(iterations):
            hp_a = initial_hp_a
            hp_b = initial_hp_b
            rounds = 0
            
            # 战斗循环 (最大 50 轮防止死循环)
            while hp_a > 0 and hp_b > 0 and rounds < 50:
                rounds += 1
                
                # 1. 玩家回合：所有玩家攻击
                dmg_to_b = 0
                for unit in team_a:
                    dmg_to_b += self.resolve_one_attack(unit, target_ac_b, target_save_b)
                hp_b -= dmg_to_b
                
                if hp_b <= 0:
                    team_a_wins += 1
                    break
                
                # 2. 怪物回合：所有怪物攻击
                dmg_to_a = 0
                for unit in team_b:
                    dmg_to_a += self.resolve_one_attack(unit, target_ac_a, target_save_a)
                hp_a -= dmg_to_a
            
            total_rounds += rounds

        end_time = time.time()
        
        return {
            "win_rate": (team_a_wins / iterations) * 100,
            "avg_rounds": total_rounds / iterations,
            "iterations": iterations,
            "duration": end_time - start_time
        }

    def run_simulation(self, attack_bonus, target_ac, damage_dice_count, damage_dice_sides, damage_mod, advantage_state='normal', iterations=None):
        # ... (保留单体模拟逻辑，兼容旧接口) ...
        current_iterations = iterations if iterations else self.iterations
        total_damage = 0
        hits = 0
        crits = 0
        
        start_time = time.time()
        for _ in range(current_iterations):
            d20_result = self.roll_d20(advantage_state)
            is_hit = False
            is_crit = False
            if d20_result == 20:
                is_hit = True; is_crit = True
            elif d20_result == 1:
                is_hit = False
            else:
                if d20_result + attack_bonus >= target_ac: is_hit = True
            
            turn_damage = 0
            if is_hit:
                if is_crit: crits += 1
                else: hits += 1
                dice_dmg = self.roll_damage(damage_dice_count, damage_dice_sides, is_crit)
                turn_damage = dice_dmg + damage_mod
            total_damage += turn_damage
        end_time = time.time()

        return {
            "avg_damage": total_damage / current_iterations,
            "hit_rate": ((hits + crits) / current_iterations) * 100,
            "crit_rate": (crits / current_iterations) * 100,
            "duration": end_time - start_time,
            "iterations": current_iterations
        }

# --- Flask API ---
app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

def _build_cors_preflight_response():
    response = make_response()
    response.headers.add("Access-Control-Allow-Origin", "*")
    response.headers.add("Access-Control-Allow-Headers", "Content-Type")
    response.headers.add("Access-Control-Allow-Methods", "POST, OPTIONS")
    return response

def _corsify_actual_response(response):
    response.headers.add("Access-Control-Allow-Origin", "*")
    return response

# 1. 单体模拟接口
@app.route('/api/simulate', methods=['POST', 'OPTIONS'])
def handle_simulation():
    if request.method == 'OPTIONS': return _build_cors_preflight_response()
    try:
        data = request.json
        params = {
            "attack_bonus": int(data.get('attackBonus', 0)),
            "target_ac": int(data.get('targetAC', 10)),
            "damage_dice_count": int(data.get('diceCount', 1)),
            "damage_dice_sides": int(data.get('diceType', 6)),
            "damage_mod": int(data.get('damageMod', 0)),
            "advantage_state": data.get('advantageState', 'normal'),
            "iterations": int(data.get('iterations', 100000))
        }
        sim = DndCombatSimulator()
        result = sim.run_simulation(**params)
        return _corsify_actual_response(jsonify(result))
    except Exception as e:
        return _corsify_actual_response(jsonify({"error": str(e)})), 500

# 2. 遭遇战模拟接口 (新增)
@app.route('/api/simulate-encounter', methods=['POST', 'OPTIONS'])
def handle_encounter_simulation():
    if request.method == 'OPTIONS': return _build_cors_preflight_response()
    try:
        data = request.json
        team_a = data.get('teamA', [])
        team_b = data.get('teamB', [])
        # 为了更准确，前端应该把对方的平均AC传过来，这里简化处理，假设前端数据已经包含必要信息
        # 或者我们可以在 Python 里直接用 Unit 对象里的属性
        
        sim = DndCombatSimulator()
        result = sim.run_encounter_simulation(team_a, team_b, iterations=10000) # 团战模拟1万次足够
        return _corsify_actual_response(jsonify(result))
    except Exception as e:
        print(e)
        return _corsify_actual_response(jsonify({"error": str(e)})), 500

if __name__ == "__main__":
    print("🔥 D&D 模拟计算引擎已启动 (v2.0 团战版)...")
    app.run(port=5000, debug=True)