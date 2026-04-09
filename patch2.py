import re
with open("backend/main.py", "r") as f:
    orig = f.read()
import patch

import inspect
new_methods = inspect.getsource(patch.process_frame) + "\n" + inspect.getsource(patch._save_detection)
# Add self indentation
new_methods = "    " + new_methods.replace("\n", "\n    ")

# Do regex replacement
pattern = re.compile(r'    def process_frame\(self, frame\):.*?(?=    def generate_mjpeg\(self\):)', re.DOTALL)
final_content = pattern.sub(new_methods.rstrip() + "\n\n", orig)
with open("backend/main.py", "w") as f:
    f.write(final_content)
