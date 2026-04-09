import re

with open("backend/main.py", "r") as f:
    orig = f.read()

def get_stats(self):
    """Return current stats based on active detection modes."""
    with self.stats_lock:
        modes = self.active_modes
        combined_stats = {}
        if "emotion" in modes:
            if self.total_confidence > 0:
                data = {k: float(round(v / self.total_confidence * 100, 1))
                        for k, v in self.emotion_stats.items()}
            else:
                data = {k: 0.0 for k in self.emotion_stats}
            if 'surprise' in data:
                data['surprised'] = data.pop('surprise')
            combined_stats.update(data)
        if "sleeping" in modes:
            total = self.sleeping_stats["drowsy"] + self.sleeping_stats["alert"]
            combined_stats.update({
                "drowsy": round(self.sleeping_stats["drowsy"] / total * 100, 1) if total > 0 else 0,
                "alert": round(self.sleeping_stats["alert"] / total * 100, 1) if total > 0 else 0
            })
        if "phone" in modes:
            total = self.phone_stats["phone"] + self.phone_stats["no_phone"]
            combined_stats.update({
                "phone": round(self.phone_stats["phone"] / total * 100, 1) if total > 0 else 0,
                "no_phone": round(self.phone_stats["no_phone"] / total * 100, 1) if total > 0 else 0
            })
        if "hand" in modes:
            total = self.hand_stats["up"] + self.hand_stats["down"]
            combined_stats.update({
                "up": round(self.hand_stats["up"] / total * 100, 1) if total > 0 else 0,
                "down": round(self.hand_stats["down"] / total * 100, 1) if total > 0 else 0
            })
        if "cigarette" in modes:
            total = self.cigarette_stats["cigarette"] + self.cigarette_stats["no_cigarette"]
            combined_stats.update({
                "cigarette": round(self.cigarette_stats["cigarette"] / total * 100, 1) if total > 0 else 0,
                "no_cigarette": round(self.cigarette_stats["no_cigarette"] / total * 100, 1) if total > 0 else 0
            })
        if "gun" in modes:
            total = self.gun_stats["gun"] + self.gun_stats["no_gun"]
            combined_stats.update({
                "gun": round(self.gun_stats["gun"] / total * 100, 1) if total > 0 else 0,
                "no_gun": round(self.gun_stats["no_gun"] / total * 100, 1) if total > 0 else 0
            })
        return combined_stats

import inspect
new_method = inspect.getsource(get_stats)
new_method = "    " + new_method.replace("\n", "\n    ")

pattern = re.compile(r'    def get_stats\(self\):.*?(?=    def reset_stats\(self\):)', re.DOTALL)
final_content = pattern.sub(new_method.rstrip() + "\n\n", orig)
with open("backend/main.py", "w") as f:
    f.write(final_content)
