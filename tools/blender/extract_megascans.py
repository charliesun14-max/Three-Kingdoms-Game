# Blender (4.x) background script: pull single assets out of a big Megascans scene FBX.
#   blender -b --factory-startup --python extract_megascans.py -- scene.fbx out_dir spec.json
# spec.json: [{"key": "well", "mat": "MI_Old_Stone_Well", "lods": [0, 2], "var": 0,
#              "merge": ["MI_Old_Well_Crank", "MI_Japanese_Wooden_Well_Roof"]}, ...]
# Each asset's group (an empty holding LOD0..LODn meshes) is exported per LOD as <key>_lod<n>.glb,
# moved to the origin with its placement yaw removed. "merge" pulls in the nearest group of each
# listed material (e.g. a well's crank and roof) keeping their placement relative to the main one.
import bpy, sys, json, os, re, math
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index('--') + 1:]
scene_path, out_dir, spec_path = argv[:3]
spec = json.load(open(spec_path))
os.makedirs(out_dir, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=scene_path)
src = bpy.context.scene

def mat_of(o):
    return o.data.materials[0].name if o.type == 'MESH' and o.data.materials and o.data.materials[0] else ''

# group -> {lod index: mesh}
groups = {}
for o in src.objects:
    if o.type != 'MESH' or not o.parent:
        continue
    m = re.search(r'_LOD(\d+)$', o.name)
    if not m:
        continue
    groups.setdefault(o.parent, {})[int(m.group(1))] = o

def groups_with(prefix):
    out = [g for g, lods in groups.items() if any(mat_of(o).startswith(prefix) for o in lods.values())]
    out.sort(key=lambda g: g.name)
    return out

def pick_lod(lods, n):
    if n in lods:
        return lods[n]
    k = min(lods, key=lambda i: abs(i - n))
    return lods[k]

report = []
for s in spec:
    cands = groups_with(s['mat'])
    if not cands:
        print('MISSING', s['key'], s['mat']); continue
    main = cands[min(s.get('var', 0), len(cands) - 1)]
    loc, rot, _ = main.matrix_world.decompose()
    yaw = rot.to_euler('XYZ').z
    to_origin = Matrix.Rotation(-yaw, 4, 'Z') @ Matrix.Translation(-loc)
    members = [main]
    for mp in s.get('merge', []):
        near = [g for g in groups_with(mp)]
        if near:
            g = min(near, key=lambda g: (g.matrix_world.translation - loc).length)
            if (g.matrix_world.translation - loc).length < s.get('mergeRadius', 4.0):
                members.append(g)
    for n in s.get('lods', [0]):
        # copies linked into a temporary collection of the open scene; only they are selected
        col = bpy.data.collections.new('exp')
        src.collection.children.link(col)
        for o in src.objects:
            o.select_set(False)
        verts = 0
        for g in members:
            o = pick_lod(groups[g], n)
            c = bpy.data.objects.new(f"{s['key']}_{o.name}", o.data)
            col.objects.link(c)
            c.matrix_world = to_origin @ o.matrix_world
            c.select_set(True)
            verts += len(o.data.vertices)
        path = os.path.join(out_dir, f"{s['key']}_lod{n}.glb")
        bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
                                  export_yup=True, export_materials='EXPORT', export_image_format='NONE')
        report.append(f"{s['key']}_lod{n}: {len(members)} part(s), {verts} verts")
        for c in list(col.objects):
            bpy.data.objects.remove(c, do_unlink=True)
        bpy.data.collections.remove(col)
print('\n'.join('DONE ' + r for r in report))
