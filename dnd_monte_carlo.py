import random
import time
from flask import Flask, request, jsonify, make_response
from flask_cors import CORS

class DndCombatSimulator:
    def __init__(self, iterations=100000):
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

    def run_simulation(self, attack_bonus, target_ac, damage_dice_count, damage_dice_sides, damage_mod, advantage_state='normal', iterations=None):
        current_iterations = iterations if iterations else self.iterations
        total_damage = 0
        hits = 0
        crits = 0
        misses = 0
        
        start_time = time.time()

        for _ in range(current_iterations):
            d20_result = self.roll_d20(advantage_state)
            is_hit = False
            is_crit = False

            if d20_result == 20:
                is_hit = True
                is_crit = True
            elif d20_result == 1:
                is_hit = False
            else:
                if d20_result + attack_bonus >= target_ac:
                    is_hit = True
            
            turn_damage = 0
            if is_hit:
                if is_crit:
                    crits += 1
                else:
                    hits += 1
                dice_dmg = self.roll_damage(damage_dice_count, damage_dice_sides, is_crit)
                turn_damage = dice_dmg + damage_mod
            else:
                misses += 1
            
            total_damage += turn_damage

        end_time = time.time()

        return {
            "avg_damage": total_damage / current_iterations,
            "hit_rate": ((hits + crits) / current_iterations) * 100,
            "crit_rate": (crits / current_iterations) * 100,
            "duration": end_time - start_time,
            "iterations": current_iterations
        }

# --- Flask API 配置 ---
app = Flask(__name__)
# 允许所有来源跨域，支持凭证
CORS(app, resources={r"/*": {"origins": "*"}})

# 辅助函数：为响应添加 CORS 头
def _build_cors_preflight_response():
    response = make_response()
    response.headers.add("Access-Control-Allow-Origin", "*")
    response.headers.add("Access-Control-Allow-Headers", "Content-Type")
    response.headers.add("Access-Control-Allow-Methods", "POST, OPTIONS")
    return response

def _corsify_actual_response(response):
    response.headers.add("Access-Control-Allow-Origin", "*")
    return response

@app.route('/api/simulate', methods=['POST', 'OPTIONS'])
def handle_simulation():
    # 1. 显式处理 OPTIONS 预检请求
    if request.method == 'OPTIONS':
        return _build_cors_preflight_response()

    # 2. 处理 POST 请求
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
        
        # 返回结果并附加 CORS 头
        return _corsify_actual_response(jsonify(result))

    except Exception as e:
        return _corsify_actual_response(jsonify({"error": str(e)})), 500

if __name__ == "__main__":
    print("🔥 D&D 模拟计算引擎已启动 (CORS 增强版)...")
    print("🌍 服务运行在: http://127.0.0.1:5000")
    app.run(port=5000, debug=True)