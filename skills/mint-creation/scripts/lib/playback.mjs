// Ordered capacity check, not an audio timeline or semantic/performance verification.
// Each line occurrence is estimated once. Greedy earliest allocation shares cut capacity
// and never schedules a later line before an earlier line finishes.
export function playbackProblems(ep, scriptEp, estimate) {
  const cuts = [], lines = [];
  for (const seg of ep?.segments ?? []) for (const [ci,cut] of (seg.cuts ?? []).entries()) {
    const index = cuts.length;
    cuts.push({...cut, id:`${seg.id}#${ci+1}`});
    const [a,b] = cut.beats ?? [];
    const flow = scriptEp?.scenes?.[seg.sceneIndex-1]?.flow ?? [];
    if (!Number.isInteger(a) || !Number.isInteger(b) || a<1 || b>flow.length || b<a) continue;
    for (let n=a;n<=b;n++) if (typeof flow[n-1]?.line === 'string') lines.push({position:[seg.sceneIndex,n],seconds:estimate(flow[n-1]),owner:index});
  }
  const capacity = cuts.map(c => Number.isFinite(c.seconds) && c.seconds > 0 ? c.seconds : 0);
  let frontier = 0;
  for (const line of lines) {
    if (!(Number.isFinite(line.seconds) && line.seconds > 0)) return ['台词估时无效'];
    const allowed = [line.owner];
    for (let j=line.owner+1;j<cuts.length;j++) if (cuts[j].audioRefs?.some(p => p[0]===line.position[0] && p[1]===line.position[1])) allowed.push(j);
    if (allowed.some((j,i) => i>0 && j!==allowed[i-1]+1))
      return [`E${ep.ep} ${cuts[line.owner].id} audioRefs 延续链不连续：同一次发声不能跳过未引用它的镜头`];
    let remaining = line.seconds;
    for (const j of allowed) {
      if (j < frontier) continue;
      const amount = Math.min(remaining,capacity[j]);
      if (amount > 0) { capacity[j] -= amount; remaining -= amount; frontier = j; }
      if (remaining <= 1e-8) break;
    }
    if (remaining > 1e-8) return [`E${ep.ep} ${cuts[line.owner].id} 台词 ${line.seconds.toFixed(2)} 秒装不进按正文顺序分配的认领与 audioRefs 镜头共享时长（缺少 ${remaining.toFixed(2)} 秒）`];
  }
  return [];
}
