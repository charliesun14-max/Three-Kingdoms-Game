// Spawners for recurring historical characters.
import { FIGURES } from '../entities/Humanoid.js';

export const HERO = (extra = {}) => ({ archetype: 'hero', fighter: true, mode: 'idle', aggroRange: 30, ...extra });

export function liuBei(st, x, z, extra = {}) {
  return st.actor('liuBei', { figure: 'liuBei', name: 'Liu Bei', cn: '劉備', title: 'Xuande 玄德', x, z, weapon: 'twinSwords', body: extra.body, stats: { str: 12, agi: 13, vit: 14, blade: 14, block: 12 }, hp: 260, ...extra });
}
export function guanYu(st, x, z, extra = {}) {
  return st.actor('guanYu', { figure: 'guanYu', name: 'Guan Yu', cn: '關羽', title: 'Yunchang 雲長', x, z, weapon: 'guandao', stats: { str: 18, agi: 12, vit: 18, polearm: 18, block: 14 }, hp: 400, ...extra });
}
export function zhangFei(st, x, z, extra = {}) {
  return st.actor('zhangFei', { figure: 'zhangFei', name: 'Zhang Fei', cn: '張飛', title: 'Yide 翼德', x, z, weapon: 'serpentSpear', stats: { str: 19, agi: 11, vit: 18, polearm: 17, block: 12 }, hp: 400, ...extra });
}
// The three brothers standing together, idle.
export function brothers(st, x, z, yaw = 0) {
  const lb = liuBei(st, x, z), gy = guanYu(st, x - 1.6, z + 0.6), zf = zhangFei(st, x + 1.6, z + 0.6);
  for (const c of [lb, gy, zf]) { c.ai.mode = 'idle'; c.yaw = yaw; c.faceYaw = yaw; }
  return { lb, gy, zf };
}
// Make cast members fight alongside the player.
export function joinFight(list, leader, aggro = 30) {
  list.forEach((c, i) => {
    c.ai.passive = false; c.ai.fighter = true; c.ai.aggroRange = aggro;
    c.ai.mode = 'follow'; c.ai.leader = leader; c.ai.formation = [(i - (list.length - 1) / 2) * 2.2, -2.5];
    c.faction = 'militia';
  });
}
export function standDown(list) {
  for (const c of list) { c.ai.passive = true; c.combat.target = null; c.ai.mode = 'idle'; c.draw(false); }
}
export { FIGURES };
