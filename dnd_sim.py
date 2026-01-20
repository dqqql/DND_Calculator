import random
import time

class DndCombatSimulator:
    def __init__(self, iterations=100000):
        """
        初始化模拟器
        :param iterations: 模拟次数，次数越多越接近理论值 (默认10万次)
        """
        self.iterations = iterations

    def roll_d20(self, advantage_state='normal'):
        """
        模拟 d20 投掷，包含优劣势处理
        """
        r1 = random.randint(1, 20)
        r2 = random.randint(1, 20)

        if advantage_state == 'advantage':
            return max(r1, r2)
        elif advantage_state == 'disadvantage':
            return min(r1, r2)
        else:
            return r1

    def roll_damage(self, dice_count, dice_sides, is_crit=False):
        """
        模拟伤害骰投掷
        :param is_crit: 如果暴击，骰子数量翻倍
        """
        # 5e 规则：暴击时只翻倍骰子数量，不翻倍固定加值
        actual_dice_count = dice_count * 2 if is_crit else dice_count
        
        total = 0
        for _ in range(actual_dice_count):
            total += random.randint(1, dice_sides)
        return total

    def run_simulation(self, attack_bonus, target_ac, damage_dice_count, damage_dice_sides, damage_mod, advantage_state='normal'):
        """
        执行完整的战斗模拟
        """
        total_damage = 0
        hits = 0
        crits = 0
        misses = 0
        
        start_time = time.time()

        for _ in range(self.iterations):
            # 1. 命中检定
            d20_result = self.roll_d20(advantage_state)
            
            # 2. 判定结果
            is_hit = False
            is_crit = False

            # 自然 20 必中且暴击
            if d20_result == 20:
                is_hit = True
                is_crit = True
            # 自然 1 必失误
            elif d20_result == 1:
                is_hit = False
            # 常规命中判定
            else:
                if d20_result + attack_bonus >= target_ac:
                    is_hit = True
            
            # 3. 结算伤害
            turn_damage = 0
            if is_hit:
                if is_crit:
                    crits += 1
                else:
                    hits += 1
                
                # 投掷伤害骰 + 固定值
                dice_dmg = self.roll_damage(damage_dice_count, damage_dice_sides, is_crit)
                turn_damage = dice_dmg + damage_mod
            else:
                misses += 1
            
            total_damage += turn_damage

        end_time = time.time()

        # 4. 生成报告
        avg_damage = total_damage / self.iterations
        hit_rate_percent = ((hits + crits) / self.iterations) * 100
        crit_rate_percent = (crits / self.iterations) * 100
        
        return {
            "avg_damage": avg_damage,
            "hit_rate": hit_rate_percent,
            "crit_rate": crit_rate_percent,
            "duration": end_time - start_time
        }

# --- 测试用例 (Main Function) ---
if __name__ == "__main__":
    # 模拟场景：
    # 一个 5级战士，力量+4，手持巨剑 (2d6)
    # 攻击加值: +7 (+3熟练 +4力量)
    # 伤害: 2d6 + 4
    # 目标 AC: 15
    
    sim = DndCombatSimulator(iterations=100000) # 模拟 10 万次
    
    params = {
        "attack_bonus": 7,
        "target_ac": 15,
        "damage_dice_count": 2,
        "damage_dice_sides": 6,
        "damage_mod": 4,
        "advantage_state": "normal" # 可改为 'advantage' 或 'disadvantage'
    }

    print(f"\n🎲 开始蒙特卡洛模拟 (N={sim.iterations})...")
    print(f"配置: 攻击+{params['attack_bonus']} vs AC{params['target_ac']} | 伤害 {params['damage_dice_count']}d{params['damage_dice_sides']}+{params['damage_mod']}")
    
    result = sim.run_simulation(**params)
    
    print("-" * 30)
    print(f"📊 期望伤害 (DPR): {result['avg_damage']:.4f}")
    print(f"🎯 实际命中率:    {result['hit_rate']:.2f}%")
    print(f"💥 实际暴击率:    {result['crit_rate']:.2f}%")
    print(f"⏱️ 耗时:          {result['duration']:.4f} 秒")
    print("-" * 30)
    
    # 理论值验证 (用于对比)
    # 命中需求: 15 - 7 = 8 (骰出 8~20 命中，共13个数), 概率 13/20 = 65%
    # 暴击: 5%
    # 普通伤害均值: 2*3.5 + 4 = 11
    # 暴击额外伤害: 2*3.5 = 7
    # 理论DPR = (0.65 * 11) + (0.05 * 7) = 7.15 + 0.35 = 7.50
    print(f"🧮 数学理论值:    7.5000 (对比验证)")