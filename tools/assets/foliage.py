"""Prepare foliage sources for tools/assets/build-assets.mjs (outputs go to assets-src/.build/veg/).

1. Convert the mobile tree pack's ASCII FBX with assimp (Blender can't read ASCII FBX):
     assimp export ".../Mobile Trees Model/<tree>.fbx" assets-src/.build/veg/mobile_tree.glb -fglb2
2. Split the grass & vegetation mix into single plants:
     blender -b --factory-startup --python tools/blender/export_objects.py -- <mix>.fbx assets-src/.build/veg \
       <bush object>=gv_bush <flower object>=gv_flower
3. Convert the mobile tree TGA textures to PNG (this script):
     python3 tools/assets/foliage.py
"""
from PIL import Image
import os

M = 'assets-src/downloaded/Mobile_Trees_Model-87f57389/fbx/mobile_trees_model_extracted/Mobile Trees Model/Textures/'
O = 'assets-src/.build/veg/'
os.makedirs(O, exist_ok=True)
for n in ['T_Mobile_Trees_Leaf', 'T_Mobile_Trees_Trunk', 'T_Mobile_Trees_Trunk_normal']:
    Image.open(M + n + '.TGA').save(O + n + '.png')
print('foliage textures ready')
