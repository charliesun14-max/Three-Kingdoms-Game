"""Unreal Editor (5.3+) script: place a region exported by tools/unreal/export-world.mjs.

Tools > Execute Python Script... and pick this file (Python Editor Script Plugin must be enabled).
It asks nothing: edit the three settings below first.

  REGION_DIR  folder written by the exporter, e.g. C:/Projects/Mandate/export/unreal/zhuo
  ASSET_MAP   JSON mapping game names to Unreal assets (see asset_map.example.json next to this file)
  MAX_TREES   trees are spawned as individual actors; above a few thousand use the PCG route in
              docs/UNREAL_MIGRATION.md instead (it reads trees.csv as a DataTable) and set this to 0.

Coordinates in the CSVs are already Unreal centimetres (X, Y, Z) and yaw in degrees.
"""
import csv
import json
import os
import unreal

REGION_DIR = r"C:/Projects/Mandate/export/unreal/zhuo"
ASSET_MAP = os.path.join(os.path.dirname(__file__), "asset_map.json")
MAX_TREES = 3000

actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
cache = {}


def asset(path):
    if not path:
        return None
    if path not in cache:
        cache[path] = unreal.EditorAssetLibrary.load_asset(path)
        if cache[path] is None:
            unreal.log_warning("asset not found: " + path)
    return cache[path]


def place(mesh, x, y, z, yaw, scale, folder, label):
    a = actors.spawn_actor_from_object(mesh, unreal.Vector(x, y, z), unreal.Rotator(0.0, 0.0, yaw))
    if a:
        a.set_actor_scale3d(unreal.Vector(scale, scale, scale))
        a.set_folder_path(folder)
        a.set_actor_label(label)
    return a


def rows(name):
    with open(os.path.join(REGION_DIR, name), newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def main():
    amap = json.load(open(ASSET_MAP, encoding="utf-8")) if os.path.exists(ASSET_MAP) else {}
    region = os.path.basename(os.path.normpath(REGION_DIR))
    missing = {}
    trees = rows("trees.csv")[:MAX_TREES] if MAX_TREES else []
    placements = rows("placements.csv")
    total = len(trees) + len(placements)
    with unreal.ScopedSlowTask(total, "Placing " + region) as task:
        task.make_dialog(True)
        for i, t in enumerate(trees):
            if task.should_cancel():
                return
            task.enter_progress_frame(1)
            m = asset(amap.get("trees", {}).get(t["Species"]))
            if m is None:
                missing["tree:" + t["Species"]] = missing.get("tree:" + t["Species"], 0) + 1
                continue
            place(m, float(t["X"]), float(t["Y"]), float(t["Z"]), float(t["Yaw"]), float(t["Scale"]), region + "/Trees/" + t["Species"], t["Species"] + "_" + str(i))
        for i, p in enumerate(placements):
            if task.should_cancel():
                return
            task.enter_progress_frame(1)
            kind, name = p["Type"], p["Asset"]
            if kind == "spot":
                # named story/NPC spots become target points, so quests can be rebuilt on them
                tp = actors.spawn_actor_from_class(unreal.TargetPoint, unreal.Vector(float(p["X"]), float(p["Y"]), float(p["Z"])), unreal.Rotator(0.0, 0.0, float(p["Yaw"])))
                tp.set_actor_label(name)
                tp.set_folder_path(region + "/Spots")
                continue
            m = asset(amap.get(kind, {}).get(name))
            if m is None:
                missing[kind + ":" + name] = missing.get(kind + ":" + name, 0) + 1
                continue
            place(m, float(p["X"]), float(p["Y"]), float(p["Z"]), float(p["Yaw"]), float(p["Scale"]), region + "/" + kind, name + "_" + str(i))
    for k, n in sorted(missing.items()):
        unreal.log_warning("no asset mapped for %s (%d placements) - add it to %s" % (k, n, ASSET_MAP))
    unreal.log("Placed region " + region)


main()
